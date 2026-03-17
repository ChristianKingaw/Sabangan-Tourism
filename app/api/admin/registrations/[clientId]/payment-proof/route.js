import { getFirebaseDb } from "../../../../../../lib/firebaseAdmin";
import { getAdminPassword, getAdminSessionFromRequest, getAdminUsername } from "../../../../../../lib/adminAuth";
import { withTimeout } from "../../../../../../lib/withTimeout";
import { isLocalAdminRequest } from "../../../../../../lib/adminAccess";

export const runtime = "nodejs";

async function getRouteClientId(context) {
  const maybeParams = context?.params;
  const params =
    maybeParams && typeof maybeParams.then === "function"
      ? await maybeParams
      : maybeParams;
  const clientId = typeof params?.clientId === "string" ? params.clientId.trim() : "";
  return clientId;
}

function parseProofOfPaymentFiles(value) {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === "string" && entry.trim())
      .map((entry) => entry.trim());
  }

  if (typeof value !== "string") {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (!trimmed.startsWith("[")) {
    return [trimmed];
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return [trimmed];
    }
    return parsed
      .filter((entry) => typeof entry === "string" && entry.trim())
      .map((entry) => entry.trim());
  } catch {
    return [trimmed];
  }
}

function getRealtimeDatabaseUrl() {
  const direct = process.env.FIREBASE_DATABASE_URL;
  const publicUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  const value = typeof direct === "string" && direct.trim() ? direct.trim() : (publicUrl || "").trim();
  return value.replace(/\/+$/, "");
}

function getRealtimeAuthToken() {
  const token = process.env.FIREBASE_DATABASE_SECRET || process.env.FIREBASE_AUTH_TOKEN || "";
  return token.trim();
}

function getFirebaseApiKey() {
  const direct = process.env.FIREBASE_API_KEY;
  const publicKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const value = typeof direct === "string" && direct.trim() ? direct.trim() : (publicKey || "").trim();
  return value;
}

function buildRealtimeUrl(baseUrl, nodePath, sessionToken = "") {
  const token = sessionToken || getRealtimeAuthToken();
  const url = `${baseUrl}/${nodePath}.json`;
  if (!token) {
    return url;
  }

  return `${url}?auth=${encodeURIComponent(token)}`;
}

async function readWithRealtimeRest(baseUrl, nodePath, sessionToken = "") {
  const response = await fetch(buildRealtimeUrl(baseUrl, nodePath, sessionToken), {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Realtime DB REST read failed (${response.status}): ${errorText || "Unknown error"}`);
  }

  return response.json();
}

async function parseFirebaseAuthError(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    return "Unknown Firebase Auth error.";
  }

  const code = payload?.error?.message;
  if (typeof code !== "string" || !code) {
    return "Unknown Firebase Auth error.";
  }

  return code;
}

async function fetchFreshAdminFirebaseIdToken() {
  const apiKey = getFirebaseApiKey();
  if (!apiKey) {
    return "";
  }

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: getAdminUsername(),
      password: getAdminPassword(),
      returnSecureToken: true
    })
  });

  if (!response.ok) {
    throw new Error(await parseFirebaseAuthError(response));
  }

  const payload = await response.json();
  return typeof payload?.idToken === "string" ? payload.idToken : "";
}

function normalizePayment(rawPayment, fallbackId = "") {
  if (!rawPayment || typeof rawPayment !== "object") {
    return null;
  }

  return {
    id: typeof rawPayment.id === "string" && rawPayment.id ? rawPayment.id : fallbackId,
    client_id: typeof rawPayment.client_id === "string" ? rawPayment.client_id : "",
    created_at: typeof rawPayment.created_at === "string" ? rawPayment.created_at : "",
    proof_of_payment: rawPayment.proof_of_payment
  };
}

function pickLatestPaymentForClient(rawPayments, clientId) {
  if (!rawPayments || typeof rawPayments !== "object" || !clientId) {
    return null;
  }

  let latest = null;
  Object.entries(rawPayments).forEach(([paymentKey, rawPayment]) => {
    const payment = normalizePayment(rawPayment, paymentKey);
    if (!payment || payment.client_id !== clientId) {
      return;
    }

    const latestTime = latest?.created_at ? Date.parse(latest.created_at) : 0;
    const nextTime = payment.created_at ? Date.parse(payment.created_at) : 0;
    if (!latest || (Number.isFinite(nextTime) ? nextTime : 0) >= (Number.isFinite(latestTime) ? latestTime : 0)) {
      latest = payment;
    }
  });

  return latest;
}

function getProofFilesForClient(rawPayments, clientId) {
  const payment = pickLatestPaymentForClient(rawPayments, clientId);
  return parseProofOfPaymentFiles(payment?.proof_of_payment);
}

async function loadPaymentProofFiles(clientId, session) {
  try {
    return await withTimeout(async () => {
      const db = getFirebaseDb();
      const paymentsSnapshot = await db.ref("payments").orderByChild("client_id").equalTo(clientId).get();
      return getProofFilesForClient(paymentsSnapshot.exists() ? paymentsSnapshot.val() : {}, clientId);
    }, 4500, "Firebase Admin payment proof read");
  } catch {
    const baseUrl = getRealtimeDatabaseUrl();
    if (!baseUrl) {
      throw new Error("Missing Firebase Realtime Database URL.");
    }

    let token = typeof session?.firebase_id_token === "string" ? session.firebase_id_token : "";
    const runRead = async () => {
      const rawPayments = await readWithRealtimeRest(baseUrl, "payments", token);
      return getProofFilesForClient(rawPayments, clientId);
    };

    try {
      return await runRead();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("Permission denied")) {
        throw error;
      }

      token = await fetchFreshAdminFirebaseIdToken();
      if (!token) {
        throw error;
      }
      return await runRead();
    }
  }
}

export async function GET(request, context) {
  if (!isLocalAdminRequest(request)) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const clientId = await getRouteClientId(context);
  if (!clientId) {
    return Response.json({ ok: false, error: "Invalid client ID." }, { status: 400 });
  }

  try {
    const files = await loadPaymentProofFiles(clientId, session);
    return Response.json({
      ok: true,
      count: files.length,
      files
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load payment proof.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
