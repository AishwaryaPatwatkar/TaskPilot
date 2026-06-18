"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchTasks,
  getCredentials,
  type PaginatedTasks,
  type TaskStatus,
} from "@/lib/api";
import LoginDialog from "@/components/login-dialog";
import MetricsBar from "@/components/metrics-bar";
import TaskTable from "@/components/task-table";
import TaskForm from "@/components/task-form";

const POLL_INTERVAL_MS = 5000;

export default function Dashboard() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [needsLogin, setNeedsLogin] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const creds = getCredentials();
    if (!creds) {
      setNeedsLogin(true);
    }
    setReady(true);
  }, []);

  // ── Data ──────────────────────────────────────────────────────────────────
  const [data, setData] = useState<PaginatedTasks | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Controls ──────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  // ── Status counts across all pages ───────────────────────────────────────
  const [counts, setCounts] = useState<Record<string, number>>({});

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch counts for metrics bar (always fetch "all" statuses)
  const fetchCounts = useCallback(async () => {
    try {
      const [all, pending, running, succeeded, failed, dead] = await Promise.all([
        fetchTasks(1, 1, "all"),
        fetchTasks(1, 1, "pending"),
        fetchTasks(1, 1, "running"),
        fetchTasks(1, 1, "succeeded"),
        fetchTasks(1, 1, "failed"),
        fetchTasks(1, 1, "dead"),
      ]);
      setCounts({
        pending: pending.total,
        running: running.total,
        succeeded: succeeded.total,
        failed: failed.total,
        dead: dead.total,
      });
    } catch {
      // counts fail silently
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTasks(page, pageSize, statusFilter);
      setData(result);
      await fetchCounts();
    } catch (err: unknown) {
      const apiErr = err as { status?: number; detail?: string };
      if (apiErr?.status === 401) {
        setNeedsLogin(true);
      } else {
        setError(apiErr?.detail ?? "Failed to load tasks.");
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, fetchCounts]);

  // Initial load & when dependencies change
  useEffect(() => {
    if (!needsLogin && ready) {
      load();
    }
  }, [load, needsLogin, ready]);

  // Auto-refresh
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh && !needsLogin && ready) {
      timerRef.current = setInterval(load, POLL_INTERVAL_MS);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, load, needsLogin, ready]);

  function handleCreated() {
    setShowForm(false);
    setPage(1);
    load();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!ready) return null;

  if (needsLogin && !showLogin) {
    return (
      <LoginDialog
        onSaved={() => {
          setNeedsLogin(false);
          setShowLogin(false);
        }}
      />
    );
  }

  return (
    <>
      {/* Modals */}
      {showForm && (
        <TaskForm onCreated={handleCreated} onClose={() => setShowForm(false)} />
      )}
      {showLogin && (
        <LoginDialog
          onSaved={() => {
            setShowLogin(false);
            setNeedsLogin(false);
            load();
          }}
        />
      )}

      {/* Page */}
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-primary)",
        }}
      >
        {/* Top nav */}
        <header
          style={{
            borderBottom: "1px solid var(--border-subtle)",
            background: "rgba(17,17,24,0.8)",
            backdropFilter: "blur(12px)",
            position: "sticky",
            top: 0,
            zIndex: 40,
          }}
        >
          <div
            style={{
              maxWidth: 1280,
              margin: "0 auto",
              padding: "0 24px",
              height: 60,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "var(--accent)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 16,
                  boxShadow: "0 0 12px rgba(99,102,241,0.4)",
                }}
              >
                ✈️
              </div>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  background: "linear-gradient(135deg, #e8e8f0 0%, #818cf8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                TaskPilot
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginLeft: 4,
                  paddingTop: 2,
                }}
              >
                Job Scheduler
              </span>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {/* Auto-refresh toggle */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                />
                Auto-refresh (5s)
                {autoRefresh && (
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#34d399",
                      display: "inline-block",
                    }}
                    className="pulse-dot"
                  />
                )}
              </label>

              {/* Manual refresh */}
              <button
                id="refresh-btn"
                className="btn btn-ghost"
                onClick={load}
                disabled={loading}
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                <span className={loading ? "spin" : ""} style={{ display: "inline-block" }}>
                  ↻
                </span>
                Refresh
              </button>

              {/* Settings */}
              <button
                className="btn btn-ghost"
                onClick={() => setShowLogin(true)}
                style={{ padding: "6px 12px", fontSize: 12 }}
                title="Configure API connection"
              >
                ⚙ Settings
              </button>

              {/* Create task */}
              <button
                id="create-task-btn"
                className="btn btn-primary"
                onClick={() => setShowForm(true)}
                style={{ padding: "7px 14px" }}
              >
                + Create Task
              </button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            padding: "28px 24px",
          }}
        >
          {/* Page heading */}
          <div style={{ marginBottom: 24 }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              Dashboard
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              Monitor and manage your background jobs
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                background: "rgba(251,113,133,0.1)",
                border: "1px solid rgba(251,113,133,0.2)",
                color: "#fb7185",
                fontSize: 13,
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>⚠ {error}</span>
              <button
                style={{
                  background: "none",
                  border: "none",
                  color: "#fb7185",
                  cursor: "pointer",
                  fontSize: 16,
                }}
                onClick={() => setError(null)}
              >
                ✕
              </button>
            </div>
          )}

          {/* Metrics */}
          <MetricsBar
            counts={counts}
            total={data?.total ?? 0}
            loading={loading && !data}
          />

          {/* Task table */}
          <TaskTable
            tasks={data?.items ?? []}
            loading={loading}
            total={data?.total ?? 0}
            page={page}
            pageSize={pageSize}
            statusFilter={statusFilter}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onStatusFilter={setStatusFilter}
            onRefresh={load}
          />
        </main>
      </div>
    </>
  );
}
