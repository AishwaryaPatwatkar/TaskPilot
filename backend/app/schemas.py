import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

# ── Status enum (as a Literal for simplicity) ────────────────────────────────

TaskStatus = Literal["pending", "running", "succeeded", "failed", "dead"]

# Max payload size: 64 KB of JSON text is generous for a task payload.
_MAX_PAYLOAD_BYTES = 65_536


# ── Request models ────────────────────────────────────────────────────────────


class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    payload: dict[str, Any] = Field(default_factory=dict)
    scheduled_at: datetime | None = Field(
        default=None,
        description="UTC datetime when the task may first be picked up. Defaults to now.",
    )

    @field_validator("payload")
    @classmethod
    def validate_payload_size(cls, v: dict) -> dict:
        import json

        raw = json.dumps(v)
        if len(raw.encode()) > _MAX_PAYLOAD_BYTES:
            raise ValueError(
                f"payload exceeds maximum size of {_MAX_PAYLOAD_BYTES} bytes"
            )
        return v


class TaskStatusPatch(BaseModel):
    status: TaskStatus


# ── Response models ───────────────────────────────────────────────────────────


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    payload: dict[str, Any]
    scheduled_at: datetime
    status: TaskStatus
    retry_count: int
    created_at: datetime
    updated_at: datetime
    last_error: str | None

    model_config = {"from_attributes": True}

    @field_validator("payload", mode="before")
    @classmethod
    def parse_payload(cls, v: Any) -> Any:
        """The DB stores payload as a JSON string; parse it on the way out."""
        if isinstance(v, str):
            import json

            return json.loads(v)
        return v


class PaginatedTasks(BaseModel):
    items: list[TaskResponse]
    total: int
    page: int
    page_size: int


# ── Error envelope ────────────────────────────────────────────────────────────


class ErrorDetail(BaseModel):
    message: str
    code: str | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
