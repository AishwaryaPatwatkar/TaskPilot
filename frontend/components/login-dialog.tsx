"use client";

import { useState, useEffect } from "react";
import {
  getCredentials,
  saveCredentials,
  checkHealth,
  type Credentials,
} from "@/lib/api";

interface Props {
  onSaved: () => void;
}

export default function LoginDialog({ onSaved }: Props) {
  const [baseUrl, setBaseUrl] = useState("http://localhost:8001");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("changeme");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const saved = getCredentials();
    if (saved) {
      setBaseUrl(saved.base_url);
      setUsername(saved.username);
      setPassword(saved.password);
    }
  }, []);

  async function handleSave() {
    setError(null);
    setOk(false);
    setTesting(true);
    const healthy = await checkHealth(baseUrl);
    setTesting(false);
    if (!healthy) {
      setError(
        `Cannot reach ${baseUrl}/health — make sure the API is running and the URL is correct.`
      );
      return;
    }
    const creds: Credentials = { base_url: baseUrl, username, password };
    saveCredentials(creds);
    setOk(true);
    setTimeout(onSaved, 500);
  }

  return (
    <div className="modal-overlay">
      <div className="modal p-8 fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "rgba(99,102,241,0.15)",
              border: "1px solid rgba(99,102,241,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            ✈️
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)" }}>
              TaskPilot
            </h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Configure API connection
            </p>
          </div>
        </div>

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              API Base URL
            </label>
            <input
              className="input"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:8001"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Username
              </label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: 6,
                }}
              >
                Password
              </label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="changeme"
              />
            </div>
          </div>

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

          {ok && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "rgba(52,211,153,0.1)",
                border: "1px solid rgba(52,211,153,0.2)",
                color: "#34d399",
                fontSize: 13,
              }}
            >
              ✓ Connected! Loading dashboard…
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={testing}
            style={{ width: "100%", justifyContent: "center", padding: "12px 16px" }}
          >
            {testing ? (
              <>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    display: "inline-block",
                  }}
                  className="spin"
                />
                Testing connection…
              </>
            ) : (
              "Connect & Open Dashboard"
            )}
          </button>

          <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
            Credentials are stored in <code>localStorage</code> — never sent to
            any third party.
          </p>
        </div>
      </div>
    </div>
  );
}
