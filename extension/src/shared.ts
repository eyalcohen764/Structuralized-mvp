export type BlockType = "work" | "break" | "dynamic";

export const DEFAULT_APP_ORIGIN = "http://localhost:5173";

// ─── Block Settings ───────────────────────────────────────────────────────────

export type BlockSettings = {
  inputRequired?: boolean;
  breakInputRequired?: boolean;
  endMaxCount?: number;
  endSnoozeMaxMinutes?: number;
  returnMaxCount?: number;
  returnSnoozeMaxMinutes?: number;
  alertVolume?: number; // 0–100, volume of the alert sound at block transitions
};

export const DEFAULT_BLOCK_SETTINGS: BlockSettings = {
  inputRequired: true,
  breakInputRequired: false,
  endMaxCount: 2,
  endSnoozeMaxMinutes: 5,
  returnMaxCount: 0,
  returnSnoozeMaxMinutes: 5,
  alertVolume: 80,
};

export type SnoozeRecord = {
  snoozedAt: number;
  resumedAt: number;
  minutes: number;
};

export type PendingSnooze = {
  snoozedAt: number;
  minutes: number;
};

// ─── Session building blocks ──────────────────────────────────────────────────

export type SessionBlock = {
  id: string;
  type: BlockType;
  minutes: number;
  topic?: string;
  goals?: string;
  localSettings?: Partial<BlockSettings>;
};

export type SessionPlan = {
  planId: string;
  createdAt: number;
  blocks: SessionBlock[];
  globalSettings?: BlockSettings;
};

export function resolveSettings(
  plan: SessionPlan,
  blockIndex: number,
): BlockSettings {
  return {
    ...DEFAULT_BLOCK_SETTINGS,
    ...plan.globalSettings,
    ...(plan.blocks[blockIndex]?.localSettings ?? {}),
  };
}

// ─── Report types ─────────────────────────────────────────────────────────────

export type PauseRecord = {
  pausedAt: number;
  resumedAt: number;
  reason?: string;
};

export type ReportBlock = {
  id: string;
  type: BlockType;
  minutes: number;
  topic?: string;
  goals?: string;
  startedAt: number;
  endedAt: number;
  reflection?: string;
  pauses?: PauseRecord[];
  snoozes?: SnoozeRecord[];
  plannedSettings?: BlockSettings;
};

export type SessionReport = {
  runId: string;
  planId: string;
  startedAt: number;
  endedAt?: number;
  blocks: ReportBlock[];
  endedEarly?: boolean;
  globalSettings?: BlockSettings;
};

// ─── Runtime state ────────────────────────────────────────────────────────────

export type SessionRuntimeState =
  | { status: "idle" }
  | {
      status: "running";
      runId: string;
      origin?: string;
      plan: SessionPlan;
      currentIndex: number;
      currentBlockStartedAt: number;
      currentBlockEndsAt: number;
      currentPauses: PauseRecord[];
      snoozeCount: number;
      currentSnoozes: PendingSnooze[];
      priorSnoozes?: SnoozeRecord[];
      report: SessionReport;
    }
  | {
      status: "paused";
      runId: string;
      origin?: string;
      plan: SessionPlan;
      currentIndex: number;
      currentBlockStartedAt: number;
      pausedAt: number;
      remainingMs: number;
      pauseReason?: string;
      currentPauses: PauseRecord[];
      snoozeCount: number;
      currentSnoozes: PendingSnooze[];
      priorSnoozes?: SnoozeRecord[];
      report: SessionReport;
    }
  | {
      status: "awaiting_feedback";
      runId: string;
      origin?: string;
      plan: SessionPlan;
      nextIndex: number;
      report: SessionReport;
      endedBlock: ReportBlock;
      nextBlockNeedsTopic: boolean;
      nextBlockTitle: string;
      endedBlockTitle: string;
      endedBlockIndex: number;
      snoozeCount: number;
      resolvedSettings: BlockSettings;
    }
  | {
      status: "completed";
      runId: string;
      origin?: string;
      plan: SessionPlan;
      report: SessionReport;
    };

// ─── Storage keys ─────────────────────────────────────────────────────────────

export const STORAGE_KEY = "session_runtime_v3";
export const APP_ORIGIN_KEY = "app_origin_v3";
export const ALARM_NAME = "session_tick_v3";
export const REPORT_PREFIX = "report_";
export const LATEST_REPORT_KEY = "latest_report_runId_v3";

// ─── External messages ────────────────────────────────────────────────────────

export type StartSessionExternalMsg = {
  type: "START_SESSION";
  payload: { origin: string; plan: SessionPlan };
};

export type GetReportExternalMsg = {
  type: "GET_REPORT";
  payload?: { runId?: string };
};

// ─── Internal messages ────────────────────────────────────────────────────────

export type Msg =
  | {
      type: "SHOW_RUNNING_OVERLAY";
      payload: { title: string; endsAt: number; subtitle?: string };
    }
  | {
      type: "SHOW_FEEDBACK_MODAL";
      payload: {
        endedTitle: string;
        nextTitle: string;
        nextNeedsTopic: boolean;
        isFinal: boolean;
        runId: string;
        inputRequired: boolean;
        snoozeMax: number;
        maxSnoozeMinutes: number;
        snoozeCount: number;
        endedBlockType: BlockType;
        alertVolume: number;
      };
    }
  | {
      type: "SUBMIT_BLOCK_FEEDBACK";
      payload: { reflection: string; nextTopic?: string };
    }
  | { type: "OPEN_REPORT"; payload: { runId: string } }
  | { type: "GET_STATE" }
  | { type: "PAUSE_SESSION" }
  | { type: "RESUME_SESSION" }
  | { type: "STOP_SESSION" }
  | { type: "SNOOZE_BLOCK"; payload: { minutes: number } }
  | { type: "HIDE_FEEDBACK_MODAL" };
