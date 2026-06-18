// ── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "running" | "succeeded" | "failed" | "dead";

export interface Task {
  id: string;
  title: string;
  payload: Record<string, unknown>;
  scheduled_at: string;
  status: TaskStatus;
  retry_count: number;
  created_at: string;
  updated_at: string;
  last_error: string | null;
}

export interface PaginatedTasks {
  items: Task[];
  total: number;
  page: number;
  page_size: number;
}

export interface TaskCreate {
  title: string;
  payload: Record<string, unknown>;
  scheduled_at?: string | null;
}

export interface ApiError {
  status: number;
  detail: string;
}

// ── Credential storage ───────────────────────────────────────────────────────

const CREDS_KEY = "taskpilot_creds";

export interface Credentials {
  base_url: string;
  username: string;
  password: string;
}

export function getCredentials(): Credentials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
}

export function clearCredentials(): void {
  localStorage.removeItem(CREDS_KEY);
}

function defaultCredentials(): Credentials {
  return {
    base_url: "http://localhost:8001",
    username: "admin",
    password: "changeme",
  };
}

function authHeader(creds: Credentials): string {
  return "Basic " + btoa(`${creds.username}:${creds.password}`);
}

// ── Core fetch wrapper ───────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const creds = getCredentials() ?? defaultCredentials();
  const url = `${creds.base_url}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(creds),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore parse errors
    }
    const err: ApiError = { status: res.status, detail };
    throw err;
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export async function fetchTasks(
  page = 1,
  page_size = 20,
  status?: TaskStatus | "all"
): Promise<PaginatedTasks> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(page_size),
  });
  if (status && status !== "all") params.set("status", status);
  return apiFetch<PaginatedTasks>(`/tasks?${params}`);
}

export async function fetchTask(id: string): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}`);
}

export async function createTask(body: TaskCreate): Promise<Task> {
  return apiFetch<Task>("/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteTask(id: string): Promise<void> {
  return apiFetch<void>(`/tasks/${id}`, { method: "DELETE" });
}

export async function patchTaskStatus(
  id: string,
  status: TaskStatus
): Promise<Task> {
  return apiFetch<Task>(`/tasks/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function checkHealth(baseUrl?: string): Promise<boolean> {
  try {
    const url = `${baseUrl ?? "http://localhost:8001"}/health`;
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}
