"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./AdminLocalPortal.module.css";

function buildFullName(row) {
  return [row?.fname, row?.mname, row?.lname].filter(Boolean).join(" ").trim() || "Unknown";
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default function AdminLocalPortal() {
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [proofModalSrc, setProofModalSrc] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });

  const selectedRow = useMemo(() => rows.find((row) => row.id === selectedId) || null, [rows, selectedId]);
  const statusToneClass =
    status.type === "error" ? styles.statusError : status.type === "success" ? styles.statusSuccess : "";

  const loadRows = async () => {
    setIsLoadingRows(true);
    try {
      const response = await fetch("/api/admin/registrations", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401 || response.status === 404) {
        setIsAuthenticated(false);
        setRows([]);
        setSelectedId("");
        return;
      }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to load registrations.");
      }

      const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
      setRows(nextRows);
      setSelectedId((current) => (current && nextRows.some((row) => row.id === current) ? current : (nextRows[0]?.id || "")));
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load registrations."
      });
    } finally {
      setIsLoadingRows(false);
    }
  };

  useEffect(() => {
    const boot = async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const payload = await response.json();
        const authenticated = Boolean(payload?.authenticated);
        setIsAuthenticated(authenticated);
        if (authenticated) {
          await loadRows();
        }
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsBootLoading(false);
      }
    };
    boot().catch(() => {
      setIsAuthenticated(false);
      setIsBootLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!proofModalSrc) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setProofModalSrc("");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [proofModalSrc]);

  const handleCredentialChange = (event) => {
    const { name, value } = event.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setIsLoggingIn(true);
    setStatus({ type: "", message: "" });
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials)
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Login failed.");
      }
      setIsAuthenticated(true);
      setStatus({ type: "success", message: "Logged in." });
      await loadRows();
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Login failed."
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    setStatus({ type: "", message: "" });
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      setIsAuthenticated(false);
      setRows([]);
      setSelectedId("");
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleReview = async (action) => {
    if (!selectedRow || !selectedRow.id) {
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to ${action} this registration?`);
    if (!confirmed) {
      return;
    }

    setActionLoading(action);
    setStatus({ type: "", message: "" });
    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(selectedRow.id)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to update registration.");
      }

      if (action === "delete") {
        setRows((prev) => prev.filter((row) => row.id !== selectedRow.id));
        setSelectedId("");
        setStatus({ type: "success", message: "Registration deleted." });
        return;
      }

      const nextStatus = action === "accept" ? "accepted" : "rejected";
      setRows((prev) =>
        prev.map((row) =>
          row.id === selectedRow.id
            ? {
                ...row,
                review_status: nextStatus,
                reviewed_at: new Date().toISOString()
              }
            : row
        )
      );
      setStatus({ type: "success", message: `Registration ${nextStatus}.` });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update registration."
      });
    } finally {
      setActionLoading("");
    }
  };

  const openProofModal = (source) => {
    if (!source) {
      return;
    }
    setProofModalSrc(source);
  };

  const closeProofModal = () => {
    setProofModalSrc("");
  };

  if (isBootLoading) {
    return (
      <main className={styles.shell}>
        <section className={styles.loadingCard}>Loading admin...</section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className={styles.shell}>
        <section className={styles.loginCard}>
          <p className={styles.eyebrow}>Localhost Access</p>
          <h1 className={styles.title}>Admin Portal</h1>
          <p className={styles.subtitle}>This panel is available only when running locally.</p>
          <form onSubmit={handleLogin} className={styles.loginForm}>
            <label className={styles.label} htmlFor="admin-username">
              Username
            </label>
            <input
              id="admin-username"
              className={styles.input}
              name="username"
              type="email"
              placeholder="Username"
              value={credentials.username}
              onChange={handleCredentialChange}
              required
            />
            <label className={styles.label} htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              className={styles.input}
              name="password"
              type="password"
              placeholder="Password"
              value={credentials.password}
              onChange={handleCredentialChange}
              required
            />
            <button className={styles.primaryButton} type="submit" disabled={isLoggingIn}>
              {isLoggingIn ? "Signing in..." : "Sign In"}
            </button>
          </form>
          {status.message ? <p className={`${styles.status} ${statusToneClass}`.trim()}>{status.message}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <section className={styles.appCard}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Localhost Access</p>
            <h1 className={styles.title}>Admin Portal</h1>
          </div>
          <div className={styles.headerActions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={loadRows}
              disabled={isLoadingRows || isLoggingOut}
            >
              {isLoadingRows ? "Refreshing..." : "Refresh"}
            </button>
            <button className={styles.secondaryButton} type="button" onClick={handleLogout} disabled={isLoggingOut}>
              {isLoggingOut ? "Signing out..." : "Logout"}
            </button>
          </div>
        </header>

        {status.message ? <p className={`${styles.status} ${statusToneClass}`.trim()}>{status.message}</p> : null}

        <div className={styles.contentGrid}>
          <section className={styles.listPanel}>
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={`${styles.rowButton} ${selectedId === row.id ? styles.rowButtonActive : ""}`.trim()}
              >
                <div className={styles.rowName}>{buildFullName(row)}</div>
                <div className={styles.rowMeta}>{row.email || "-"}</div>
                <div className={styles.rowStatus}>{row.review_status || "pending"}</div>
              </button>
            ))}
            {!rows.length ? <p className={styles.emptyState}>No registrations yet.</p> : null}
          </section>

          <section className={styles.detailPanel}>
            {selectedRow ? (
              <>
                <h2 className={styles.detailTitle}>{buildFullName(selectedRow)}</h2>
                <dl className={styles.detailList}>
                  <div className={styles.detailRow}>
                    <dt>Email</dt>
                    <dd>{selectedRow.email || "-"}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Category</dt>
                    <dd>{selectedRow.category || "-"}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>City/Province</dt>
                    <dd>{selectedRow.city_prov || "-"}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Status</dt>
                    <dd>{selectedRow.review_status || "pending"}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Registered</dt>
                    <dd>{formatDateTime(selectedRow.created_at)}</dd>
                  </div>
                  <div className={styles.detailRow}>
                    <dt>Payment Proof</dt>
                    <dd>
                      {selectedRow.payment?.proof_of_payment ? (
                        <button
                          className={styles.proofPreviewButton}
                          type="button"
                          onClick={() => openProofModal(selectedRow.payment.proof_of_payment)}
                        >
                          View Payment Proof
                        </button>
                      ) : (
                        "None"
                      )}
                    </dd>
                  </div>
                </dl>
                <div className={styles.actionRow}>
                  <button
                    className={`${styles.actionButton} ${styles.acceptButton}`.trim()}
                    type="button"
                    onClick={() => handleReview("accept")}
                    disabled={actionLoading !== ""}
                  >
                    {actionLoading === "accept" ? "Accepting..." : "Accept"}
                  </button>
                  <button
                    className={`${styles.actionButton} ${styles.rejectButton}`.trim()}
                    type="button"
                    onClick={() => handleReview("reject")}
                    disabled={actionLoading !== ""}
                  >
                    {actionLoading === "reject" ? "Rejecting..." : "Reject"}
                  </button>
                  <button
                    className={`${styles.actionButton} ${styles.deleteButton}`.trim()}
                    type="button"
                    onClick={() => handleReview("delete")}
                    disabled={actionLoading !== ""}
                  >
                    {actionLoading === "delete" ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </>
            ) : (
              <p className={styles.emptyState}>Select a registration.</p>
            )}
          </section>
        </div>
      </section>
      {proofModalSrc ? (
        <div className={styles.proofModalBackdrop} role="presentation" onClick={closeProofModal}>
          <div
            className={styles.proofModal}
            role="dialog"
            aria-modal="true"
            aria-label="Payment proof preview"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className={styles.proofModalClose}
              type="button"
              onClick={closeProofModal}
              aria-label="Close payment proof preview"
            >
              Close
            </button>
            <img className={styles.proofModalImage} src={proofModalSrc} alt="Payment proof" />
          </div>
        </div>
      ) : null}
    </main>
  );
}
