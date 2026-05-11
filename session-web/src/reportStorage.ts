/**
 * reportStorage.ts — Persists completed session reports by uploading the full SessionReport JSON to Cloudinary and saving lightweight metadata (URL, timestamps, blockCount) to Firestore under users/{uid}/reports/{runId}; idempotent — skips re-upload if the report already exists.
 */
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
  type FieldValue,
} from "firebase/firestore";
import { db } from "./firebase";
import type { SessionReport } from "../../extension/src/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Read-side type: what Firestore returns when fetching a report record. */
export type ReportRecord = {
  runId: string;
  cloudinaryUrl: string;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  blockCount: number;
  endedEarly: boolean;
  savedAt: Timestamp;
  name?: string;
};

/** Write-side type: used only when calling setDoc (savedAt is a write sentinel). */
type ReportRecordWrite = Omit<ReportRecord, "savedAt"> & {
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

// ─── Firestore helpers ────────────────────────────────────────────────────────

function reportDocRef(uid: string, runId: string) {
  return doc(db, "users", uid, "reports", runId);
}

export async function getReportRecord(
  uid: string,
  runId: string,
): Promise<ReportRecord | null> {
  const snap = await getDoc(reportDocRef(uid, runId));
  return snap.exists() ? (snap.data() as ReportRecord) : null;
}

// ─── Timestamp helper ─────────────────────────────────────────────────────────

/**
 * Converts a Firestore Timestamp (or plain {seconds, nanoseconds} object that
 * Firestore may return in some SDK configurations) to a JS Date.
 */
export function firestoreTimestampToDate(
  ts: Timestamp | { seconds: number; nanoseconds: number },
): Date {
  if (typeof (ts as Timestamp).toDate === "function") {
    return (ts as Timestamp).toDate();
  }
  return new Date((ts as { seconds: number }).seconds * 1000);
}

// ─── Display name helper ──────────────────────────────────────────────────────

/**
 * Returns the user-defined name if set, otherwise a formatted date/time string
 * derived from startedAt (e.g. "Mar 28, 2026, 2:30 PM").
 */
export function getDisplayName(
  record: Pick<ReportRecord, "name" | "startedAt">,
): string {
  if (record.name) return record.name;
  return firestoreTimestampToDate(record.startedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  const record: ReportRecordWrite = {
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

/**
 * Lists all reports for a user, sorted newest first.
 */
export async function listReports(uid: string): Promise<ReportRecord[]> {
  const col = collection(db, "users", uid, "reports");
  const q = query(col, orderBy("startedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ReportRecord);
}

/**
 * Updates the user-defined display name of a report.
 */
export async function updateReportName(
  uid: string,
  runId: string,
  name: string,
): Promise<void> {
  await updateDoc(reportDocRef(uid, runId), { name });
}

/**
 * Permanently deletes a report record from Firestore.
 * The associated Cloudinary file is NOT deleted (no API secret available on the frontend).
 */
export async function deleteReport(uid: string, runId: string): Promise<void> {
  await deleteDoc(reportDocRef(uid, runId));
}
