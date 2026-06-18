"use client";

import type { TaskStatus } from "@/lib/api";

interface StatusCount {
  status: TaskStatus | "total";
  count: number;
}

interface Props {
  counts: Record<string, number>;
  total: number;
  loading: boolean;
}

const METRICS: Array<{
  key: TaskStatus | "total";
  label: string;
  color: string;
  bg: string;
  icon: string;
}> = [
  { key: "total",     label: "Total",     color: "#e8e8f0", bg: "rgba(232,232,240,0.08)", icon: "◈" },
  { key: "pending",   label: "Pending",   color: "#fbbf24", bg: "rgba(251,191,36,0.08)",  icon: "○" },
  { key: "running",   label: "Running",   color: "#818cf8", bg: "rgba(99,102,241,0.08)",  icon: "◎" },
  { key: "succeeded", label: "Succeeded", color: "#34d399", bg: "rgba(52,211,153,0.08)",  icon: "✓" },
  { key: "failed",    label: "Failed",    color: "#fb7185", bg: "rgba(251,113,133,0.08)", icon: "✕" },
  { key: "dead",      label: "Dead",      color: "#9ca3af", bg: "rgba(107,114,128,0.08)", icon: "☠" },
];

export default function MetricsBar({ counts, total, loading }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}
    >
      {METRICS.map(({ key, label, color, bg, icon }) => {
        const value = key === "total" ? total : (counts[key] ?? 0);
        return (
          <div
            key={key}
            className="glass"
            style={{
              padding: "16px 18px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              transition: "transform 0.15s",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: bg,
                border: `1px solid ${color}22`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                color,
                flexShrink: 0,
              }}
            >
              {loading ? (
                <span
                  style={{
                    width: 12,
                    height: 12,
                    border: `2px solid ${color}44`,
                    borderTopColor: color,
                    borderRadius: "50%",
                    display: "inline-block",
                  }}
                  className="spin"
                />
              ) : (
                icon
              )}
            </div>
            <div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                }}
              >
                {loading ? "—" : value.toLocaleString()}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginTop: 2,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  fontWeight: 500,
                }}
              >
                {label}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
