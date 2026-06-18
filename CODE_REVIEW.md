# CODE_REVIEW.md — `task_service.py` Analysis

Reviewed by: TaskPilot engineering review  
File: `task_service.py` (provided snippet)

---

## Summary

The snippet contains **8 distinct problems** spanning security, correctness, design, and performance. Each is catalogued below with category, impact, and the exact fix applied in `task_service_fixed.py`.

---

## Issue 1 — SQL Injection (Critical · Security)

**Location:** `TaskService.create_task`, `TaskService.get_tasks`

```python
# VULNERABLE
query = f"INSERT INTO tasks (title, payload) VALUES ('{title}', '{payload}')"
cursor.execute(query)

user = self.conn.execute(
    f"SELECT * FROM users WHERE id = {t['user_id']}"
).fetchone()
```

**Impact:** Any caller can inject arbitrary SQL. A `title` of `'); DROP TABLE tasks; --` destroys the database. The users query is equally exploitable. This is a textbook, critical vulnerability.

**Fix:** Use parameterised queries (the `?` / `%s` placeholder syntax). The DB driver then handles escaping safely.

```python
cursor.execute(
    "INSERT INTO tasks (title, payload) VALUES (?, ?)",
    (title, payload),
)
```

---

## Issue 2 — Shared Mutable Connection (Critical · Correctness / Concurrency)

**Location:** `AbstractRepositoryFactory.__init__`

```python
# BROKEN
self._conn = sqlite3.connect("tasks.db")
```

`sqlite3` connections are **not thread-safe** and must not be shared across threads or concurrent coroutines. In an async FastAPI app every request may run concurrently. Sharing one connection will cause data corruption and `ProgrammingError: Cannot operate on a closed database`.

**Fix:** Create a new connection (or use a connection pool) per request, not once at class instantiation time.

---

## Issue 3 — Wrong Object Reference in `create_task` (Correctness · Bug)

**Location:** `TaskService.create_task`

```python
async def create_task(self, title, payload):
    repo = self.factory.create_repository()
    cursor = self.conn.cursor()   # ← self has no .conn attribute
```

`TaskService` has no `self.conn`. The factory holds `self._conn`. This code raises `AttributeError` at runtime on every call. The `repo` variable is also created and immediately discarded — it is never used.

**Fix:** Access the connection through the repository, or pass the session explicitly.

---

## Issue 4 — Bare `except` Swallows All Errors (Design · Debuggability)

**Location:** `create_task` route handler

```python
try:
    ...
except:
    raise HTTPException(status_code=500, detail="Error")
```

A bare `except:` catches **everything** — `KeyboardInterrupt`, `SystemExit`, `asyncio.CancelledError` — and collapses all errors into a useless `"Error"` string. Operators have no way to distinguish a validation error from a DB crash from a bug.

**Fix:** Catch specific exceptions. Let FastAPI's default exception handler deal with `RequestValidationError`. Log the full traceback for unexpected errors.

---

## Issue 5 — No Input Validation (Security · Correctness)

**Location:** `create_task` route handler

```python
@app.post("/tasks")
async def create_task(request: Request):
    data = await request.json()
    service = TaskService()
    return await service.create_task(data["title"], data["payload"])
```

- `request.json()` returns raw, unvalidated data.
- `data["title"]` raises `KeyError` if the field is missing (turned into a 500 by the bare `except`).
- No length limits, type checks, or size constraints on `payload`.
- The spec explicitly states: "The `payload` field is arbitrary JSON submitted by other services. Treat it as untrusted user input."

**Fix:** Use a Pydantic model as the endpoint parameter. FastAPI validates and returns 422 automatically.

```python
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    payload: dict = Field(default_factory=dict)

@app.post("/tasks")
async def create_task(body: TaskCreate): ...
```

---

## Issue 6 — Over-engineered, Unnecessary Abstraction (Design · Complexity)

**Location:** `AbstractRepositoryFactory`, `TaskRepository`, `TaskService`

The snippet introduces three layers — a "factory", a "repository", and a "service" — for what is a two-line CRUD operation. None of these layers adds value:

- `AbstractRepositoryFactory` is not abstract (no ABC, no subclasses).
- `TaskRepository.get_all` returns raw tuples, not domain objects.
- `TaskService` bypasses the repository and calls `self.conn` directly (which doesn't exist — see Issue 3).

The name `AbstractRepositoryFactory` in particular is a red flag: it combines two patterns (Abstract and Factory) that neither pattern requires nor benefits from at this scale.

**Fix:** Keep it simple. In a small service, a direct `async def` that receives a DB session and runs a query is correct and maintainable.

---

## Issue 7 — `SELECT *` with N+1 Query (Performance · Correctness)

**Location:** `TaskService.get_tasks`

```python
tasks = repo.get_all()  # SELECT * FROM tasks
for t in tasks:
    user = self.conn.execute(
        f"SELECT * FROM users WHERE id = {t['user_id']}"
    ).fetchone()
```

Two problems:
1. **`SELECT *`** returns all columns including any future ones added to the schema. Column ordering in the result tuple is undefined and fragile.
2. **N+1 queries**: for 100 tasks this runs 101 queries. This should be a JOIN or a batch `WHERE id IN (...)` lookup.

**Fix:** Select only needed columns, and join the users table in a single query.

---

## Issue 8 — `TaskService` Instantiated Per-Request (Performance · Design)

**Location:** Both route handlers

```python
@app.post("/tasks")
async def create_task(request: Request):
    service = TaskService()   # new instance every request
```

`TaskService.__init__` creates a new `AbstractRepositoryFactory`, which opens a new SQLite connection. Doing this on every request is wasteful and prevents connection pooling. In production this means one file open + one connection creation per HTTP request.

**Fix:** Use FastAPI's dependency injection (`Depends`) to provide a shared session with proper lifecycle management.

---

## Summary Table

| # | Category | Severity | Issue |
|---|---|---|---|
| 1 | Security | **Critical** | SQL injection in `create_task` and `get_tasks` |
| 2 | Correctness / Concurrency | **Critical** | Shared SQLite connection across coroutines |
| 3 | Correctness | **High** | `AttributeError`: `self.conn` does not exist on `TaskService` |
| 4 | Design / Debuggability | **High** | Bare `except` swallows all errors including system signals |
| 5 | Security / Correctness | **High** | No input validation on untrusted `payload` |
| 6 | Design | **Medium** | Unnecessary abstraction layers with no benefit |
| 7 | Performance / Correctness | **Medium** | `SELECT *` + N+1 query per task |
| 8 | Performance | **Low** | Service/connection re-created on every request |
