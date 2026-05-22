import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";

const API_BASE_URL = String(import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

const PHASES = [
  "PHASE 0 — ENV CHECK",
  "PHASE 1 — MENU LOAD",
  "PHASE 2 — ORDER BEFORE PAYMENT GUARD",
  "PHASE 3 — ADMIN AUTH REQUIRED",
  "PHASE 4 — ADMIN AUTH WORKS",
  "PHASE 5 — CONTACT SUBMISSIONS TABLE",
  "PHASE 6 — PAUSE ORDERS ENDPOINT",
  "PHASE 7 — MENU SOFT DELETE CHECK",
  "PHASE 8 — HEALTH VERSION FIELD",
];

function initialRows() {
  return PHASES.map((name) => ({
    name,
    status: "BLOCKED",
    evidence: "Waiting for Run All Tests.",
  }));
}

function statusColor(status) {
  if (status === "PASS") return "#00ff66";
  if (status === "FAIL") return "#ff3333";
  if (status === "RUNNING") return "#FFD700";
  return "#888888";
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function getCsrfToken() {
  const response = await fetch(`${API_BASE_URL}/api/csrf-token`, {
    method: "GET",
    credentials: "include",
  });
  const body = await readJson(response);
  return body?.data?.csrfToken || body?.csrfToken || "";
}

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await readJson(response);
  return { response, body };
}

function menuItemsFrom(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function categoriesFrom(body, items) {
  if (Array.isArray(body?.categories)) {
    return body.categories.map((category) => category.name || category).filter(Boolean);
  }
  return [...new Set(items.map((item) => item.category).filter(Boolean))];
}

function stringifyEvidence(value) {
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export default function SmokeTest() {
  const adminToken = localStorage.getItem("admin_token");
  const [rows, setRows] = useState(initialRows);
  const [running, setRunning] = useState(false);

  const failedPhases = useMemo(
    () => rows.filter((row) => row.status === "FAIL").map((row) => row.name),
    [rows],
  );
  const allPass = rows.every((row) => row.status === "PASS");
  const complete = rows.every((row) => row.status === "PASS" || row.status === "FAIL");

  if (!adminToken) {
    return <Navigate to="/admin/login" replace />;
  }

  const updateRow = (index, patch) => {
    setRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, ...patch } : row
    )));
  };

  const runPhase = async (index) => {
    updateRow(index, { status: "RUNNING", evidence: "Running..." });

    try {
      if (index === 0) {
        const { response, body } = await fetchJson("/api/health");
        const pass = response.ok && body?.status === "ok";
        updateRow(index, {
          status: pass ? "PASS" : "FAIL",
          evidence: stringifyEvidence(body),
        });
        return pass;
      }

      if (index === 1) {
        const { body } = await fetchJson("/api/menu");
        const items = menuItemsFrom(body);
        const categories = categoriesFrom(body, items);
        const pass = items.length >= 99 && categories.length >= 10;
        updateRow(index, {
          status: pass ? "PASS" : "FAIL",
          evidence: `Item count: ${items.length}, Categories: [${categories.join(", ")}]`,
        });
        return pass;
      }

      if (index === 2) {
        const csrfToken = await getCsrfToken();
        const payload = {
          guest_name: "SmokeTest",
          guest_phone: "0000000000",
          payment_method: "razorpay",
          source: "customer",
          items: [],
          total: 0,
          idempotency_key: `smoke-test-${Date.now()}`,
        };
        const { response, body } = await fetchJson("/api/orders", {
          method: "POST",
          headers: {
            "Idempotency-Key": payload.idempotency_key,
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          },
          body: JSON.stringify(payload),
        });
        const pass = response.status === 400 || response.status === 422;
        const fail = response.status === 200 || response.status === 201;
        updateRow(index, {
          status: pass ? "PASS" : fail ? "FAIL" : "FAIL",
          evidence: `Status: ${response.status}, Body: ${stringifyEvidence(body)}`,
        });
        return pass;
      }

      if (index === 3) {
        const { response } = await fetchJson("/api/admin/orders");
        const pass = response.status === 401 || response.status === 403;
        updateRow(index, {
          status: pass ? "PASS" : "FAIL",
          evidence: `Response status: ${response.status}`,
        });
        return pass;
      }

      if (index === 4) {
        const { response, body } = await fetchJson("/api/admin/orders", {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const orders = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        const pass = response.status === 200;
        updateRow(index, {
          status: pass ? "PASS" : "FAIL",
          evidence: `Response status: ${response.status}, Order count: ${orders.length}`,
        });
        return pass;
      }

      if (index === 5) {
        const csrfToken = await getCsrfToken();
        const idempotencyKey = `smoke-contact-${Date.now()}`;
        const { response, body } = await fetchJson("/api/contact", {
          method: "POST",
          headers: {
            "Idempotency-Key": idempotencyKey,
            ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
          },
          body: JSON.stringify({
            name: "SmokeTest",
            email: "smoke@test.com",
            message: "smoke test",
          }),
        });
        const pass = response.status === 200 || response.status === 201;
        updateRow(index, {
          status: pass ? "PASS" : "FAIL",
          evidence: `Response status: ${response.status}, Body: ${stringifyEvidence(body)}`,
        });
        return pass;
      }

      if (index === 6) {
        const { response, body } = await fetchJson("/api/orders/pause", {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const pass = response.status === 200 && Object.prototype.hasOwnProperty.call(body || {}, "paused");
        updateRow(index, {
          status: pass ? "PASS" : "FAIL",
          evidence: stringifyEvidence(body),
        });
        return pass;
      }

      if (index === 7) {
        const { body } = await fetchJson("/api/menu");
        const items = menuItemsFrom(body);
        const leaking = items.filter((item) => item.deleted_at);
        const pass = leaking.length === 0;
        updateRow(index, {
          status: pass ? "PASS" : "FAIL",
          evidence: `Items with deleted_at set: ${leaking.length}`,
        });
        return pass;
      }

      const { body } = await fetchJson("/api/health");
      const pass = Object.prototype.hasOwnProperty.call(body || {}, "version");
      updateRow(index, {
        status: pass ? "PASS" : "FAIL",
        evidence: stringifyEvidence(body),
      });
      return pass;
    } catch (error) {
      updateRow(index, {
        status: "FAIL",
        evidence: error?.message || String(error),
      });
      return false;
    }
  };

  const runAll = async () => {
    setRunning(true);
    setRows(initialRows().map((row) => ({ ...row, evidence: "Queued." })));
    for (let index = 0; index < PHASES.length; index += 1) {
      await runPhase(index);
      if (index < PHASES.length - 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
    }
    setRunning(false);
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "#000000",
      color: "#FFD700",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      padding: "32px",
    }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "28px" }}>Jaya Dhaba Production Smoke Test</h1>
          <p style={{ margin: "8px 0 0", color: "#c9ad00" }}>Target: {API_BASE_URL || "VITE_API_URL missing"}</p>
        </div>
        <button
          onClick={runAll}
          disabled={running || !API_BASE_URL}
          style={{
            background: running || !API_BASE_URL ? "#333333" : "#FFD700",
            color: "#000000",
            border: "1px solid #FFD700",
            padding: "12px 18px",
            fontWeight: 800,
            cursor: running || !API_BASE_URL ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {running ? "RUNNING..." : "Run All Tests"}
        </button>
      </header>

      <section style={{ marginTop: "28px", display: "grid", gap: "12px" }}>
        {rows.map((row) => (
          <article
            key={row.name}
            style={{
              border: "1px solid #4d4100",
              padding: "16px",
              background: "#080808",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <h2 style={{ margin: 0, fontSize: "16px" }}>{row.name}</h2>
              <span style={{
                border: `1px solid ${statusColor(row.status)}`,
                color: statusColor(row.status),
                padding: "4px 10px",
                fontWeight: 800,
              }}>
                {row.status}
              </span>
            </div>
            <pre style={{
              margin: "12px 0 0",
              whiteSpace: "pre-wrap",
              color: "#f5df62",
              fontFamily: "inherit",
              fontSize: "13px",
            }}>
              {row.evidence}
            </pre>
          </article>
        ))}
      </section>

      <footer style={{
        marginTop: "20px",
        border: `2px solid ${complete && allPass ? "#00ff66" : complete && failedPhases.length ? "#ff3333" : "#4d4100"}`,
        color: complete && allPass ? "#00ff66" : complete && failedPhases.length ? "#ff3333" : "#FFD700",
        padding: "16px",
        fontWeight: 900,
      }}>
        FINAL VERDICT: {complete && allPass ? "GO" : complete && failedPhases.length ? `NO-GO — Failed: ${failedPhases.join(", ")}` : "PENDING"}
      </footer>
    </main>
  );
}
