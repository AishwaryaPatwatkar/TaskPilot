"""
Worker logic tests.

Tests the execution, retry, and dead-lettering behaviour without running
the scheduler loop — just calls the internals directly with a real DB session.
"""

import json
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task
from app.worker import _execute_task, _process_task
from tests.conftest import TestSessionLocal


async def _insert_task(session: AsyncSession, **kwargs) -> Task:
    """Helper to insert a task already in 'running' state (as _poll_once would claim it)."""
    defaults = {
        "title": "Worker test task",
        "payload": json.dumps({}),
        "scheduled_at": datetime.now(timezone.utc),
        "status": "running",   # _poll_once commits status=running before dispatching
        "retry_count": 0,
    }
    defaults.update(kwargs)
    task = Task(**defaults)
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task


class TestExecuteTask:
    async def test_succeeds_without_force_fail(self):
        """Normal task completes without raising."""
        task = Task(payload=json.dumps({"key": "value"}))
        # Should not raise
        await _execute_task(task)

    async def test_force_fail_raises(self):
        task = Task(payload=json.dumps({"force_fail": True}))
        with pytest.raises(RuntimeError, match="force_fail"):
            await _execute_task(task)

    async def test_force_fail_false_does_not_raise(self):
        task = Task(payload=json.dumps({"force_fail": False}))
        await _execute_task(task)

    async def test_invalid_json_payload_treated_as_empty(self):
        """Malformed payload should not crash the worker — treated as {}."""
        task = Task(payload="not-json")
        await _execute_task(task)  # no force_fail → succeeds


class TestProcessTask:
    async def test_successful_task_marked_succeeded(self):
        async with TestSessionLocal() as session:
            task = await _insert_task(session, payload=json.dumps({}))
            task_id = task.id

        async with TestSessionLocal() as session:
            await _process_task(task_id, session)

        async with TestSessionLocal() as session:
            result = await session.get(Task, task_id)
            assert result.status == "succeeded"
            assert result.last_error is None

    async def test_force_fail_task_increments_retry_count(self):
        async with TestSessionLocal() as session:
            task = await _insert_task(
                session, payload=json.dumps({"force_fail": True})
            )
            task_id = task.id

        async with TestSessionLocal() as session:
            await _process_task(task_id, session)

        async with TestSessionLocal() as session:
            result = await session.get(Task, task_id)
            assert result.status == "pending"  # back to pending for retry
            assert result.retry_count == 1
            assert result.last_error is not None
            # scheduled_at should be in the future (backoff)
            assert result.scheduled_at > datetime.now(timezone.utc)

    async def test_exhausted_retries_marks_dead(self):
        """A task at MAX_RETRIES - 1 should become dead after one more failure."""
        from app.config import settings

        async with TestSessionLocal() as session:
            task = await _insert_task(
                session,
                payload=json.dumps({"force_fail": True}),
                retry_count=settings.max_retries - 1,
            )
            task_id = task.id

        async with TestSessionLocal() as session:
            await _process_task(task_id, session)

        async with TestSessionLocal() as session:
            result = await session.get(Task, task_id)
            assert result.status == "dead"
            assert result.retry_count == settings.max_retries

    async def test_already_processed_task_is_skipped(self):
        """If a task was already processed by another replica (e.g. succeeded), skip it."""
        async with TestSessionLocal() as session:
            task = await _insert_task(session, status="succeeded")
            task_id = task.id

        async with TestSessionLocal() as session:
            # Should return without error or status change
            await _process_task(task_id, session)

        async with TestSessionLocal() as session:
            result = await session.get(Task, task_id)
            # Still succeeded — not re-processed
            assert result.status == "succeeded"
