import asyncio
import logging
import logging.config
import os

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.middleware import RequestLoggingMiddleware
from app.routes.health import router as health_router
from app.routes.tasks import router as tasks_router
from app.worker import run_worker

# ── Logging setup ─────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

# ── App factory ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="TaskPilot",
    description="Background job scheduler with retry and dead-letter support.",
    version="1.0.0",
)

# CORS — allow the Next.js frontend (and Swagger UI) to reach the API from
# the browser.  Origins are configurable via CORS_ORIGINS env var so that
# production can lock this down to a real domain.
_cors_origins_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:3001,http://localhost:3002",
)
ALLOWED_ORIGINS = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(health_router)
app.include_router(tasks_router)


# ── Global exception handlers ─────────────────────────────────────────────────


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a consistent error envelope for any unhandled exception.
    Never leaks a stack trace to the client."""
    logging.getLogger("taskpilot").exception("Unhandled error on %s", request.url)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": {"message": "Internal server error", "code": "internal_error"}},
    )


# ── Lifecycle ─────────────────────────────────────────────────────────────────

_worker_task: asyncio.Task | None = None


@app.on_event("startup")
async def startup() -> None:
    """Start the background worker. DB schema is managed by Alembic (entrypoint)."""
    global _worker_task
    _worker_task = asyncio.create_task(run_worker(), name="taskpilot-worker")


@app.on_event("shutdown")
async def shutdown() -> None:
    """Cancel the worker task and wait for it to finish cleanly."""
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
