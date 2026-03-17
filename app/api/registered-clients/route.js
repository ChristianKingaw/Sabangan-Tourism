import { getFirebaseDb } from "../../../lib/firebaseAdmin";
import { withTimeout } from "../../../lib/withTimeout";

export const runtime = "nodejs";

function getClientSortTime(createdAt) {
  const parsed = createdAt ? Date.parse(createdAt) : NaN;
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
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

function buildRealtimeUrl(baseUrl, nodePath) {
  const token = getRealtimeAuthToken();
  const url = `${baseUrl}/${nodePath}.json`;
  if (!token) {
    return url;
  }

  return `${url}?auth=${encodeURIComponent(token)}`;
}

async function readWithRealtimeRest(baseUrl, nodePath) {
  const response = await fetch(buildRealtimeUrl(baseUrl, nodePath), {
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

function normalizeClients(rawValue) {
  const source = rawValue && typeof rawValue === "object" ? rawValue : {};
  return Object.entries(source)
    .map(([clientKey, item]) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const fname = typeof item.fname === "string" ? item.fname.trim() : "";
      const mname = typeof item.mname === "string" ? item.mname.trim() : "";
      const lname = typeof item.lname === "string" ? item.lname.trim() : "";
      const fullNameFromParts = [fname, mname, lname].filter(Boolean).join(" ");
      const fullName =
        (typeof item.full_name === "string" ? item.full_name.trim() : "") ||
        fullNameFromParts ||
        "Unknown";
      const normalizedReviewStatus =
        typeof item.review_status === "string" && item.review_status.trim()
          ? item.review_status.trim().toLowerCase()
          : "accepted";
      const createdAt =
        typeof item.created_at === "string"
          ? item.created_at
          : typeof item.updated_at === "string"
            ? item.updated_at
            : null;

      return {
        id: typeof item.id === "string" && item.id ? item.id : clientKey,
        full_name: fullName,
        category: typeof item.category === "string" ? item.category : "15km",
        city_prov: typeof item.city_prov === "string" ? item.city_prov : "-",
        review_status: normalizedReviewStatus,
        created_at: createdAt
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      return getClientSortTime(a.created_at) - getClientSortTime(b.created_at);
    });
}

function mergeRegisteredAndPendingClients(publicClientsRaw, allClientsRaw) {
  const publicClients = normalizeClients(publicClientsRaw);
  const pendingClients = normalizeClients(allClientsRaw).filter((client) => client.review_status === "pending");
  const clientsById = new Map(publicClients.map((client) => [client.id, client]));

  pendingClients.forEach((client) => {
    if (!clientsById.has(client.id)) {
      clientsById.set(client.id, client);
    }
  });

  return Array.from(clientsById.values()).sort((a, b) => {
    return getClientSortTime(a.created_at) - getClientSortTime(b.created_at);
  });
}

async function loadRegisteredClients() {
  try {
    const clients = await withTimeout(async () => {
      const db = getFirebaseDb();
      const [publicSnapshot, allClientsSnapshot] = await Promise.all([db.ref("public_clients").get(), db.ref("clients").get()]);
      return mergeRegisteredAndPendingClients(
        publicSnapshot.exists() ? publicSnapshot.val() : {},
        allClientsSnapshot.exists() ? allClientsSnapshot.val() : {}
      );
    }, 4500, "Firebase Admin read");
    return clients;
  } catch {
    const baseUrl = getRealtimeDatabaseUrl();
    if (!baseUrl) {
      throw new Error("Missing Firebase Realtime Database URL.");
    }

    const publicClients = await readWithRealtimeRest(baseUrl, "public_clients");
    let allClients = {};
    try {
      allClients = await readWithRealtimeRest(baseUrl, "clients");
    } catch {
      allClients = {};
    }
    return mergeRegisteredAndPendingClients(publicClients, allClients);
  }
}

export async function GET() {
  try {
    const clients = await loadRegisteredClients();
    return Response.json({
      ok: true,
      count: clients.length,
      clients
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load registered clients.";
    return Response.json(
      {
        ok: false,
        error: message
      },
      { status: 500 }
    );
  }
}
