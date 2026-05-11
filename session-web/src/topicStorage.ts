/**
 * topicStorage.ts — Firestore CRUD helpers for saved work topics stored at users/{uid}/savedTopics; used by SessionBuilderPage to populate topic autocomplete with optimistic updates.
 */
import {
  doc,
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

// ─── Types ────────────────────────────────────────────────────────────────────

/** Read-side type: what Firestore returns. */
export type SavedTopic = {
  id: string;
  name: string;
  createdAt: Timestamp;
};

/** Write-side type: createdAt is a write sentinel. */
type SavedTopicWrite = Omit<SavedTopic, "createdAt"> & {
  createdAt: FieldValue;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function topicDocRef(uid: string, topicId: string) {
  return doc(db, "users", uid, "savedTopics", topicId);
}

function generateId(): string {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listSavedTopics(uid: string): Promise<SavedTopic[]> {
  const col = collection(db, "users", uid, "savedTopics");
  const q = query(col, orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SavedTopic);
}

export async function createSavedTopic(
  uid: string,
  name: string,
): Promise<SavedTopic> {
  const id = generateId();
  const record: SavedTopicWrite = {
    id,
    name,
    createdAt: serverTimestamp(),
  };
  await setDoc(topicDocRef(uid, id), record);
  return { id, name, createdAt: Timestamp.now() };
}

export async function renameSavedTopic(
  uid: string,
  topicId: string,
  name: string,
): Promise<void> {
  await updateDoc(topicDocRef(uid, topicId), { name });
}

export async function deleteSavedTopic(
  uid: string,
  topicId: string,
): Promise<void> {
  await deleteDoc(topicDocRef(uid, topicId));
}
