"use client";

import { useState } from "react";
import { createTask, type TaskCreate } from "@/lib/api";

interface Props {
  onCreated: () => void;
  onClose: () => void;
}

const PRESETS: Array<{ label: string; offsetMs: number }> = [
  { label: "Now", offsetMs: 0 },
  { label: "+5 min", offsetMs: 5 * 60_000 },
  { label: "+1 hour", offsetMs: 60 * 60_000 },
  { label: "+1 day", offsetMs: 24 * 60 * 60_000 },
];

function toLocalDateTimeInput(date: Date): string {
  // Format as YYYY-MM-DDTHH:mm for datetime-local input
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    date.getFullYear() +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

export default function TaskForm({ onCreated, onClose }: Props) {
  const [title, setTitle] = useState("");
  const [payloadText, setPayloadText] = useState("{}");
  const [scheduledAt, setScheduledAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payloadError, setPayloadError] = useState<string | null>(null);

  function validatePayload(text: string): boolean {
    try {
      JSON.parse(text);
      setPayloadError(null);
      return true;
    } catch (e) {
      setPayloadError("Invalid JSON — " + (e as Error).message);
      return false;
    }
  }

  function applyPreset(offsetMs: number) {
    const d = new Date(Date.now() + offsetMs);
    setScheduledAt(toLocalDateTimeInput(d));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!validatePayload(payloadText)) return;

    const body: TaskCreate = {
      title: title.trim(),
      payload: JSON.parse(payloadText),
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };

    setSubmitting(true);
    try {
      await createTask(body);
      onCreated();
    } catch (err: unknown) {
      const apiErr = err as { detail?: string };
      setError(apiErr?.detail ?? "Failed to create task.");
    } finally {
      setSubmitting(false);
    }
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 6,
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal fade-in">
        {/* Header */}
        <div
          style={{
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>
              Create Task
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              Schedule a new background job
            </p>
          </div>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ padding: "6px 10px", fontSize: 16 }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Title */}
            <div>
              <label style={labelStyle}>
                Title <span style={{ color: "#fb7185" }}>*</span>
              </label>
              <input
                className={`input ${!title && error ? "error" : ""}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Send weekly report email"
                maxLength={255}
              />
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                {title.length}/255
              </div>
            </div>

            {/* Payload JSON */}
            <div>
              <label style={labelStyle}>Payload (JSON)</label>
              <textarea
                className={`input ${payloadError ? "error" : ""}`}
                value={payloadText}
                onChange={(e) => {
                  setPayloadText(e.target.value);
                  validatePayload(e.target.value);
                }}
                rows={5}
                placeholder='{ "order_id": 123, "force_fail": false }'
                style={{ fontFamily: "monospace", fontSize: 13, resize: "vertical" }}
              />
              {payloadError && (
                <div style={{ fontSize: 12, color: "#fb7185", marginTop: 4 }}>
                  {payloadError}
                </div>
              )}
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Tip: set <code style={{ color: "var(--text-secondary)" }}>"force_fail": true</code> to test retry/dead-letter logic.
              </div>
            </div>

            {/* Scheduled At */}
            <div>
              <label style={labelStyle}>Scheduled At</label>
              <input
                className="input"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                style={{ colorScheme: "dark" }}
              />
              {/* Quick presets */}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {PRESETS.map(({ label, offsetMs }) => (
                  <button
                    key={label}
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => applyPreset(offsetMs)}
                    style={{ padding: "4px 10px", fontSize: 12 }}
                  >
                    {label}
                  </button>
                ))}
                {scheduledAt && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setScheduledAt("")}
                    style={{ padding: "4px 10px", fontSize: 12, color: "var(--text-muted)" }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                Leave empty to run immediately (defaults to now).
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "rgba(251,113,133,0.1)",
                  border: "1px solid rgba(251,113,133,0.2)",
                  color: "#fb7185",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !!payloadError}
              >
                {submitting ? (
                  <>
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        display: "inline-block",
                      }}
                      className="spin"
                    />
                    Creating…
                  </>
                ) : (
                  "Create Task"
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
