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
  const [isRawJson, setIsRawJson] = useState(false);
  const [payloadText, setPayloadText] = useState("{}");
  const [payloadPairs, setPayloadPairs] = useState<Array<{ key: string; value: string; type: "string" | "number" | "boolean" }>>([
    { key: "order_id", value: "123", type: "number" }
  ]);
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

  function validatePairs(pairsList: typeof payloadPairs): boolean {
    const keys = pairsList.map(p => p.key.trim()).filter(Boolean);
    const hasDuplicates = keys.some((k, i) => keys.indexOf(k) !== i);
    if (hasDuplicates) {
      setPayloadError("Duplicate keys are not allowed.");
      return false;
    }
    setPayloadError(null);
    return true;
  }

  function getPayloadFromPairs(pairs: typeof payloadPairs): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const pair of pairs) {
      if (!pair.key.trim()) continue;
      let val: any = pair.value;
      if (pair.type === "number") {
        const parsed = Number(pair.value);
        val = isNaN(parsed) ? 0 : parsed;
      } else if (pair.type === "boolean") {
        val = pair.value === "true";
      }
      obj[pair.key.trim()] = val;
    }
    return obj;
  }

  function handleToggleMode() {
    setError(null);
    if (isRawJson) {
      // Switching to Builder
      try {
        const obj = JSON.parse(payloadText);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          const pairs: Array<{ key: string; value: string; type: "string" | "number" | "boolean" }> = [];
          for (const [k, v] of Object.entries(obj)) {
            let t: "string" | "number" | "boolean" = "string";
            if (typeof v === "number") t = "number";
            else if (typeof v === "boolean") t = "boolean";
            pairs.push({ key: k, value: String(v), type: t });
          }
          if (pairs.length === 0) {
            pairs.push({ key: "", value: "", type: "string" });
          }
          setPayloadPairs(pairs);
          setIsRawJson(false);
          setPayloadError(null);
        } else {
          setError("Cannot convert complex JSON structure to key-value builder. Keep using raw JSON.");
        }
      } catch (e) {
        setError("Invalid JSON, please fix before switching back to key-value builder.");
      }
    } else {
      // Switching to Raw JSON
      const obj = getPayloadFromPairs(payloadPairs);
      setPayloadText(JSON.stringify(obj, null, 2));
      setIsRawJson(true);
      setPayloadError(null);
    }
  }

  function addPair() {
    setPayloadPairs([...payloadPairs, { key: "", value: "", type: "string" }]);
  }

  function removePair(index: number) {
    const next = [...payloadPairs];
    next.splice(index, 1);
    const updated = next.length ? next : [{ key: "", value: "", type: "string" }];
    setPayloadPairs(updated);
    validatePairs(updated);
  }

  function updatePair(index: number, field: "key" | "value" | "type", val: string) {
    const next = [...payloadPairs];
    const pair = { ...next[index] };

    if (field === "type") {
      pair.type = val as any;
      if (val === "boolean") {
        pair.value = "false";
      } else {
        pair.value = "";
      }
    } else {
      pair[field] = val;
    }

    next[index] = pair;
    setPayloadPairs(next);
    validatePairs(next);
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

    if (isRawJson) {
      if (!validatePayload(payloadText)) return;
    } else {
      if (!validatePairs(payloadPairs)) return;
    }

    const payload = isRawJson ? JSON.parse(payloadText) : getPayloadFromPairs(payloadPairs);

    const body: TaskCreate = {
      title: title.trim(),
      payload,
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

            {/* Payload Section */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Payload Parameters</label>
                <button
                  type="button"
                  onClick={handleToggleMode}
                  style={{
                    fontSize: 11,
                    background: "none",
                    border: "none",
                    color: "var(--accent)",
                    cursor: "pointer",
                    fontWeight: 600,
                    textDecoration: "underline",
                  }}
                >
                  {isRawJson ? "Switch to Simple Builder" : "Switch to Raw JSON"}
                </button>
              </div>

              {!isRawJson ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {payloadPairs.map((pair, index) => (
                    <div key={index} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        className="input"
                        style={{ flex: 2, padding: "8px 12px", fontSize: 13 }}
                        value={pair.key}
                        onChange={(e) => updatePair(index, "key", e.target.value)}
                        placeholder="Parameter Name (e.g. order_id)"
                      />
                      <select
                        className="input"
                        style={{ width: 100, padding: "8px 12px", fontSize: 13, colorScheme: "dark" }}
                        value={pair.type}
                        onChange={(e) => updatePair(index, "type", e.target.value as any)}
                      >
                        <option value="string">Text</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                      </select>
                      {pair.type === "boolean" ? (
                        <select
                          className="input"
                          style={{ flex: 2, padding: "8px 12px", fontSize: 13, colorScheme: "dark" }}
                          value={pair.value}
                          onChange={(e) => updatePair(index, "value", e.target.value)}
                        >
                          <option value="false">false</option>
                          <option value="true">true</option>
                        </select>
                      ) : (
                        <input
                          className="input"
                          style={{ flex: 2, padding: "8px 12px", fontSize: 13 }}
                          type={pair.type === "number" ? "number" : "text"}
                          value={pair.value}
                          onChange={(e) => updatePair(index, "value", e.target.value)}
                          placeholder={pair.type === "number" ? "0" : "Value"}
                        />
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ padding: "8px 12px", color: "#fb7185", borderColor: "rgba(251,113,133,0.2)" }}
                        onClick={() => removePair(index)}
                        title="Remove parameter"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                      }}
                      onClick={addPair}
                    >
                      + Add Field
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                      }}
                      onClick={() => {
                        // Preset for force_fail: true
                        const exists = payloadPairs.some(p => p.key === "force_fail");
                        if (!exists) {
                          setPayloadPairs([...payloadPairs, { key: "force_fail", value: "true", type: "boolean" }]);
                        }
                      }}
                    >
                      💡 Add Retry Failure Demo
                    </button>
                  </div>
                </div>
              ) : (
                <div>
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
                </div>
              )}
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
