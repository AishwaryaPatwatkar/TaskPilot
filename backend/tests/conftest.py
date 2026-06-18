"""
Test fixtures.

Uses a real PostgreSQL database (TEST_DATABASE_URL env var, falls back to the
default taskpilot DB with a _test suffix).  Alembic migrations are run before
the test session so the schema matches exactly what production uses.
"""

import os
import sys
import asyncio
import subprocess
from collections.abc import AsyncGenerator

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.database import Base, get_session
from app.main import app

# ── Test database URL ─────────────────────────────────────────────────────────
# CI injects TEST_DATABASE_URL; locally it re-uses the dev DB with _test suffix.

TEST_DB_URL_ASYNC = os.getenv(
    "TEST_DATABASE_URL",
    settings.database_url.replace("/taskpilot", "/taskpilot_test"),
)
TEST_DB_URL_SYNC = os.getenv(
    "TEST_DATABASE_URL_SYNC",
    settings.database_url_sync.replace("/taskpilot", "/taskpilot_test"),
)

# ── Engine + session factory for tests ───────────────────────────────────────
from sqlalchemy.pool import NullPool

test_engine = create_async_engine(TEST_DB_URL_ASYNC, poolclass=NullPool)
TestSessionLocal = async_sessionmaker(
    test_engine, class_=AsyncSession, expire_on_commit=False
)


# ── Session-scoped schema setup ───────────────────────────────────────────────


@pytest.fixture(scope="session", autouse=True)
def run_migrations():
    """Run alembic upgrade head against the test DB before the test session."""
    env = os.environ.copy()
    env["DATABASE_URL_SYNC"] = TEST_DB_URL_SYNC
    subprocess.run(
        ["alembic", "upgrade", "head"],
        check=True,
        env=env,
        cwd=os.path.dirname(os.path.dirname(__file__)),  # backend/
    )
    yield
    # Teardown: drop all tables after the session
    import asyncio

    async def drop():
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    asyncio.run(drop())


# ── Per-test DB cleanup ───────────────────────────────────────────────────────


@pytest_asyncio.fixture(autouse=True)
async def clean_db():
    """Truncate all tables between tests for isolation."""
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(
            lambda sync_conn: sync_conn.execute(
                __import__("sqlalchemy").text("TRUNCATE TABLE tasks RESTART IDENTITY CASCADE")
            )
        )


# ── Override FastAPI's DB dependency ─────────────────────────────────────────


async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_session] = override_get_session

# ── HTTP client ───────────────────────────────────────────────────────────────

AUTH = ("admin", "changeme")


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
