export type BlockType = "work" | "break" | "dynamic";

export const DEFAULT_APP_ORIGIN = "http://localhost:5173";


export type SessionBlock = {
  id: string;
  type: BlockType;
  minutes: number;
  topic?: string; // work topic OR chosen dynamic focus
};

export type SessionPlan = {
  planId: string;
  createdAt: number;
  blocks: SessionBlock[];
};

export type ReportBlock = {
  id: string;
  type: BlockType;
  minutes: number;
  topic?: string;
  startedAt: number;
  endedAt: number;
  reflection?: string;
};

export type SessionReport = {
  runId: string;
  planId: string;
  startedAt: number;
  endedAt?: number;
  blocks: ReportBlock[];
};

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
      report: SessionReport;
    }
  | {
      status: "awaiting_feedback";
      runId: string;
      origin?: string;
      plan: SessionPlan;
      nextIndex: number; // the next block index we will start AFTER feedback
      report: SessionReport;
      endedBlock: ReportBlock; // the block that just ended
      nextBlockNeedsTopic: boolean; // true if next is dynamic
      nextBlockTitle: string;
      endedBlockTitle: string;
    }
  | {
      status: "completed";
      runId: string;
      origin?: string;
      plan: SessionPlan;
      report: SessionReport;
    };

export const STORAGE_KEY = "session_runtime_v3";
export const APP_ORIGIN_KEY = "app_origin_v3";

export const ALARM_NAME = "session_tick_v3";

export const REPORT_PREFIX = "report_"; // report_<runId>
export const LATEST_REPORT_KEY = "latest_report_runId_v3";

export type StartSessionExternalMsg = {
  type: "START_SESSION";
  payload: { origin: string; plan: SessionPlan };
};

export type GetReportExternalMsg = {
  type: "GET_REPORT";
  payload?: { runId?: string };
};

export type Msg =
  | { type: "SHOW_RUNNING_OVERLAY"; payload: { title: string; endsAt: number; subtitle?: string } }
  | {
      type: "SHOW_FEEDBACK_MODAL";
      payload: {
        endedTitle: string;
        nextTitle: string;          // for final block we’ll set this to "Session complete ✅"
        nextNeedsTopic: boolean;    // false on final
        isFinal: boolean;           // ✅ NEW
        runId: string;              // ✅ NEW (so modal can open report)
      };
    }
  | {
      type: "SUBMIT_BLOCK_FEEDBACK";
      payload: { reflection: string; nextTopic?: string };
    }
  | { type: "OPEN_REPORT"; payload: { runId: string } } // ✅ NEW
  | { type: "GET_STATE" };

