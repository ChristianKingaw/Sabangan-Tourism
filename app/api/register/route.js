import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getFirebaseDb, getFirebaseStorageBucket } from "../../../lib/firebaseAdmin";
import { withTimeout } from "../../../lib/withTimeout";

export const runtime = "nodejs";
const FIXED_CATEGORY = "15km";
const FIXED_PAYMENT_METHOD = "GCash";
const FIXED_AMOUNT = Number(process.env.FIXED_REGISTRATION_AMOUNT || "0");
const EVENT_ID = "gagayam-trail-run-15km";

const textFieldNames = [
  "email",
  "fname",
  "mname",
  "lname",
  "dob",
  "gender",
  "nationality",
  "province_state",
  "city_municipality",
  "barangay",
  "zip_code",
  "address",
  "city_prov",
  "contact_no",
  "health_condition",
  "health_condition_details",
  "category",
  "shirt_size",
  "emergency_full_name",
  "emergency_contact_no",
  "payment_method",
  "gcash_number",
  "amount_to_be_paid",
  "privacy_consent",
  "privacy_consent_at"
];

function getString(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
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

async function realtimeWrite(baseUrl, nodePath, method, body) {
  const response = await fetch(buildRealtimeUrl(baseUrl, nodePath), {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Realtime DB REST write failed (${response.status}): ${errorText || "Unknown error"}`);
  }
}

function sanitizeFilename(value) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function parseProofFile(formData) {
  const fileValue = formData.get("proof_of_payment_file");
  if (!fileValue || typeof fileValue === "string" || !("arrayBuffer" in fileValue)) {
    throw new Error("Upload proof_of_payment file.");
  }

  if (!fileValue.size) {
    throw new Error("Upload proof_of_payment file.");
  }

  const parsedName = path.parse(fileValue.name || "proof");
  const safeBase = sanitizeFilename(parsedName.name || "proof") || "proof";
  const safeExt = sanitizeFilename((parsedName.ext || ".bin").replace(".", "")) || "bin";
  const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeBase}.${safeExt}`;

  return {
    fileValue,
    filename,
    contentType: fileValue.type || "application/octet-stream"
  };
}

async function saveProofToFirebaseStorage({ fileBuffer, filename, contentType }) {
  const bucket = getFirebaseStorageBucket();
  const objectPath = `proof-of-payment/${filename}`;
  const file = bucket.file(objectPath);
  const downloadToken = crypto.randomUUID();
  const uploadOptions = {
    resumable: true,
    contentType,
    metadata: {
      cacheControl: "private, max-age=0, no-transform",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken
      }
    }
  };

  try {
    await withTimeout(() => file.save(fileBuffer, uploadOptions), 18000, "Firebase Storage upload");
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const shouldRetry =
      message.includes("stream was destroyed") ||
      message.includes("econnreset") ||
      message.includes("socket hang up");

    if (!shouldRetry) {
      throw error;
    }

    const tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-upload-"));
    const tempFilePath = path.join(tempBaseDir, filename);
    fs.writeFileSync(tempFilePath, fileBuffer);

    try {
      await withTimeout(
        () =>
          bucket.upload(tempFilePath, {
            destination: objectPath,
            ...uploadOptions
          }),
        22000,
        "Firebase Storage retry upload"
      );
    } finally {
      try {
        fs.rmSync(tempBaseDir, { recursive: true, force: true });
      } catch {
        // Ignore temp cleanup errors.
      }
    }
  }

  const encodedPath = encodeURIComponent(objectPath);
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
  return downloadUrl;
}

function saveProofLocally({ fileBuffer, filename }) {
  const uploadDir = path.join(process.cwd(), "public", "uploads", "proof-of-payment");
  fs.mkdirSync(uploadDir, { recursive: true });

  const savePath = path.join(uploadDir, filename);
  fs.writeFileSync(savePath, fileBuffer);

  return `/uploads/proof-of-payment/${filename}`;
}

function shouldUseFirebaseStorage() {
  const raw = (process.env.USE_FIREBASE_STORAGE || "").trim().toLowerCase();
  if (raw) {
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  }

  const configuredBucket =
    (process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
  return Boolean(configuredBucket);
}

function buildProofDataUrl({ fileBuffer, contentType }) {
  const encoded = fileBuffer.toString("base64");
  return `data:${contentType};base64,${encoded}`;
}

async function resolveProofOfPayment(formData) {
  const parsedFile = parseProofFile(formData);
  const fileBuffer = Buffer.from(await parsedFile.fileValue.arrayBuffer());

  if (shouldUseFirebaseStorage()) {
    try {
      return await saveProofToFirebaseStorage({
        fileBuffer,
        filename: parsedFile.filename,
        contentType: parsedFile.contentType
      });
    } catch {
      // Keep registrations moving even when cloud uploads are transiently unavailable.
      return buildProofDataUrl({
        fileBuffer,
        contentType: parsedFile.contentType
      });
    }
  }

  return saveProofLocally({
    fileBuffer,
    filename: parsedFile.filename
  });
}

function validatePayload(payload) {
  const required = [
    "email",
    "fname",
    "lname",
    "dob",
    "gender",
    "nationality",
    "province_state",
    "city_municipality",
    "barangay",
    "zip_code",
    "contact_no",
    "health_condition",
    "category",
    "shirt_size",
    "emergency_full_name",
    "emergency_contact_no",
    "payment_method",
    "amount_to_be_paid",
    "privacy_consent"
  ];

  for (const field of required) {
    if (!payload[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  const amount = Number(payload.amount_to_be_paid);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("amount_to_be_paid must be a valid non-negative number.");
  }

  if (!/^\d{4}$/.test(payload.zip_code)) {
    throw new Error("zip_code must be exactly 4 digits.");
  }

  if (payload.privacy_consent !== "true") {
    throw new Error("Principle of Accuracy confirmation is required.");
  }

  if (payload.health_condition !== "Yes" && payload.health_condition !== "No") {
    throw new Error("health_condition must be Yes or No.");
  }

  if (payload.health_condition === "Yes" && !payload.health_condition_details) {
    throw new Error("Please specify health_condition_details when health_condition is Yes.");
  }
}

function deriveLegacyLocationFields(payload) {
  if (!payload.address) {
    payload.address = payload.barangay;
  }

  if (!payload.city_prov) {
    payload.city_prov = [payload.city_municipality, payload.province_state].filter(Boolean).join(", ");
  }
}

async function saveWithFirebaseAdmin({
  eventDescription,
  payload,
  amount,
  proofOfPayment,
  now
}) {
  const db = getFirebaseDb();

  await db.ref(`events/${EVENT_ID}`).transaction((current) => {
    if (current) {
      return {
        ...current,
        updated_at: now
      };
    }

    return {
      id: EVENT_ID,
      description: eventDescription,
      created_at: now,
      updated_at: now
    };
  });

  const clientRef = db.ref("clients").push();
  const paymentRef = db.ref("payments").push();
  const clientId = clientRef.key;
  const paymentId = paymentRef.key;

  if (!clientId || !paymentId) {
    throw new Error("Failed to generate registration record IDs.");
  }

  const updates = {};
  updates[`events/${EVENT_ID}/updated_at`] = now;
  updates[`clients/${clientId}`] = {
    id: clientId,
    email: payload.email,
    fname: payload.fname,
    mname: payload.mname || null,
    lname: payload.lname,
    dob: payload.dob,
    gender: payload.gender,
    nationality: payload.nationality,
    province_state: payload.province_state,
    city_municipality: payload.city_municipality,
    barangay: payload.barangay,
    zip_code: payload.zip_code,
    address: payload.address,
    city_prov: payload.city_prov,
    contact_no: payload.contact_no,
    health_condition: payload.health_condition,
    health_condition_details: payload.health_condition === "Yes" ? payload.health_condition_details : null,
    category: payload.category,
    shirt_size: payload.shirt_size,
    emergency_full_name: payload.emergency_full_name,
    emergency_contact_no: payload.emergency_contact_no,
    privacy_consent: true,
    privacy_consent_at: payload.privacy_consent_at || now,
    review_status: "pending",
    reviewed_at: null,
    reviewed_by: null,
    event_id: EVENT_ID,
    created_at: now,
    updated_at: now
  };
  updates[`payments/${paymentId}`] = {
    id: paymentId,
    client_id: clientId,
    payment_method: payload.payment_method,
    gcash_number: payload.gcash_number || null,
    amount,
    proof_of_payment: proofOfPayment,
    created_at: now,
    updated_at: now
  };

  await db.ref().update(updates);
  return { eventId: EVENT_ID, clientId, paymentId };
}

async function saveWithRealtimeRest({
  eventDescription,
  payload,
  amount,
  proofOfPayment,
  now
}) {
  const databaseUrl = getRealtimeDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Missing Firebase Realtime Database URL.");
  }

  const clientId = crypto.randomUUID();
  const paymentId = crypto.randomUUID();

  try {
    await realtimeWrite(databaseUrl, `events/${EVENT_ID}`, "PATCH", {
      id: EVENT_ID,
      description: eventDescription,
      updated_at: now
    });
  } catch {
    // Non-admin REST fallback can still proceed with client/payment records.
  }

  await realtimeWrite(databaseUrl, `clients/${clientId}`, "PUT", {
    id: clientId,
    email: payload.email,
    fname: payload.fname,
    mname: payload.mname || null,
    lname: payload.lname,
    dob: payload.dob,
    gender: payload.gender,
    nationality: payload.nationality,
    province_state: payload.province_state,
    city_municipality: payload.city_municipality,
    barangay: payload.barangay,
    zip_code: payload.zip_code,
    address: payload.address,
    city_prov: payload.city_prov,
    contact_no: payload.contact_no,
    health_condition: payload.health_condition,
    health_condition_details: payload.health_condition === "Yes" ? payload.health_condition_details : null,
    category: payload.category,
    shirt_size: payload.shirt_size,
    emergency_full_name: payload.emergency_full_name,
    emergency_contact_no: payload.emergency_contact_no,
    privacy_consent: true,
    privacy_consent_at: payload.privacy_consent_at || now,
    review_status: "pending",
    reviewed_at: null,
    reviewed_by: null,
    event_id: EVENT_ID,
    created_at: now,
    updated_at: now
  });

  await realtimeWrite(databaseUrl, `payments/${paymentId}`, "PUT", {
    id: paymentId,
    client_id: clientId,
    payment_method: payload.payment_method,
    gcash_number: payload.gcash_number || null,
    amount,
    proof_of_payment: proofOfPayment,
    created_at: now,
    updated_at: now
  });

  return { eventId: EVENT_ID, clientId, paymentId };
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const payload = {};
    for (const key of textFieldNames) {
      payload[key] = getString(formData, key);
    }

    // Enforce fixed event configuration regardless of client payload.
    payload.category = FIXED_CATEGORY;
    payload.payment_method = FIXED_PAYMENT_METHOD;
    payload.gcash_number = "";
    payload.amount_to_be_paid = String(FIXED_AMOUNT);
    deriveLegacyLocationFields(payload);

    if (!Number.isFinite(FIXED_AMOUNT) || FIXED_AMOUNT < 0) {
      throw new Error("FIXED_REGISTRATION_AMOUNT must be a valid non-negative number.");
    }

    validatePayload(payload);
    const proofOfPayment = await resolveProofOfPayment(formData);
    const amount = Number(payload.amount_to_be_paid);

    const eventDescription = `Gagayam Trail Run (${FIXED_CATEGORY})`;
    const now = new Date().toISOString();
    let result;
    try {
      result = await withTimeout(
        () =>
          saveWithFirebaseAdmin({
            eventDescription,
            payload,
            amount,
            proofOfPayment,
            now
          }),
        7000,
        "Firebase Admin registration write"
      );
    } catch {
      result = await saveWithRealtimeRest({
        eventDescription,
        payload,
        amount,
        proofOfPayment,
        now
      });
    }

    return Response.json(
      {
        ok: true,
        ...result
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to register.";
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}
