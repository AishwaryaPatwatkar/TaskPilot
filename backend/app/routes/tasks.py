import json
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_auth
from app.database import get_session
from app.models import Task
from app.schemas import (
    ErrorDetail,
    ErrorResponse,
    PaginatedTasks,
    TaskCreate,
    TaskResponse,
    TaskStatus,
    TaskStatusPatch,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])

# ── State machine ─────────────────────────────────────────────────────────────
#
# Allowed manual transitions via PATCH /tasks/{id}/status.
# Worker transitions (pending→running, running→succeeded/failed/dead)
# are handled internally by the worker and not via this endpoint.
#
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "pending": {"running"},
    "running": {"succeeded", "failed"},
    "failed": {"pending"},  # manual re-queue
    "succeeded": set(),     # terminal
    "dead": set(),          # terminal
}


def _serialize_payload(payload: dict) -> str:
    return json.dumps(payload)


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    responses={422: {"model": ErrorResponse}},
)
async def create_task(
    body: TaskCreate,
    session: AsyncSession = Depends(get_session),
    _: str = Depends(require_auth),
) -> TaskResponse:
    """Create a new task."""
    scheduled_at = body.scheduled_at or datetime.now(timezone.utc)

    task = Task(
        title=body.title,
        payload=_serialize_payload(body.payload),
        scheduled_at=scheduled_at,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return TaskResponse.model_validate(task)


@router.get(
    "",
    response_model=PaginatedTasks,
)
async def list_tasks(
    session: AsyncSession = Depends(get_session),
    _: str = Depends(require_auth),
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
) -> PaginatedTasks:
    """List tasks with optional status filter and pagination."""
    base_q = select(Task)
    count_q = select(func.count()).select_from(Task)

    if status_filter:
        base_q = base_q.where(Task.status == status_filter)
        count_q = count_q.where(Task.status == status_filter)

    total_result = await session.execute(count_q)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    result = await session.execute(
        base_q.order_by(Task.created_at.desc()).offset(offset).limit(page_size)
    )
    tasks = result.scalars().all()

    return PaginatedTasks(
        items=[TaskResponse.model_validate(t) for t in tasks],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    responses={404: {"model": ErrorResponse}},
)
async def get_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: str = Depends(require_auth),
) -> TaskResponse:
    """Fetch a single task by ID."""
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    return TaskResponse.model_validate(task)


@router.patch(
    "/{task_id}/status",
    response_model=TaskResponse,
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
async def update_task_status(
    task_id: uuid.UUID,
    body: TaskStatusPatch,
    session: AsyncSession = Depends(get_session),
    _: str = Depends(require_auth),
) -> TaskResponse:
    """
    Update task status.

    Enforces the state machine — returns 409 for invalid transitions.
    """
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    current = task.status
    target = body.status

    if target not in ALLOWED_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Transition '{current}' → '{target}' is not allowed. "
                f"Allowed: {sorted(ALLOWED_TRANSITIONS.get(current, set()))}"
            ),
        )

    task.status = target
    task.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(task)
    return TaskResponse.model_validate(task)


@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={404: {"model": ErrorResponse}},
)
async def delete_task(
    task_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: str = Depends(require_auth),
) -> None:
    """Delete a task."""
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    await session.delete(task)
    await session.commit()
