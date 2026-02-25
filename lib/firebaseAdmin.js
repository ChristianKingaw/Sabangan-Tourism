import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";

function readEnv(name, fallback = "") {
  const value = process.env[name];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

export function getFirebaseDb() {
  const app = getFirebaseAdminApp();
  return getDatabase(app);
}

export function getFirebaseStorageBucket() {
  const app = getFirebaseAdminApp();
  const bucketName = readEnv("FIREBASE_STORAGE_BUCKET", readEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"));
  const storage = getStorage(app);
  return bucketName ? storage.bucket(bucketName) : storage.bucket();
}

export function getFirebaseAdminApp() {
  const databaseURL = readEnv("FIREBASE_DATABASE_URL", readEnv("NEXT_PUBLIC_FIREBASE_DATABASE_URL"));
  const projectId = readEnv("FIREBASE_PROJECT_ID", readEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"));
  const clientEmail = readEnv("FIREBASE_CLIENT_EMAIL");
  const privateKeyRaw = readEnv("FIREBASE_PRIVATE_KEY");
  const privateKey = privateKeyRaw ? privateKeyRaw.replace(/\\n/g, "\n") : "";
  const hasExplicitServiceAccount = Boolean(projectId && clientEmail && privateKey);
  const hasGoogleApplicationCredentials = Boolean(readEnv("GOOGLE_APPLICATION_CREDENTIALS"));

  if (!databaseURL) {
    throw new Error("Missing Firebase Realtime Database URL. Set FIREBASE_DATABASE_URL in environment variables.");
  }

  if (!getApps().length) {
    if (hasExplicitServiceAccount) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey
        }),
        databaseURL
      });
    } else if (hasGoogleApplicationCredentials) {
      initializeApp({
        databaseURL
      });
    } else {
      throw new Error(
        "Firebase Admin credentials are not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS."
      );
    }
  }

  return getApps()[0];
}
