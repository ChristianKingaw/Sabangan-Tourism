"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./AdminLocalPortal.module.css";

const AUTO_REFRESH_INTERVAL_MS = 60000;

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

function normalizeReviewStatus(value) {
  if (typeof value !== "string") {
    return "pending";
  }
  return value.trim().toLowerCase() || "pending";
}

function getPaymentProofFiles(payment) {
  if (!payment) {
    return [];
  }

  if (Array.isArray(payment.proof_of_payment_files)) {
    return payment.proof_of_payment_files.filter((entry) => typeof entry === "string" && entry.trim());
  }

  if (typeof payment.proof_of_payment === "string" && payment.proof_of_payment.trim()) {
    return [payment.proof_of_payment.trim()];
  }

  return [];
}

function isPdfSource(source) {
  const value = String(source || "").toLowerCase();
  return value.startsWith("data:application/pdf") || value.endsWith(".pdf");
}

export default function AdminLocalPortal() {
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [acceptMode, setAcceptMode] = useState("auto");
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [proofModalState, setProofModalState] = useState({ sources: [], index: 0 });
  const [status, setStatus] = useState({ type: "", message: "" });
  const knownClientIdsRef = useRef(new Set());
  const queuedAutoAcceptIdsRef = useRef(new Set());
  const autoAcceptInFlightIdsRef = useRef(new Set());
  const hasBaselineSnapshotRef = useRef(false);

  const selectedRow = useMemo(() => rows.find((row) => row.id === selectedId) || null, [rows, selectedId]);
  const selectedPaymentProofFiles = useMemo(
    () => getPaymentProofFiles(selectedRow?.payment),
    [selectedRow]
  );
  const proofModalSrc = proofModalState.sources[proofModalState.index] || "";
  const proofModalCount = proofModalState.sources.length;
  const isModalShowingPdf = isPdfSource(proofModalSrc);
  const statusToneClass =
    status.type === "error" ? styles.statusError : status.type === "success" ? styles.statusSuccess : "";

  const resetAutoTracking = useCallback(() => {
    knownClientIdsRef.current.clear();
    queuedAutoAcceptIdsRef.current.clear();
    autoAcceptInFlightIdsRef.current.clear();
    hasBaselineSnapshotRef.current = false;
  }, []);

  const submitReviewById = useCallback(async (clientId, action, { silent = false } = {}) => {
    if (!clientId) {
      return { ok: false, error: "Invalid client ID." };
    }

    if (!silent) {
      setActionLoading(action);
      setStatus({ type: "", message: "" });
    }

    try {
      const response = await fetch(`/api/admin/registrations/${encodeURIComponent(clientId)}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to update registration.");
      }

      if (action === "delete") {
        setRows((prev) => prev.filter((row) => row.id !== clientId));
        setSelectedId((current) => (current === clientId ? "" : current));
        queuedAutoAcceptIdsRef.current.delete(clientId);
        if (!silent) {
          setStatus({ type: "success", message: "Registration deleted." });
        }
        return { ok: true, payload };
      }

      const nextStatus = action === "accept" ? "accepted" : "rejected";
      setRows((prev) =>
        prev.map((row) =>
          row.id === clientId
            ? {
                ...row,
                review_status: nextStatus,
                reviewed_at: new Date().toISOString()
              }
            : row
        )
      );
      queuedAutoAcceptIdsRef.current.delete(clientId);

      if (!silent && (action === "accept" || action === "reject") && payload.email_sent === false) {
        const statusWord = action === "accept" ? "accepted" : "rejected";
        const emailLabel = action === "accept" ? "confirmation" : "notification";
        setStatus({
          type: "error",
          message: `Registration ${statusWord}, but ${emailLabel} email failed: ${payload.email_error || "Unknown email error."}`
        });
        return { ok: true, payload };
      }

      if (!silent && (action === "accept" || action === "reject") && payload.email_sent === true) {
        const statusWord = action === "accept" ? "accepted" : "rejected";
        const emailLabel = action === "accept" ? "confirmation" : "notification";
        setStatus({ type: "success", message: `Registration ${statusWord} and ${emailLabel} email sent.` });
        return { ok: true, payload };
      }

      if (!silent) {
        setStatus({ type: "success", message: `Registration ${nextStatus}.` });
      }

      return { ok: true, payload };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update registration.";
      if (!silent) {
        setStatus({
          type: "error",
          message
        });
      }
      return { ok: false, error: message };
    } finally {
      if (!silent) {
        setActionLoading("");
      }
    }
  }, []);

  const autoAcceptQueuedClients = useCallback(async (snapshotRows) => {
    const queuedIds = queuedAutoAcceptIdsRef.current;
    const inFlightIds = autoAcceptInFlightIdsRef.current;
    const candidates = snapshotRows.filter((row) => {
      const clientId = row?.id;
      if (!clientId || !queuedIds.has(clientId)) {
        return false;
      }
      if (normalizeReviewStatus(row.review_status) !== "pending") {
        queuedIds.delete(clientId);
        return false;
      }
      return !inFlightIds.has(clientId);
    });

    if (!candidates.length) {
      return;
    }

    let acceptedCount = 0;
    let failedCount = 0;

    for (const row of candidates) {
      const clientId = row.id;
      inFlightIds.add(clientId);
      try {
        const result = await submitReviewById(clientId, "accept", { silent: true });
        if (result.ok) {
          acceptedCount += 1;
          queuedIds.delete(clientId);
        } else {
          failedCount += 1;
        }
      } finally {
        inFlightIds.delete(clientId);
      }
    }

    if (failedCount > 0) {
      setStatus({
        type: "error",
        message: `Auto-accept completed: ${acceptedCount} accepted, ${failedCount} failed.`
      });
      return;
    }

    if (acceptedCount > 0) {
      setStatus({
        type: "success",
        message: `Auto-accepted ${acceptedCount} new registration${acceptedCount === 1 ? "" : "s"}.`
      });
    }
  }, [submitReviewById]);

  const loadRows = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setIsLoadingRows(true);
    }

    try {
      const response = await fetch("/api/admin/registrations", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401 || response.status === 404) {
        setIsAuthenticated(false);
        setRows([]);
        setSelectedId("");
        resetAutoTracking();
        return;
      }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to load registrations.");
      }

      const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
      setRows(nextRows);
      setSelectedId((current) => (current && nextRows.some((row) => row.id === current) ? current : (nextRows[0]?.id || "")));

      if (!hasBaselineSnapshotRef.current) {
        knownClientIdsRef.current = new Set(nextRows.map((row) => row.id).filter(Boolean));
        queuedAutoAcceptIdsRef.current.clear();
        hasBaselineSnapshotRef.current = true;
        return;
      }

      const knownClientIds = knownClientIdsRef.current;
      nextRows.forEach((row) => {
        if (!row?.id || knownClientIds.has(row.id)) {
          return;
        }
        knownClientIds.add(row.id);
        queuedAutoAcceptIdsRef.current.add(row.id);
      });

      const rowsById = new Map(nextRows.filter((row) => row?.id).map((row) => [row.id, row]));
      for (const queuedClientId of Array.from(queuedAutoAcceptIdsRef.current)) {
        const row = rowsById.get(queuedClientId);
        if (!row || normalizeReviewStatus(row.review_status) !== "pending") {
          queuedAutoAcceptIdsRef.current.delete(queuedClientId);
        }
      }

      if (acceptMode === "auto") {
        await autoAcceptQueuedClients(nextRows);
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load registrations."
      });
    } finally {
      if (showLoading) {
        setIsLoadingRows(false);
      }
    }
  }, [acceptMode, autoAcceptQueuedClients, resetAutoTracking]);

  useEffect(() => {
    const boot = async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const payload = await response.json();
        const authenticated = Boolean(payload?.authenticated);
        setIsAuthenticated(authenticated);
        if (authenticated) {
          await loadRows({ showLoading: true });
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
  }, [loadRows]);

  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    const timerId = setInterval(() => {
      loadRows({ showLoading: false }).catch(() => {});
    }, AUTO_REFRESH_INTERVAL_MS);

    return () => clearInterval(timerId);
  }, [isAuthenticated, loadRows]);

  useEffect(() => {
    if (!proofModalSrc) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setProofModalState({ sources: [], index: 0 });
        return;
      }

      if (event.key === "ArrowRight") {
        setProofModalState((current) => {
          if (!current.sources.length) {
            return current;
          }
          return {
            ...current,
            index: (current.index + 1) % current.sources.length
          };
        });
        return;
      }

      if (event.key === "ArrowLeft") {
        setProofModalState((current) => {
          if (!current.sources.length) {
            return current;
          }
          return {
            ...current,
            index: (current.index - 1 + current.sources.length) % current.sources.length
          };
        });
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
      resetAutoTracking();
      await loadRows({ showLoading: true });
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
      resetAutoTracking();
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

    await submitReviewById(selectedRow.id, action);
  };

  const handleModeChange = (nextMode) => {
    if (nextMode === acceptMode) {
      return;
    }

    setAcceptMode(nextMode);
    if (nextMode === "manual") {
      setStatus({ type: "success", message: "Switched to manual accept mode." });
      return;
    }

    setStatus({ type: "success", message: "Switched to auto accept mode." });
    autoAcceptQueuedClients(rows).catch(() => {});
  };

  const openProofModal = (sources, startIndex = 0) => {
    const normalizedSources = Array.isArray(sources) ? sources : [sources];
    const sanitizedSources = normalizedSources.filter((entry) => typeof entry === "string" && entry.trim());
    if (!sanitizedSources.length) {
      return;
    }
    const safeStartIndex = Math.max(0, Math.min(startIndex, sanitizedSources.length - 1));
    setProofModalState({ sources: sanitizedSources, index: safeStartIndex });
  };

  const closeProofModal = () => {
    setProofModalState({ sources: [], index: 0 });
  };

  const showNextProof = () => {
    setProofModalState((current) => {
      if (!current.sources.length) {
        return current;
      }
      return {
        ...current,
        index: (current.index + 1) % current.sources.length
      };
    });
  };

  const showPreviousProof = () => {
    setProofModalState((current) => {
      if (!current.sources.length) {
        return current;
      }
      return {
        ...current,
        index: (current.index - 1 + current.sources.length) % current.sources.length
      };
    });
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
            <div className={styles.acceptModeButtons} role="group" aria-label="Acceptance mode">
              <button
                className={`${styles.secondaryButton} ${acceptMode === "manual" ? styles.modeButtonActive : ""}`.trim()}
                type="button"
                onClick={() => handleModeChange("manual")}
                disabled={isLoadingRows || isLoggingOut}
              >
                Manual Accept
              </button>
              <button
                className={`${styles.secondaryButton} ${acceptMode === "auto" ? styles.modeButtonActive : ""}`.trim()}
                type="button"
                onClick={() => handleModeChange("auto")}
                disabled={isLoadingRows || isLoggingOut}
              >
                Auto Accept
              </button>
            </div>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => {
                loadRows({ showLoading: true }).catch(() => {});
              }}
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
                      {selectedPaymentProofFiles.length ? (
                        <div className={styles.proofPreviewList}>
                          {selectedPaymentProofFiles.map((source, index) => (
                            <button
                              key={`${source}-${index}`}
                              className={styles.proofPreviewButton}
                              type="button"
                              onClick={() => openProofModal(selectedPaymentProofFiles, index)}
                            >
                              {selectedPaymentProofFiles.length === 1 ? "View Payment Proof" : `View Proof ${index + 1}`}
                            </button>
                          ))}
                        </div>
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
            <div className={styles.proofModalToolbar}>
              <p className={styles.proofModalCounter}>
                {proofModalCount > 1
                  ? `Proof ${proofModalState.index + 1} of ${proofModalCount}`
                  : "Payment proof"}
              </p>
              <div className={styles.proofModalActions}>
                {proofModalCount > 1 ? (
                  <>
                    <button
                      className={styles.proofModalNavButton}
                      type="button"
                      onClick={showPreviousProof}
                      aria-label="Show previous payment proof"
                    >
                      Prev
                    </button>
                    <button
                      className={styles.proofModalNavButton}
                      type="button"
                      onClick={showNextProof}
                      aria-label="Show next payment proof"
                    >
                      Next
                    </button>
                  </>
                ) : null}
                <a
                  className={styles.proofModalOpenLink}
                  href={proofModalSrc}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open
                </a>
                <button
                  className={styles.proofModalClose}
                  type="button"
                  onClick={closeProofModal}
                  aria-label="Close payment proof preview"
                >
                  Close
                </button>
              </div>
            </div>
            {isModalShowingPdf ? (
              <iframe
                className={styles.proofModalFrame}
                src={proofModalSrc}
                title="Payment proof PDF"
              />
            ) : (
              <img className={styles.proofModalImage} src={proofModalSrc} alt="Payment proof" />
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
