import { getFirebaseDb } from "../../../../lib/firebaseAdmin";
import { getAdminPassword, getAdminSessionFromRequest, getAdminUsername } from "../../../../lib/adminAuth";
import { withTimeout } from "../../../../lib/withTimeout";
import { isLocalAdminRequest } from "../../../../lib/adminAccess";

export const runtime = "nodejs";

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

function normalizeAdminRows(rawClients, rawPayments) {
  const clientsSource = rawClients && typeof rawClients === "object" ? rawClients : {};
  const paymentsSource = rawPayments && typeof rawPayments === "object" ? rawPayments : {};

  const paymentsByClientId = new Map();
  Object.entries(paymentsSource).forEach(([paymentKey, payment]) => {
    if (!payment || typeof payment !== "object") {
      return;
    }
    const normalizedPayment = {
      ...payment,
      id: typeof payment.id === "string" && payment.id ? payment.id : paymentKey
    };

    const clientId = typeof normalizedPayment.client_id === "string" ? normalizedPayment.client_id : "";
    if (!clientId) {
      return;
    }

    const current = paymentsByClientId.get(clientId);
    const currentTime = current?.created_at ? Date.parse(current.created_at) : 0;
    const nextTime = typeof normalizedPayment.created_at === "string" ? Date.parse(normalizedPayment.created_at) : 0;
    if (!current || (Number.isFinite(nextTime) ? nextTime : 0) >= (Number.isFinite(currentTime) ? currentTime : 0)) {
      paymentsByClientId.set(clientId, normalizedPayment);
    }
  });

  return Object.entries(clientsSource)
    .map(([clientKey, client]) => {
      if (!client || typeof client !== "object") {
        return null;
      }
      const clientId = typeof client.id === "string" && client.id ? client.id : clientKey;
      const payment = paymentsByClientId.get(clientId) || null;
      return {
        id: clientId,
        email: typeof client.email === "string" ? client.email : "",
        fname: typeof client.fname === "string" ? client.fname : "",
        mname: typeof client.mname === "string" ? client.mname : "",
        lname: typeof client.lname === "string" ? client.lname : "",
        dob: typeof client.dob === "string" ? client.dob : "",
        gender: typeof client.gender === "string" ? client.gender : "",
        nationality: typeof client.nationality === "string" ? client.nationality : "",
        province_state: typeof client.province_state === "string" ? client.province_state : "",
        city_municipality: typeof client.city_municipality === "string" ? client.city_municipality : "",
        barangay: typeof client.barangay === "string" ? client.barangay : "",
        zip_code: typeof client.zip_code === "string" ? client.zip_code : "",
        address: typeof client.address === "string" ? client.address : "",
        city_prov: typeof client.city_prov === "string" ? client.city_prov : "",
        contact_no: typeof client.contact_no === "string" ? client.contact_no : "",
        health_condition: typeof client.health_condition === "string" ? client.health_condition : "",
        health_condition_details:
          typeof client.health_condition_details === "string" ? client.health_condition_details : "",
        category: typeof client.category === "string" ? client.category : "",
        shirt_size: typeof client.shirt_size === "string" ? client.shirt_size : "",
        emergency_full_name: typeof client.emergency_full_name === "string" ? client.emergency_full_name : "",
        emergency_contact_no: typeof client.emergency_contact_no === "string" ? client.emergency_contact_no : "",
        event_id: typeof client.event_id === "string" ? client.event_id : "",
        review_status: typeof client.review_status === "string" ? client.review_status : "pending",
        reviewed_at: typeof client.reviewed_at === "string" ? client.reviewed_at : "",
        reviewed_by: typeof client.reviewed_by === "string" ? client.reviewed_by : "",
        created_at: typeof client.created_at === "string" ? client.created_at : "",
        updated_at: typeof client.updated_at === "string" ? client.updated_at : "",
        payment: payment
          ? {
              id: typeof payment.id === "string" ? payment.id : "",
              payment_method: typeof payment.payment_method === "string" ? payment.payment_method : "",
              amount: typeof payment.amount === "number" ? payment.amount : Number(payment.amount || 0),
              proof_of_payment: typeof payment.proof_of_payment === "string" ? payment.proof_of_payment : "",
              created_at: typeof payment.created_at === "string" ? payment.created_at : "",
              updated_at: typeof payment.updated_at === "string" ? payment.updated_at : ""
            }
          : null
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = a.created_at ? Date.parse(a.created_at) : 0;
      const bTime = b.created_at ? Date.parse(b.created_at) : 0;
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    });
}

async function loadRegistrations(session) {
  try {
    const rows = await withTimeout(async () => {
      const db = getFirebaseDb();
      const [clientsSnapshot, paymentsSnapshot] = await Promise.all([db.ref("clients").get(), db.ref("payments").get()]);
      return normalizeAdminRows(
        clientsSnapshot.exists() ? clientsSnapshot.val() : {},
        paymentsSnapshot.exists() ? paymentsSnapshot.val() : {}
      );
    }, 5000, "Firebase Admin read");
    return rows;
  } catch {
    const baseUrl = getRealtimeDatabaseUrl();
    if (!baseUrl) {
      throw new Error("Missing Firebase Realtime Database URL.");
    }

    let token = typeof session?.firebase_id_token === "string" ? session.firebase_id_token : "";
    const runRead = async () => {
      const [rawClients, rawPayments] = await Promise.all([
        readWithRealtimeRest(baseUrl, "clients", token),
        readWithRealtimeRest(baseUrl, "payments", token)
      ]);
      return normalizeAdminRows(rawClients, rawPayments);
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

export async function GET(request) {
  if (!isLocalAdminRequest(request)) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const session = getAdminSessionFromRequest(request);
  if (!session) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const rows = await loadRegistrations(session);
    return Response.json({
      ok: true,
      count: rows.length,
      rows
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load registrations.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
