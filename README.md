# TaskPilot

A self-contained background job scheduler with retry, dead-lettering, and a REST API.

---

## 1. How to Run

**Prerequisites:** Docker and Docker Compose.

```bash
# 1. Clone and enter the repo
git clone <repo-url> && cd TaskPilot

# 2. Copy the example env (defaults work for local dev)
cp .env.example .env

# 3. Start everything
docker compose up --build
```

The API is available at **http://localhost:8001**  
Interactive docs: **http://localhost:8001/docs**  
Health check: **http://localhost:8001/health**  
Database: `localhost:5433` (host port, avoids conflict with local Postgres)

**Default credentials:** `admin` / `changeme` (HTTP Basic Auth)

### Quick smoke test

```bash
# Health check (no auth required)
curl http://localhost:8001/health

# Create a task
curl -u admin:changeme -X POST http://localhost:8001/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Send receipt", "payload": {"order_id": 123}}'

# List tasks
curl -u admin:changeme http://localhost:8001/tasks

# Create a task that will fail and be retried (tests retry + dead-letter path)
curl -u admin:changeme -X POST http://localhost:8001/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Failing job", "payload": {"force_fail": true}}'

# Manually retry a failed task (replace <id> with actual UUID)
curl -u admin:changeme -X PATCH http://localhost:8001/tasks/<id>/status \
  -H "Content-Type: application/json" \
  -d '{"status": "pending"}'
```

### Part 4 — Next.js Frontend (bonus)

```bash
# In a separate terminal (while docker compose is running):
cd frontend
npm install        # first time only
npm run dev
```

The dashboard is available at **http://localhost:3001**  
On first visit, a config dialog appears — defaults (`http://localhost:8001` / `admin` / `changeme`) work out of the box.  
Features: task list with status badges, create task form with JSON payload editor, auto-refresh every 5s, manual retry of failed tasks, pagination, status filter.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                   Docker Compose                     │
│                                                      │
│  ┌───────────────────────────────────────────────┐   │
│  │              api container                    │   │
│  │                                               │   │
│  │   ┌─────────────┐    ┌──────────────────┐    │   │
│  │   │  FastAPI    │    │  asyncio Worker  │    │   │
│  │   │  (uvicorn)  │    │  (background     │    │   │
│  │   │             │    │   task)          │    │   │
│  │   │  POST /tasks│    │  polls every 60s │    │   │
│  │   │  GET  /tasks│    │  FOR UPDATE      │    │   │
│  │   │  PATCH /..  │    │  SKIP LOCKED     │    │   │
│  │   │  DELETE /.. │    │                  │    │   │
│  │   │  GET /health│    │  retry → dead    │    │   │
│  │   └──────┬──────┘    └───────┬──────────┘    │   │
│  │          │                   │               │   │
│  └──────────┼───────────────────┼───────────────┘   │
│             │  asyncpg (async)  │                    │
│             └─────────┬─────────┘                    │
│                       │                              │
│  ┌────────────────────▼─────────────────────────┐   │
│  │           PostgreSQL 16                       │   │
│  │           (tasks table)                       │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

The API and worker share the same process and the same Postgres connection pool. The worker runs as an `asyncio.Task` started during `startup`. Alembic handles schema migrations — they run in the `entrypoint.sh` before uvicorn starts, ensuring the schema is always up-to-date before the app accepts traffic.

---

## 3. Key Decisions

| Decision | Choice | Why |
|---|---|---|
| **Database** | PostgreSQL | `SELECT … FOR UPDATE SKIP LOCKED` gives atomic worker-row claiming with no application-level locks. SQLite cannot do this. |
| **Auth** | HTTP Basic Auth | Zero dependencies, auditable, simple. Rate-limiting would require a counter store (Redis), which is scope creep at this stage. |
| **Worker** | Plain `asyncio.create_task` loop | No extra dependency. Meets the "every 60 seconds" requirement. APScheduler/Celery are bigger than needed for one job type. |
| **Backoff** | Exponential: `60 × 2^retry_count` s | Fixed backoff hammers a down API uniformly; exponential gives it time to recover. Retries at ~60s, 120s, 240s. |
| **Concurrency** | `FOR UPDATE SKIP LOCKED` | Postgres-native atomic claim — no two workers ever process the same row, no app-level locks needed. |
| **Task ID** | UUID v4 | Globally unique, safe to expose in URLs; prevents sequential enumeration of other customers' tasks. |
| **DLQ** | `dead` status on the same table | Simple, human-inspectable via the existing API. A separate DLQ table adds schema complexity with no operational benefit at this scale. |
| **Migrations** | Alembic | Version-controlled schema with upgrade/downgrade; correct tool for the job. Running SQL on startup is fragile and doesn't support rollbacks. |

---

## 4. State Machine

```
            [CREATE]
           ─────────► pending ──── worker picks up ──► running ──► succeeded (terminal)
                         ▲                                │
                         │                                └──► failed
                         │                                       │
                         └── manual retry (PATCH /status) ───────┘
                                                                  │
                                                    retry_count == MAX_RETRIES
                                                                  │
                                                                  ▼
                                                               dead (terminal)
```

Invalid transitions return `409 Conflict`.

---

## 5. What I Would Change at Scale

**10× traffic (~100 req/s):**
- Tune the SQLAlchemy connection pool (`pool_size`, `max_overflow`) — the default 10/20 is already reasonable but should be profiled.
- Add a Postgres read replica for `GET /tasks` list queries — writes stay on primary.
- Increase worker batch size and run multiple worker replicas (the `FOR UPDATE SKIP LOCKED` design already supports this safely).

**1000× traffic (~10,000 req/s):**
- Move the worker out of the API process into a dedicated worker fleet — allows independent scaling and avoids resource contention.
- Introduce a real job queue (e.g. Redis Streams or SQS) as the scheduling layer. The `tasks` table becomes a ledger, not a queue. This eliminates Postgres polling at high fan-out.
- Add a `pg_partman`-managed partition on `tasks` by `created_at` to keep the table scannable as it grows to millions of rows.
- Rate-limit the API at the load balancer (nginx, Envoy) rather than in-process to protect Postgres from sudden bursts.
- Switch from HTTP Basic Auth to short-lived JWT tokens (with a service account issuer) so credentials can be rotated without redeploying.
- Add distributed tracing (OpenTelemetry) across the API→DB→worker boundary to identify bottlenecks.

---

## 6. AI Usage Disclosure

All parts of this project were developed with AI assistance (Antigravity / Gemini).

### What was AI-assisted
- Initial scaffold of all files.
- Pydantic schema structure and validator patterns.
- Alembic `env.py` configuration for async models.
- The GitHub Actions workflow structure.

### One piece of AI-generated code I rejected

The first version of `worker.py` used `asyncio.gather` to run all claimed tasks concurrently **before** committing the "running" status update:

```python
# REJECTED — race condition
tasks = result.scalars().all()
await asyncio.gather(*[_process_task(t) for t in tasks])
```

This had a race condition: if the process crashed after `gather` started but before the status was persisted, tasks would re-run on restart (double-execution). I rejected it in favour of first committing all `pending → running` transitions in a single transaction with the lock held, then processing in a separate session.

### One place AI helped move faster

Generating the `CODE_REVIEW.md` skeleton with issue categories and table format saved significant time — I focused my attention on finding and articulating the actual bugs rather than formatting.

---

## 7. Running Tests Locally

```bash
# Start a local Postgres (or use docker compose up db)
docker compose up db -d

# Install deps
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Run tests
pytest tests/ -v
```

Tests use a separate `taskpilot_test` database and run Alembic migrations automatically before the test session.

---

## 8. Project Structure

```
TaskPilot/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app, lifecycle hooks
│   │   ├── config.py        # Env-var settings (pydantic-settings)
│   │   ├── database.py      # Async SQLAlchemy engine + session
│   │   ├── models.py        # Task ORM model
│   │   ├── schemas.py       # Pydantic request/response models
│   │   ├── auth.py          # HTTP Basic Auth dependency
│   │   ├── middleware.py    # Request logging middleware
│   │   ├── worker.py        # Asyncio scheduler + executor
│   │   └── routes/
│   │       ├── health.py    # GET /health (no auth)
│   │       └── tasks.py     # All task CRUD endpoints
│   ├── alembic/             # Migrations
│   │   ├── env.py
│   │   └── versions/
│   │       └── 0001_create_tasks_table.py
│   ├── tests/
│   │   ├── conftest.py      # Fixtures, test DB setup
│   │   ├── test_tasks.py    # API tests
│   │   └── test_worker.py   # Worker logic tests
│   ├── Dockerfile
│   ├── entrypoint.sh
│   └── requirements.txt
├── .github/workflows/ci.yml
├── docker-compose.yml
├── .env.example
├── .gitignore
├── CODE_REVIEW.md
├── task_service_fixed.py
└── README.md
```
