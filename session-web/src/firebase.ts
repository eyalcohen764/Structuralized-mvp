import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/** True if the value looks like a real env var (not empty / not .example placeholders). */
function isConfiguredValue(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s) return false;
  if (/^your[_-]/i.test(s)) return false;
  if (/^xxx+$/i.test(s)) return false;
  if (s === "G-XXXXXXXXXX") return false;
  return true;
}

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
const appId = import.meta.env.VITE_FIREBASE_APP_ID;
const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID;

/** All core web config fields from the Firebase console (required for initializeApp). */
export const isFirebaseConfigured =
  isConfiguredValue(apiKey) &&
  isConfiguredValue(authDomain) &&
  isConfiguredValue(projectId) &&
  isConfiguredValue(storageBucket) &&
  isConfiguredValue(messagingSenderId) &&
  isConfiguredValue(appId);

let app: FirebaseApp | null = null;
let analytics: Analytics | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  app = initializeApp({
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
    ...(isConfiguredValue(measurementId) ? { measurementId } : {}),
  });
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
  if (typeof window !== "undefined" && isConfiguredValue(measurementId)) {
    analytics = getAnalytics(app);
  }
}

export { app, analytics, auth, db, googleProvider };
