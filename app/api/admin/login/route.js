import { NextResponse } from "next/server";
import {
  createAdminSessionToken,
  getAdminCookieName,
  getAdminUsername,
  isValidAdminCredentials
} from "../../../../lib/adminAuth";
import { isLocalAdminRequest } from "../../../../lib/adminAccess";

export const runtime = "nodejs";

function getFirebaseApiKey() {
  const direct = process.env.FIREBASE_API_KEY;
  const publicKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const value = typeof direct === "string" && direct.trim() ? direct.trim() : (publicKey || "").trim();
  return value;
}

function hasServerDatabaseAuth() {
  const hasRestSecret = Boolean(
    (process.env.FIREBASE_DATABASE_SECRET || "").trim() || (process.env.FIREBASE_AUTH_TOKEN || "").trim()
  );
  const hasServiceAccount = Boolean(
    ((process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim() &&
      (process.env.FIREBASE_CLIENT_EMAIL || "").trim() &&
      (process.env.FIREBASE_PRIVATE_KEY || "").trim()) ||
      (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim()
  );
  return hasRestSecret || hasServiceAccount;
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

async function signInWithPassword(apiKey, email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });

  if (!response.ok) {
    throw new Error(await parseFirebaseAuthError(response));
  }

  const payload = await response.json();
  return typeof payload?.idToken === "string" ? payload.idToken : "";
}

async function signUpWithPassword(apiKey, email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });

  if (!response.ok) {
    throw new Error(await parseFirebaseAuthError(response));
  }

  const payload = await response.json();
  return typeof payload?.idToken === "string" ? payload.idToken : "";
}

async function getAdminFirebaseIdToken(email, password) {
  const apiKey = getFirebaseApiKey();
  if (!apiKey) {
    return "";
  }

  try {
    return await signInWithPassword(apiKey, email, password);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message === "EMAIL_NOT_FOUND" ||
      message === "USER_NOT_FOUND" ||
      message === "INVALID_LOGIN_CREDENTIALS"
    ) {
      try {
        return await signUpWithPassword(apiKey, email, password);
      } catch (signUpError) {
        const signUpMessage = signUpError instanceof Error ? signUpError.message : "";
        if (signUpMessage === "EMAIL_EXISTS") {
          throw new Error(
            "The Firebase Auth user sabanganLGU@gmail.com already exists with a different password. In Firebase Console -> Authentication -> Users, reset its password to HappySabangan@123 or delete the user and try login again."
          );
        }
        throw signUpError;
      }
    }

    throw error;
  }
}

export async function POST(request) {
  if (!isLocalAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!isValidAdminCredentials(username, password)) {
      return NextResponse.json({ ok: false, error: "Invalid username or password." }, { status: 401 });
    }

    const firebaseIdToken = await getAdminFirebaseIdToken(getAdminUsername(), password);
    if (!firebaseIdToken && !hasServerDatabaseAuth()) {
      throw new Error(
        "Admin database access is not configured. Enable Firebase Authentication (Email/Password) or set FIREBASE_DATABASE_SECRET / service account credentials."
      );
    }
    const token = createAdminSessionToken({ firebaseIdToken });
    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: getAdminCookieName(),
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8
    });
    return response;
  } catch (error) {
    let message = error instanceof Error ? error.message : "Failed to process login.";
    if (message === "CONFIGURATION_NOT_FOUND") {
      message =
        "Firebase Authentication is not configured for this project. In Firebase Console, enable Authentication and turn on Email/Password sign-in.";
    }
    if (message === "OPERATION_NOT_ALLOWED") {
      message =
        "Email/Password sign-in is disabled. In Firebase Console -> Authentication -> Sign-in method, enable Email/Password.";
    }
    if (message === "INVALID_LOGIN_CREDENTIALS") {
      message =
        "Invalid Firebase Auth credentials for sabanganLGU@gmail.com. Reset this user password to HappySabangan@123, or delete the user then try logging in again.";
    }
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
