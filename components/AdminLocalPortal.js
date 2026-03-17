"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./AdminLocalPortal.module.css";

const SHIRT_SIZE_BUCKETS = ["XS", "S", "M", "L", "XL", "XL+"];
const SECTION_DASHBOARD = "dashboard";
const SECTION_CLIENTS = "clients";

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

function isPdfSource(source) {
  const value = String(source || "").toLowerCase();
  return value.startsWith("data:application/pdf") || value.endsWith(".pdf");
}

function normalizeShirtSizeBucket(value) {
  const compactValue = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9+]/g, "");

  if (!compactValue) {
    return "";
  }

  if (compactValue === "XS" || compactValue === "XSMALL" || compactValue === "EXTRASMALL") {
    return "XS";
  }

  if (compactValue === "S" || compactValue === "SMALL") {
    return "S";
  }

  if (compactValue === "M" || compactValue === "MEDIUM") {
    return "M";
  }

  if (compactValue === "L" || compactValue === "LARGE") {
    return "L";
  }

  if (compactValue === "XL" || compactValue === "XLARGE" || compactValue === "EXTRALARGE") {
    return "XL";
  }

  if (compactValue === "XXL" || /^X{3,}L$/.test(compactValue) || /^[2-9]XL$/.test(compactValue)) {
    return "XL+";
  }

  return "XL+";
}

function formatAddress(row) {
  const allParts = [
    row?.address,
    row?.barangay,
    row?.city_municipality,
    row?.province_state,
    row?.city_prov
  ]
    .filter(Boolean)
    .map(part => part.trim())
    .filter(part => part.length > 0);

  if (!allParts.length) {
    return "-";
  }

  // Remove duplicates while preserving order
  const uniqueParts = [];

  for (const part of allParts) {
    // Skip if this part is already included
    if (uniqueParts.includes(part)) {
      continue;
    }

    // Skip if this part is a substring of any already included part
    const isSubstringOfExisting = uniqueParts.some(existing =>
      existing.toLowerCase().includes(part.toLowerCase())
    );

    if (isSubstringOfExisting) {
      continue;
    }

    // Remove any existing parts that are substrings of this part
    for (let i = uniqueParts.length - 1; i >= 0; i--) {
      if (part.toLowerCase().includes(uniqueParts[i].toLowerCase())) {
        uniqueParts.splice(i, 1);
      }
    }

    uniqueParts.push(part);
  }

  const zipCode = row?.zip_code ? ` ${row.zip_code}` : "";
  return `${uniqueParts.join(", ")}${zipCode}`.trim();
}

function formatPhone(value) {
  if (value == null) {
    return "-";
  }
  const text = String(value).trim();
  return text ? text : "-";
}

export default function AdminLocalPortal() {
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [activeSection, setActiveSection] = useState(SECTION_DASHBOARD);
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [rows, setRows] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [proofModalState, setProofModalState] = useState({ sources: [], index: 0 });
  const [paymentProofCache, setPaymentProofCache] = useState({});
  const [paymentProofLoadingId, setPaymentProofLoadingId] = useState("");
  const [paymentProofNotice, setPaymentProofNotice] = useState({ clientId: "", tone: "", message: "" });
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isExporting, setIsExporting] = useState(false);

  const selectedRow = useMemo(() => rows.find((row) => row.id === selectedId) || null, [rows, selectedId]);
  const selectedProofCount = selectedRow?.payment?.proof_file_count || 0;
  const hasSelectedProof = Boolean(selectedRow?.payment?.has_proof_of_payment) || selectedProofCount > 0;
  const dashboardStats = useMemo(() => {
    let acceptedCount = 0;
    const sizeCounts = SHIRT_SIZE_BUCKETS.reduce((accumulator, sizeKey) => {
      accumulator[sizeKey] = 0;
      return accumulator;
    }, {});

    rows.forEach((row) => {
      if (normalizeReviewStatus(row?.review_status) === "accepted") {
        acceptedCount += 1;
      }

      const bucket = normalizeShirtSizeBucket(row?.shirt_size);
      if (bucket && Object.prototype.hasOwnProperty.call(sizeCounts, bucket)) {
        sizeCounts[bucket] += 1;
      }
    });

    return {
      acceptedCount,
      sizeCounts,
    };
  }, [rows]);
  const proofModalSrc = proofModalState.sources[proofModalState.index] || "";
  const proofModalCount = proofModalState.sources.length;
  const isModalShowingPdf = isPdfSource(proofModalSrc);
  const statusToneClass =
    status.type === "error" ? styles.statusError : status.type === "success" ? styles.statusSuccess : "";

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
      if (showLoading) {
        setIsLoadingRows(false);
      }
    }
  }, []);

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
    if (!isAuthenticated || activeSection !== SECTION_CLIENTS) {
      return;
    }

    loadRows({ showLoading: false }).catch(() => {});
  }, [activeSection, isAuthenticated, loadRows]);

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

  useEffect(() => {
    setPaymentProofNotice({ clientId: "", tone: "", message: "" });
  }, [selectedId]);

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

  const handleViewPaymentProof = async () => {
    if (!selectedRow?.id) {
      return;
    }

    const clientId = selectedRow.id;
    const cachedFiles = paymentProofCache[clientId];
    if (Array.isArray(cachedFiles)) {
      if (cachedFiles.length) {
        openProofModal(cachedFiles, 0);
      } else {
        setPaymentProofNotice({ clientId, tone: "muted", message: "No payment proof found." });
      }
      return;
    }

    setPaymentProofLoadingId(clientId);
    setPaymentProofNotice({ clientId: "", tone: "", message: "" });

    try {
      const response = await fetch(
        `/api/admin/registrations/${encodeURIComponent(clientId)}/payment-proof`,
        { cache: "no-store" }
      );
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Failed to load payment proof.");
      }

      const files = Array.isArray(payload.files)
        ? payload.files.filter((entry) => typeof entry === "string" && entry.trim())
        : [];
      setPaymentProofCache((prev) => ({ ...prev, [clientId]: files }));

      if (files.length) {
        openProofModal(files, 0);
      } else {
        setPaymentProofNotice({ clientId, tone: "muted", message: "No payment proof found." });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load payment proof.";
      setPaymentProofNotice({ clientId, tone: "error", message });
    } finally {
      setPaymentProofLoadingId("");
    }
  };

  const handleExportPdf = async () => {
    const acceptedRows = rows.filter((row) => normalizeReviewStatus(row?.review_status) === "accepted");
    if (!acceptedRows.length) {
      setStatus({ type: "error", message: "No accepted registrations available to export." });
      return;
    }

    setIsExporting(true);
    setStatus({ type: "", message: "" });

    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 40;
      const marginTop = 40;
      const marginBottom = 50;
      const lineHeight = 14;
      let cursorY = marginTop;

      const accentColor = [22, 101, 52];
      const headerBg = [22, 101, 52];
      const headerText = [255, 255, 255];
      const evenRowBg = [245, 250, 247];
      const oddRowBg = [255, 255, 255];
      const borderColor = [209, 213, 219];
      const mutedText = [107, 114, 128];

      const tableColumns = [
        { header: "#", width: 30, align: "center", getValue: (_row, index) => String(index + 1) },
        { header: "Full Name", width: 160, getValue: (row) => buildFullName(row) },
        { header: "Email", width: 170, getValue: (row) => row?.email || "-" },
        { header: "Address", width: 190, getValue: (row) => formatAddress(row) },
        { header: "Contact No.", width: 90, getValue: (row) => formatPhone(row?.contact_no) },
        { header: "Shirt Size", width: 60, align: "center", getValue: (row) => row?.shirt_size || "-" },
        { header: "Category", width: 80, getValue: (row) => row?.category || "-" }
      ];
      const tableWidth = tableColumns.reduce((sum, col) => sum + col.width, 0);
      const tableStartX = Math.max(marginX, (pageWidth - tableWidth) / 2);
      const cellPaddingX = 6;
      const cellPaddingY = 5;

      const addPageFooter = () => {
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
          doc.setPage(i);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...mutedText);
          doc.text(
            `Page ${i} of ${pageCount}`,
            pageWidth / 2,
            pageHeight - 20,
            { align: "center" }
          );
        }
      };

      const renderTableHeader = () => {
        const headerHeight = lineHeight + cellPaddingY * 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...headerText);
        doc.setDrawColor(...borderColor);
        doc.setLineWidth(0.5);
        let headerX = tableStartX;
        tableColumns.forEach((column) => {
          doc.setFillColor(...headerBg);
          doc.rect(headerX, cursorY, column.width, headerHeight, "FD");
          const textX = column.align === "center"
            ? headerX + column.width / 2
            : headerX + cellPaddingX;
          doc.text(
            column.header,
            textX,
            cursorY + cellPaddingY + lineHeight - 3,
            column.align === "center" ? { align: "center" } : undefined
          );
          headerX += column.width;
        });
        cursorY += headerHeight;
      };

      const addPageIfNeeded = (nextHeight = 0) => {
        if (cursorY + nextHeight <= pageHeight - marginBottom) {
          return;
        }
        doc.addPage();
        cursorY = marginTop;
        renderTableHeader();
      };

      // --- Header accent bar ---
      doc.setFillColor(...accentColor);
      doc.rect(0, 0, pageWidth, 6, "F");

      cursorY = marginTop + 10;

      // --- Title ---
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(17, 24, 39);
      doc.text("Accepted Clients Report", marginX, cursorY);
      cursorY += 18;

      // --- Subtitle / date ---
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...mutedText);
      doc.text(`Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, marginX, cursorY);
      cursorY += 24;

      // --- Summary cards row ---
      const acceptedSizeCounts = SHIRT_SIZE_BUCKETS.reduce((accumulator, sizeKey) => {
        accumulator[sizeKey] = 0;
        return accumulator;
      }, {});
      acceptedRows.forEach((row) => {
        const bucket = normalizeShirtSizeBucket(row?.shirt_size);
        if (bucket && Object.prototype.hasOwnProperty.call(acceptedSizeCounts, bucket)) {
          acceptedSizeCounts[bucket] += 1;
        }
      });

      const summaryItems = [
        { label: "Total Accepted", value: String(acceptedRows.length) },
        ...SHIRT_SIZE_BUCKETS.map((sizeKey) => ({
          label: sizeKey,
          value: String(acceptedSizeCounts[sizeKey] || 0)
        }))
      ];
      const cardWidth = 68;
      const cardHeight = 40;
      const cardGap = 8;
      const totalCardsWidth = summaryItems.length * cardWidth + (summaryItems.length - 1) * cardGap;
      let cardX = Math.max(marginX, (pageWidth - totalCardsWidth) / 2);

      summaryItems.forEach((item, i) => {
        const isFirst = i === 0;
        if (isFirst) {
          doc.setFillColor(...accentColor);
        } else {
          doc.setFillColor(241, 245, 249);
        }
        doc.roundedRect(cardX, cursorY, cardWidth, cardHeight, 4, 4, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(isFirst ? 16 : 14);
        if (isFirst) {
          doc.setTextColor(255, 255, 255);
        } else {
          doc.setTextColor(17, 24, 39);
        }
        doc.text(item.value, cardX + cardWidth / 2, cursorY + 18, { align: "center" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        if (isFirst) {
          doc.setTextColor(187, 222, 200);
        } else {
          doc.setTextColor(...mutedText);
        }
        doc.text(item.label, cardX + cardWidth / 2, cursorY + 32, { align: "center" });

        cardX += cardWidth + cardGap;
      });

      cursorY += cardHeight + 20;

      // --- Divider line ---
      doc.setDrawColor(...borderColor);
      doc.setLineWidth(0.5);
      doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
      cursorY += 14;

      // --- Table ---
      renderTableHeader();

      const sortedRows = [...acceptedRows].sort((a, b) => buildFullName(a).localeCompare(buildFullName(b)));

      doc.setFontSize(8);

      sortedRows.forEach((row, rowIndex) => {
        const cellLines = tableColumns.map((column) =>
          doc.splitTextToSize(String(column.getValue(row, rowIndex) || "-"), column.width - cellPaddingX * 2)
        );
        const rowHeight = Math.max(...cellLines.map((lines) => lines.length)) * lineHeight + cellPaddingY * 2;

        addPageIfNeeded(rowHeight);

        const isEven = rowIndex % 2 === 0;
        let cellX = tableStartX;
        doc.setDrawColor(...borderColor);
        doc.setLineWidth(0.25);

        cellLines.forEach((lines, columnIndex) => {
          const column = tableColumns[columnIndex];
          doc.setFillColor(...(isEven ? evenRowBg : oddRowBg));
          doc.rect(cellX, cursorY, column.width, rowHeight, "FD");

          doc.setFont("helvetica", columnIndex === 1 ? "bold" : "normal");
          doc.setTextColor(17, 24, 39);
          lines.forEach((line, lineIndex) => {
            const textX = column.align === "center"
              ? cellX + column.width / 2
              : cellX + cellPaddingX;
            doc.text(
              line,
              textX,
              cursorY + cellPaddingY + lineHeight * (lineIndex + 1) - 3,
              column.align === "center" ? { align: "center" } : undefined
            );
          });
          cellX += column.width;
        });

        cursorY += rowHeight;
      });

      // --- Bottom border for table ---
      doc.setDrawColor(...accentColor);
      doc.setLineWidth(1.5);
      doc.line(tableStartX, cursorY, tableStartX + tableWidth, cursorY);

      addPageFooter();

      doc.save("accepted-clients-report.pdf");
      setStatus({ type: "success", message: "Accepted clients report exported to PDF." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to export PDF.";
      setStatus({ type: "error", message });
    } finally {
      setIsExporting(false);
    }
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
    <main className={`${styles.shell} ${styles.shellApp}`.trim()}>
      <section className={styles.appCard}>
        <div className={styles.appLayout}>
          <aside className={styles.sidebar}>
            <p className={styles.sidebarTitle}>Navigation</p>
            <button
              className={`${styles.sidebarButton} ${activeSection === SECTION_DASHBOARD ? styles.sidebarButtonActive : ""}`.trim()}
              type="button"
              onClick={() => setActiveSection(SECTION_DASHBOARD)}
            >
              Dashboard
            </button>
            <button
              className={`${styles.sidebarButton} ${activeSection === SECTION_CLIENTS ? styles.sidebarButtonActive : ""}`.trim()}
              type="button"
              onClick={() => setActiveSection(SECTION_CLIENTS)}
            >
              Clients List
            </button>
          </aside>

          <div className={styles.mainPanel}>
            <header className={styles.header}>
              <div>
                <p className={styles.eyebrow}>Localhost Access</p>
                <h1 className={styles.title}>Admin Portal</h1>
              </div>
              <div className={styles.headerActions}>
                {activeSection === SECTION_CLIENTS ? (
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={handleExportPdf}
                    disabled={isExporting || isLoadingRows || !rows.length}
                  >
                    {isExporting ? "Exporting..." : "Export PDF"}
                  </button>
                ) : null}
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

            {activeSection === SECTION_DASHBOARD ? (
              <section className={styles.dashboardSection} aria-label="Admin dashboard summary">
                <div className={styles.dashboardCards}>
                  <article className={styles.dashboardCard}>
                    <p className={styles.dashboardCardLabel}>Approved</p>
                    <p className={styles.dashboardCardValue}>{dashboardStats.acceptedCount}</p>
                  </article>
                </div>

                <div className={styles.shirtSection}>
                  <h2 className={styles.shirtSectionTitle}>Applicants by T-shirt Size</h2>
                  <div className={styles.shirtGrid}>
                    {SHIRT_SIZE_BUCKETS.map((sizeKey) => (
                      <div key={sizeKey} className={styles.shirtItem}>
                        <span className={styles.shirtSize}>{sizeKey}</span>
                        <span className={styles.shirtCount}>{dashboardStats.sizeCounts[sizeKey] || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
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
                          <dt>Phone</dt>
                          <dd>{selectedRow.contact_no || "-"}</dd>
                        </div>
                        <div className={styles.detailRow}>
                          <dt>Category</dt>
                          <dd>{selectedRow.category || "-"}</dd>
                        </div>
                        <div className={styles.detailRow}>
                          <dt>Shirt Size</dt>
                          <dd>{selectedRow.shirt_size || "-"}</dd>
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
                          <dt>Last Updated</dt>
                          <dd>{formatDateTime(selectedRow.updated_at || selectedRow.created_at)}</dd>
                        </div>
                        <div className={styles.detailRow}>
                          <dt>Payment Proof</dt>
                          <dd>
                            {hasSelectedProof ? (
                              <div className={styles.proofPreviewList}>
                                <button
                                  className={styles.proofPreviewButton}
                                  type="button"
                                  onClick={handleViewPaymentProof}
                                  disabled={paymentProofLoadingId === selectedRow.id}
                                >
                                  {paymentProofLoadingId === selectedRow.id
                                    ? "Loading Proof..."
                                    : selectedProofCount > 1
                                      ? `View Payment Proofs (${selectedProofCount})`
                                      : "View Payment Proof"}
                                </button>
                                {paymentProofNotice.clientId === selectedRow.id && paymentProofNotice.message ? (
                                  <span
                                    className={`${styles.proofNotice} ${
                                      paymentProofNotice.tone === "error" ? styles.proofNoticeError : ""
                                    }`.trim()}
                                  >
                                    {paymentProofNotice.message}
                                  </span>
                                ) : null}
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
            )}
          </div>
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
            <div className={styles.proofModalMedia}>
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
        </div>
      ) : null}
    </main>
  );
}
