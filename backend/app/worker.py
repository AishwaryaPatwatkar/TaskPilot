"""
Background worker — polls for due tasks every WORKER_POLL_INTERVAL seconds.

Concurrency strategy:
  SELECT … FOR UPDATE SKIP LOCKED claims rows atomically so that if multiple
  worker replicas run, each row is processed exactly once.

Retry / backoff:
  Exponential backoff: next_run = now + 60 * 2^retry_count seconds.
  After MAX_RETRIES failures the task is marked 'dead' and never retried.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import Task

logger = logging.getLogger("taskpilot.worker")

_BATCH_SIZE = 10


async def _execute_task(task: Task) -> None:
    """
    Simulate task execution.

    Rules (from spec §5.1):
      - payload contains {"force_fail": true}  → raise to trigger retry/DLQ
      - otherwise                              → succeed after a short sleep
    """
    try:
        payload = json.loads(task.payload)
    except json.JSONDecodeError:
        payload = {}

    if payload.get("force_fail"):
        raise RuntimeError("Forced failure (force_fail=true in payload)")

    await asyncio.sleep(0.5)  # simulate I/O work


async def _process_task(task_id, session: AsyncSession) -> None:
    """Execute a single claimed (running) task, handling retries and dead-lettering."""
    # Re-fetch with a row lock to prevent double-execution if replicas race
    result = await session.execute(
        select(Task).where(Task.id == task_id).with_for_update()
    )
    task = result.scalar_one_or_none()
    if task is None or task.status != "running":
        # Already processed by another replica or in an unexpected state
        return

    try:
        await _execute_task(task)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Task %s failed: %s", task.id, exc)
        await session.refresh(task)
        task.last_error = str(exc)
        new_retry_count = task.retry_count + 1

        if new_retry_count >= settings.max_retries:
            task.status = "dead"
            task.retry_count = new_retry_count
            logger.error("Task %s exhausted retries — marked dead", task.id)
        else:
            # Exponential backoff: 60s, 120s, 240s …
            delay_seconds = 60 * (2**new_retry_count)
            task.status = "pending"
            task.retry_count = new_retry_count
            task.scheduled_at = datetime.now(timezone.utc) + timedelta(
                seconds=delay_seconds
            )
            logger.info(
                "Task %s will retry (#%d) in %ds",
                task.id,
                new_retry_count,
                delay_seconds,
            )
    else:
        await session.refresh(task)
        task.status = "succeeded"
        logger.info("Task %s succeeded", task.id)

    task.updated_at = datetime.now(timezone.utc)
    await session.commit()


async def _poll_once() -> None:
    """Fetch a batch of due pending tasks and process them concurrently."""
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        # FOR UPDATE SKIP LOCKED: atomically claim rows; skip any already
        # locked by another worker replica so we never double-process.
        result = await session.execute(
            select(Task)
            .where(Task.status == "pending", Task.scheduled_at <= now)
            .order_by(Task.scheduled_at)
            .limit(_BATCH_SIZE)
            .with_for_update(skip_locked=True)
        )
        tasks = result.scalars().all()

        if not tasks:
            return

        logger.info("Worker claiming %d task(s)", len(tasks))

        # Mark all as running inside this transaction to hold the locks
        task_ids = []
        for task in tasks:
            task.status = "running"
            task.updated_at = now
            task_ids.append(task.id)

        await session.commit()

    # Process each claimed task in its own session.
    # We create coroutines here; asyncio.gather runs them concurrently.
    async def _run_one(task_id):
        async with AsyncSessionLocal() as session:
            await _process_task(task_id, session)

    await asyncio.gather(*[_run_one(tid) for tid in task_ids])


async def run_worker() -> None:
    """
    Main worker loop. Runs until the asyncio task is cancelled (graceful shutdown).
    """
    logger.info(
        "Worker started — polling every %ds", settings.worker_poll_interval
    )
    while True:
        try:
            await _poll_once()
        except asyncio.CancelledError:
            logger.info("Worker shutting down")
            raise
        except Exception:
            logger.exception("Unexpected error in worker poll — continuing")

        await asyncio.sleep(settings.worker_poll_interval)
