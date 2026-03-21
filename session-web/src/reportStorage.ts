import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  type FieldValue,
} from "firebase/firestore";
import { db } from "./firebase";
import type { SessionReport } from "../../extension/src/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportRecord = {
  runId: string;
  cloudinaryUrl: string;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  blockCount: number;
  endedEarly: boolean;
  savedAt: FieldValue;
};

// ─── Cloudinary ───────────────────────────────────────────────────────────────

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string;

async function uploadReportToCloudinary(
  report: SessionReport,
  uid: string,
): Promise<string> {
  const blob = new Blob([JSON.stringify(report)], { type: "application/json" });
  const formData = new FormData();
  formData.append("file", blob, `${report.runId}.json`);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("public_id", `reports/${uid}/${report.runId}`);
  formData.append("resource_type", "raw");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/raw/upload`,
    { method: "POST", body: formData },
  );

  if (!res.ok) {
    throw new Error(`Cloudinary upload failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { secure_url: string };
  return data.secure_url;
}

// ─── Firestore ────────────────────────────────────────────────────────────────

function reportDocRef(uid: string, runId: string) {
  if (!db) {
    throw new Error("Firestore is not configured (missing VITE_FIREBASE_* in .env).");
  }
  return doc(db, "users", uid, "reports", runId);
}

async function getReportRecord(
  uid: string,
  runId: string,
): Promise<ReportRecord | null> {
  const snap = await getDoc(reportDocRef(uid, runId));
  return snap.exists() ? (snap.data() as ReportRecord) : null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Uploads the report to Cloudinary and saves the URL to Firestore.
 * Idempotent — if already saved, returns the existing URL without re-uploading.
 */
export async function ensureReportSaved(
  uid: string,
  report: SessionReport,
): Promise<string> {
  const existing = await getReportRecord(uid, report.runId);
  if (existing) return existing.cloudinaryUrl;

  const cloudinaryUrl = await uploadReportToCloudinary(report, uid);

  const record: ReportRecord = {
    runId: report.runId,
    cloudinaryUrl,
    startedAt: Timestamp.fromMillis(report.startedAt),
    endedAt: report.endedAt != null ? Timestamp.fromMillis(report.endedAt) : null,
    blockCount: report.blocks.length,
    endedEarly: report.endedEarly ?? false,
    savedAt: serverTimestamp(),
  };

  await setDoc(reportDocRef(uid, report.runId), record);
  return cloudinaryUrl;
}
