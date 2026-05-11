/**
 * templateStorage.ts — Firestore CRUD helpers for session templates stored at users/{uid}/sessionTemplates; exports sanitizeBlocks() to strip undefined fields from SessionBlock objects before writing to Firestore.
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
import type { BlockSettings, SessionBlock } from "../../extension/src/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Read-side type: what Firestore returns. */
export type SessionTemplate = {
  id: string;
  name: string;
  blocks: SessionBlock[];
  globalSettings: BlockSettings;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

/** Write-side type: timestamp fields are write sentinels. */
type SessionTemplateWrite = Omit<SessionTemplate, "createdAt" | "updatedAt"> & {
  createdAt: FieldValue;
  updatedAt: FieldValue;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function templateDocRef(uid: string, templateId: string) {
  return doc(db, "users", uid, "sessionTemplates", templateId);
}

function generateId(): string {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

/**
 * Firestore rejects `undefined` values. Strip them from each block so that
 * optional fields (topic, goals, localSettings) don't cause write errors.
 */
function sanitizeBlocks(blocks: SessionBlock[]): SessionBlock[] {
  return blocks.map((b) => {
    const clean: SessionBlock = { id: b.id, type: b.type, minutes: b.minutes };
    if (b.topic !== undefined) clean.topic = b.topic;
    if (b.goals !== undefined) clean.goals = b.goals;
    if (b.localSettings !== undefined) clean.localSettings = b.localSettings;
    return clean;
  });
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listSessionTemplates(
  uid: string,
): Promise<SessionTemplate[]> {
  const col = collection(db, "users", uid, "sessionTemplates");
  const q = query(col, orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SessionTemplate);
}

export async function createSessionTemplate(
  uid: string,
  name: string,
  blocks: SessionBlock[],
  globalSettings: BlockSettings,
): Promise<SessionTemplate> {
  const id = generateId();
  const sanitized = sanitizeBlocks(blocks);
  const record: SessionTemplateWrite = {
    id,
    name,
    blocks: sanitized,
    globalSettings,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(templateDocRef(uid, id), record);
  const ts = Timestamp.now();
  return { id, name, blocks: sanitized, globalSettings, createdAt: ts, updatedAt: ts };
}

export async function updateSessionTemplate(
  uid: string,
  templateId: string,
  patch: Partial<Pick<SessionTemplate, "name" | "blocks" | "globalSettings">>,
): Promise<void> {
  const sanitized = {
    ...patch,
    ...(patch.blocks !== undefined
      ? { blocks: sanitizeBlocks(patch.blocks) }
      : {}),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(templateDocRef(uid, templateId), sanitized);
}

export async function deleteSessionTemplate(
  uid: string,
  templateId: string,
): Promise<void> {
  await deleteDoc(templateDocRef(uid, templateId));
}
