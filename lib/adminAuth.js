import crypto from "node:crypto";

const ADMIN_USERNAME = "sabanganLGU@gmail.com";
const ADMIN_PASSWORD = "HappySabangan@123";
const ADMIN_COOKIE_NAME = "sabangan_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

function toBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (typeof secret === "string" && secret.trim()) {
    return secret.trim();
  }

  // Fallback for local/dev use.
  return "sabangan-admin-session-secret";
}

function signPayload(encodedPayload) {
  return crypto.createHmac("sha256", getSessionSecret()).update(encodedPayload).digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function getAdminCookieName() {
  return ADMIN_COOKIE_NAME;
}

export function getAdminUsername() {
  return ADMIN_USERNAME;
}

export function getAdminPassword() {
  return ADMIN_PASSWORD;
}

export function isValidAdminCredentials(username, password) {
  return safeEqual(username || "", ADMIN_USERNAME) && safeEqual(password || "", ADMIN_PASSWORD);
}

export function createAdminSessionToken(options = {}) {
  const firebaseIdToken = typeof options.firebaseIdToken === "string" ? options.firebaseIdToken : "";
  const payload = {
    username: ADMIN_USERNAME,
    exp: Date.now() + SESSION_TTL_MS,
    firebase_id_token: firebaseIdToken || null
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifyAdminSessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");
  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(fromBase64Url(encodedPayload));
  } catch {
    return null;
  }

  if (!parsedPayload || parsedPayload.username !== ADMIN_USERNAME) {
    return null;
  }

  const expiresAt = Number(parsedPayload.exp);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null;
  }

  return parsedPayload;
}

export function extractCookieToken(cookieHeader, cookieName = ADMIN_COOKIE_NAME) {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return "";
  }

  const parts = cookieHeader.split(";").map((part) => part.trim());
  const target = parts.find((part) => part.startsWith(`${cookieName}=`));
  if (!target) {
    return "";
  }

  const value = target.slice(cookieName.length + 1);
  return decodeURIComponent(value || "");
}

export function getAdminSessionFromRequest(request) {
  const cookieHeader = request.headers.get("cookie");
  const token = extractCookieToken(cookieHeader);
  return verifyAdminSessionToken(token);
}
