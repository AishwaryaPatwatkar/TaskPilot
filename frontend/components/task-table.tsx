"use client";

import { useState } from "react";
import { deleteTask, patchTaskStatus, type Task, type TaskStatus } from "@/lib/api";
import { formatDate, formatRelative, truncateId } from "@/lib/utils";

interface Props {
  tasks: Task[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  statusFilter: TaskStatus | "all";
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  onStatusFilter: (s: TaskStatus | "all") => void;
  onRefresh: () => void;
}

const STATUS_FILTERS: Array<{ value: TaskStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "running", label: "Running" },
  { value: "succeeded", label: "Succeeded" },
  { value: "failed", label: "Failed" },
  { value: "dead", label: "Dead" },
];

const PAGE_SIZES = [10, 20, 50];

function StatusBadge({ status }: { status: TaskStatus }) {
  const labels: Record<TaskStatus, string> = {
    pending: "Pending",
    running: "Running",
    succeeded: "Succeeded",
    failed: "Failed",
    dead: "Dead",
  };
  return (
    <span
      className={`badge-${status}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.03em",
      }}
    >
      {status === "running" && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "currentColor",
            display: "inline-block",
          }}
          className="pulse-dot"
        />
      )}
      {labels[status]}
    </span>
  );
}

export default function TaskTable({
  tasks,
  loading,
  total,
  page,
  pageSize,
  statusFilter,
  onPageChange,
  onPageSizeChange,
  onStatusFilter,
  onRefresh,
}: Props) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function handleRetry(id: string) {
    setActionLoading(id);
    try {
      await patchTaskStatus(id, "pending");
      onRefresh();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this task? This cannot be undone.")) return;
    setActionLoading(id);
    try {
      await deleteTask(id);
      onRefresh();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="glass" style={{ overflow: "hidden" }}>
      {/* Toolbar */}
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {/* Status filter pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { onStatusFilter(value); onPageChange(1); }}
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 500,
                border: "1px solid",
                cursor: "pointer",
                transition: "all 0.15s",
                background: statusFilter === value ? "var(--accent)" : "transparent",
                borderColor: statusFilter === value ? "var(--accent)" : "var(--border)",
                color: statusFilter === value ? "#fff" : "var(--text-secondary)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Page size selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Rows:</span>
          <select
            value={pageSize}
            onChange={(e) => { onPageSizeChange(Number(e.target.value)); onPageChange(1); }}
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text-primary)",
              padding: "4px 8px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        {loading && tasks.length === 0 ? (
          <div
            style={{
              padding: "60px 0",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                border: "3px solid var(--border)",
                borderTopColor: "var(--accent)",
                borderRadius: "50%",
                margin: "0 auto 12px",
              }}
              className="spin"
            />
            Loading tasks…
          </div>
        ) : tasks.length === 0 ? (
          <div
            style={{
              padding: "60px 0",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-secondary)" }}>
              No tasks found
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {statusFilter !== "all"
                ? `No tasks with status "${statusFilter}"`
                : "Create your first task using the button above"}
            </div>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Retries</th>
                <th>Updated</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const busy = actionLoading === task.id;
                return (
                  <tr key={task.id} className="fade-in">
                    <td>
                      <code
                        title={task.id}
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          background: "var(--bg-secondary)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                        onClick={() => navigator.clipboard.writeText(task.id)}
                      >
                        {truncateId(task.id)}
                      </code>
                    </td>
                    <td>
                      <div
                        style={{
                          fontWeight: 500,
                          color: "var(--text-primary)",
                          maxWidth: 200,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={task.title}
                      >
                        {task.title}
                      </div>
                      {/* Payload Parameters */}
                      {task.payload && typeof task.payload === "object" && Object.keys(task.payload).length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, maxWidth: 220 }}>
                          {Object.entries(task.payload).map(([k, v]) => (
                            <span
                              key={k}
                              title={`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`}
                              style={{
                                fontSize: 10,
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--border-subtle)",
                                padding: "2px 6px",
                                borderRadius: 4,
                                color: "var(--text-secondary)",
                                fontFamily: "monospace",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: 120,
                              }}
                            >
                              {k}: {typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                      {task.last_error && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#fb7185",
                            marginTop: 4,
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={task.last_error}
                        >
                          ⚠ {task.last_error}
                        </div>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={task.status} />
                    </td>
                    <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                      {formatDate(task.scheduled_at)}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {task.retry_count > 0 ? (
                        <span
                          style={{
                            background: "rgba(251,113,133,0.1)",
                            color: "#fb7185",
                            border: "1px solid rgba(251,113,133,0.2)",
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {task.retry_count}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {formatRelative(task.updated_at)}
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          justifyContent: "flex-end",
                        }}
                      >
                        {task.status === "failed" && (
                          <button
                            className="btn btn-ghost"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            onClick={() => handleRetry(task.id)}
                            disabled={busy}
                            title="Retry — sends back to pending"
                          >
                            {busy ? "…" : "↺ Retry"}
                          </button>
                        )}
                        <button
                          className="btn btn-danger"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          onClick={() => handleDelete(task.id)}
                          disabled={busy}
                          title="Delete this task"
                        >
                          {busy ? "…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination footer */}
      {total > 0 && (
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Showing {(page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} of {total} task
            {total !== 1 ? "s" : ""}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className="btn btn-ghost"
              style={{ padding: "5px 12px", fontSize: 12 }}
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
            >
              ← Prev
            </button>
            <span
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                padding: "0 6px",
              }}
            >
              Page {page} / {totalPages}
            </span>
            <button
              className="btn btn-ghost"
              style={{ padding: "5px 12px", fontSize: 12 }}
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
