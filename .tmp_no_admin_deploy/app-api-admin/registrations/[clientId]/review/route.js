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

async function realtimeRequest(baseUrl, nodePath, method, body, sessionToken = "") {
  const requestOptions = {
    method,
    headers: {
      "Content-Type": "application/json"
    }
  };
  if (body !== undefined) {
    requestOptions.body = JSON.stringify(body);
  }

  const response = await fetch(buildRealtimeUrl(baseUrl, nodePath, sessionToken), requestOptions);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Realtime DB REST ${method} failed (${response.status}): ${errorText || "Unknown error"}`);
  }

  if (response.status === 204) {
    return null;
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

function buildFullName(client) {
  return [client.fname, client.mname, client.lname].filter(Boolean).join(" ").trim() || "Unknown";
}

function normalizeClient(rawClient, fallbackId = "") {
  if (!rawClient || typeof rawClient !== "object") {
    return null;
  }
  return {
    id: typeof rawClient.id === "string" && rawClient.id ? rawClient.id : fallbackId,
    fname: typeof rawClient.fname === "string" ? rawClient.fname : "",
    mname: typeof rawClient.mname === "string" ? rawClient.mname : "",
    lname: typeof rawClient.lname === "string" ? rawClient.lname : "",
    category: typeof rawClient.category === "string" ? rawClient.category : "15km",
    city_prov: typeof rawClient.city_prov === "string" ? rawClient.city_prov : "",
    event_id: typeof rawClient.event_id === "string" ? rawClient.event_id : "gagayam-trail-run-15km",
    created_at: typeof rawClient.created_at === "string" ? rawClient.created_at : ""
  };
}

async function getClientById(clientId, sessionToken = "") {
  try {
    return await withTimeout(async () => {
      const db = getFirebaseDb();
      const snapshot = await db.ref(`clients/${clientId}`).get();
      if (!snapshot.exists()) {
        return null;
      }
      return normalizeClient(snapshot.val(), clientId);
    }, 4500, "Firebase Admin client read");
  } catch {
    const baseUrl = getRealtimeDatabaseUrl();
    if (!baseUrl) {
      throw new Error("Missing Firebase Realtime Database URL.");
    }
    try {
      const rawClient = await realtimeRequest(baseUrl, `clients/${clientId}`, "GET", undefined, sessionToken);
      return normalizeClient(rawClient, clientId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("Permission denied")) {
        throw error;
      }

      const freshToken = await fetchFreshAdminFirebaseIdToken();
      const rawClient = await realtimeRequest(baseUrl, `clients/${clientId}`, "GET", undefined, freshToken);
      return normalizeClient(rawClient, clientId);
    }
  }
}

async function applyReviewWithFirebaseAdmin({ client, action, reviewedBy, reviewedAt }) {
  const db = getFirebaseDb();
  const status = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "deleted";

  if (action === "delete") {
    const paymentsSnapshot = await db.ref("payments").orderByChild("client_id").equalTo(client.id).get();
    const updates = {};
    updates[`clients/${client.id}`] = null;
    updates[`public_clients/${client.id}`] = null;
    if (paymentsSnapshot.exists()) {
      Object.keys(paymentsSnapshot.val() || {}).forEach((paymentId) => {
        updates[`payments/${paymentId}`] = null;
      });
    }
    await db.ref().update(updates);
    return status;
  }

  await db.ref(`clients/${client.id}`).update({
    review_status: status,
    reviewed_by: reviewedBy,
    reviewed_at: reviewedAt,
    updated_at: reviewedAt
  });

  if (action === "accept") {
    await db.ref(`public_clients/${client.id}`).set({
      id: client.id,
      full_name: buildFullName(client),
      category: client.category || "15km",
      city_prov: client.city_prov || "-",
      review_status: "accepted",
      event_id: client.event_id || "gagayam-trail-run-15km",
      created_at: client.created_at || reviewedAt,
      updated_at: reviewedAt
    });
  } else {
    await db.ref(`public_clients/${client.id}`).remove();
  }
  return status;
}

async function applyReviewWithRealtimeRest({ client, action, reviewedBy, reviewedAt, sessionToken }) {
  const baseUrl = getRealtimeDatabaseUrl();
  if (!baseUrl) {
    throw new Error("Missing Firebase Realtime Database URL.");
  }

  const status = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "deleted";
  let token = "";
  try {
    token = await fetchFreshAdminFirebaseIdToken();
  } catch {
    token = sessionToken || "";
  }
  if (!token) {
    token = sessionToken || "";
  }
  const runWrite = async () => {
    if (action === "delete") {
      const allPayments = await realtimeRequest(baseUrl, "payments", "GET", undefined, token);
      await realtimeRequest(baseUrl, `clients/${client.id}`, "DELETE", undefined, token);
      await realtimeRequest(baseUrl, `public_clients/${client.id}`, "DELETE", undefined, token);

      if (allPayments && typeof allPayments === "object") {
        const deleteTasks = Object.entries(allPayments)
          .filter(([, payment]) => payment && typeof payment === "object" && payment.client_id === client.id)
          .map(([paymentId]) => realtimeRequest(baseUrl, `payments/${paymentId}`, "DELETE", undefined, token));
        await Promise.all(deleteTasks);
      }
      return;
    }

    await realtimeRequest(baseUrl, `clients/${client.id}`, "PATCH", {
      review_status: status,
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt
    }, token);

    if (action === "accept") {
      await realtimeRequest(baseUrl, `public_clients/${client.id}`, "PUT", {
        id: client.id,
        full_name: buildFullName(client),
        category: client.category || "15km",
        city_prov: client.city_prov || "-",
        review_status: "accepted",
        event_id: client.event_id || "gagayam-trail-run-15km",
        created_at: client.created_at || reviewedAt,
        updated_at: reviewedAt
      }, token);
    } else {
      await realtimeRequest(baseUrl, `public_clients/${client.id}`, "DELETE", undefined, token);
    }
  };

  try {
    await runWrite();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const normalizedMessage = message.toLowerCase();
    if (!normalizedMessage.includes("permission denied") && !normalizedMessage.includes("auth")) {
      throw error;
    }

    token = await fetchFreshAdminFirebaseIdToken();
    if (!token) {
      throw error;
    }
    await runWrite();
  }

  return status;
}

export async function POST(request, context) {
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

  let action = "";
  try {
    const body = await request.json();
    action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (action !== "accept" && action !== "reject" && action !== "delete") {
    return Response.json({ ok: false, error: "Invalid review action." }, { status: 400 });
  }

  try {
    const sessionToken = typeof session.firebase_id_token === "string" ? session.firebase_id_token : "";
    const client = await getClientById(clientId, sessionToken);
    if (!client || !client.id) {
      return Response.json({ ok: false, error: "Client not found." }, { status: 404 });
    }

    const reviewedAt = new Date().toISOString();
    let status;
    try {
      status = await withTimeout(
        () =>
          applyReviewWithFirebaseAdmin({
            client,
            action,
            reviewedBy: session.username,
            reviewedAt
          }),
        6500,
        "Firebase Admin review write"
      );
    } catch {
      status = await applyReviewWithRealtimeRest({
        client,
        action,
        reviewedBy: session.username,
        reviewedAt,
        sessionToken
      });
    }

    return Response.json({
      ok: true,
      client_id: client.id,
      review_status: status
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to review client.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
