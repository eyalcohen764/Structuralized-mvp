# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always write the most clean, reusable, modular, readable, testable, scalable, sustainable, maintainable code, who follows best practices + DRY and KISS principles.

Always use **strict, explicit types** — never `any` / unknown or unsafe casts except when unavoidable.

## Project Overview

Productivity timer Chrome extension MVP ("Session Blocks") with two parts:

- **extension/** — Chrome MV3 extension: injects overlays on webpages, manages timed focus blocks, captures user reflections
- **session-web/** — React website (localhost:5173): provides Start UI and Report viewing

Both are independent TypeScript + React 19 + Vite apps (no monorepo workspace linking). Multiple files in `session-web/src/` import types directly from `../../extension/src/shared` via relative path — this is the intentional cross-project type sharing pattern, not a package dependency.

## Build & Development Commands

**Website (session-web/):**

```bash
cd session-web && npm install
npm run dev          # Dev server on http://localhost:5173
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint (flat config)
```

**Extension (extension/):**

```bash
cd extension && npm install
npm run build        # One-time Vite build → dist/
npm run build:watch  # Rebuild on file changes
```

Load the extension: chrome://extensions → Developer Mode → Load Unpacked → select `extension/dist/`. The website auto-detects the Extension ID via postMessage (content script responds with `SESSION_BLOCKS_ID`). The ID is saved to localStorage and can be manually overridden in the website's gear icon dialog — handled in `session-web/src/config.ts`.

**Environment variables (`session-web/.env`):**

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
VITE_CLOUDINARY_CLOUD_NAME=
VITE_CLOUDINARY_UPLOAD_PRESET=
```

## Architecture

### Communication Flow

**Website → Extension** (external messaging via `chrome.runtime.sendMessage(extId, msg)`):
- `START_SESSION` — sends a `SessionPlan` to begin
- `GET_REPORT` — fetches a completed session report by `runId`
- `GET_STATE` — polls current `SessionRuntimeState`

**Popup → Background** (internal messaging, same extension):
- `PAUSE_SESSION` — pauses the running block; cancels the alarm
- `RESUME_SESSION` — resumes a paused block; recreates alarm with remaining time
- `STOP_SESSION` — immediately ends the session; saves report with `endedEarly: true`

**Background → Content Script** (tab messaging):
- `SHOW_RUNNING_OVERLAY` — shows a dismissible corner card with block title and end time
- `SHOW_FEEDBACK_MODAL` — shows a fullscreen modal for reflection + optional dynamic topic input

**Content Script → Background**:
- `SUBMIT_BLOCK_FEEDBACK { reflection, nextTopic? }` — submits user reflection after a block ends
- `OPEN_REPORT { runId }` — triggers opening the web report page
- `SNOOZE_BLOCK { minutes }` — snoozes the current block end by N minutes
- `HIDE_FEEDBACK_MODAL` — dismisses the feedback modal without submitting

**Background → Content Script (time awareness)**:
- `SPEAK_ALERT { text, volume }` — triggers Web Speech API in the content script to speak a time awareness message (quarter-milestone or pre-end countdown)

### Key Files

- **`extension/src/shared.ts`** — Single source of truth: all message types (`Msg`), `SessionRuntimeState` discriminated union, `SessionPlan`, `SessionBlock`, `BlockSettings`, `ReportBlock`, `SessionReport`, `PauseRecord`, `SnoozeRecord`, storage keys, and `resolveSettings()` (merges `DEFAULT_BLOCK_SETTINGS` → `globalSettings` → `localSettings`). Touch this first when changing data contracts.
- **`extension/src/background/background.ts`** — Service worker: alarm scheduling, state machine transitions, message routing, report persistence, fallback notifications.
- **`extension/src/content/content.ts`** — Plain DOM (no React) injected into active tabs. Renders the running overlay and the reflection/feedback modal. Uses raw DOM because it runs inside arbitrary third-party pages.
- **`extension/src/runner/runner.tsx`** — Extension popup (React). Shows current state, Pause/Resume/Stop controls with inline confirmation flows.
- **`session-web/src/ActiveSessionPage.tsx`** — Shown during an active session; polls extension state and displays running/paused/awaiting_feedback status.
- **`session-web/src/SessionBuilderPage.tsx`** — Main session creation UI with block configuration and live clock estimates.
- **`session-web/src/components/BlockSettingsPanel.tsx`** — Reusable panel for configuring `BlockSettings` (snooze limits, input requirements, alert volume). Imports types from `extension/src/shared`.
- **`session-web/src/ReportPage.tsx`** — Displays a completed `SessionReport` with Planned vs Actual comparison, pause segment breakdown, and stopped-block markers.
- **`session-web/src/ArchivePage.tsx`** — Lists saved reports from Firestore with search/filter, inline rename, delete, and expand-to-preview. Uses `ReportRecord` from `reportStorage.ts`.
- **`session-web/src/components/ReportCard.tsx`** — Reusable card used in `ArchivePage` per saved report; supports inline rename, delete confirmation, and link to `/report`.
- **`session-web/src/App.tsx`** — Routes: `/login`, `/` (HomePage), `/app` (SessionGateway → ActiveSessionPage or SessionBuilderPage), `/report`, `/archive`. All routes except `/login` are wrapped in `RequireAuth`.
- **`session-web/src/AuthContext.tsx`** — Firebase Auth context: Google sign-in via `signInWithPopup`, exposes `useAuth()` hook (`user`, `loading`, `signInWithGoogle`, `signOut`).
- **`session-web/src/reportStorage.ts`** — Cloud persistence: uploads `SessionReport` JSON to Cloudinary, saves metadata (`cloudinaryUrl`, timestamps, `blockCount`) to Firestore under `users/{uid}/reports/{runId}`. Idempotent — skips re-upload if already saved.
- **`session-web/src/extensionState.ts`** — Thin helper that calls `GET_STATE` and returns the session `status` string; used by `SessionGateway` to poll every 4 s.
- **`session-web/src/config.ts`** — Extension ID resolution: auto-detect via postMessage → localStorage → hardcoded default.
- **`session-web/src/topicStorage.ts`** — Firestore CRUD for saved work topics at `users/{uid}/savedTopics`. Used by `SessionBuilderPage` to provide topic autocomplete with optimistic updates.
- **`session-web/src/components/TopicAutocomplete.tsx`** — Autocomplete input for work block topics; renders saved topics with save/delete controls inline.
- **`session-web/src/firebase.ts`** — Firebase initialization: exports `auth`, `db`, `googleProvider`, and `analytics`. Reads all config from `VITE_FIREBASE_*` env vars.

### Extension Build

Vite builds three separate entry points (configured in `extension/vite.config.ts`).
> **Note:** `extension/vite.config.ts` currently imports both the React and Vue Vite plugins — the Vue import appears unintentional. Do not add Vue dependencies; the extension is React-only.
- `background.ts` → `background.js` (service worker)
- `content.ts` → `content.js` (content script, injected on demand via `chrome.scripting`)
- `src/runner/index.html` → popup HTML page (React app)

`extension/src/pages/Report.tsx` is an unused stub (not wired into any Vite entry point); ignore it.

### Session State Machine

`SessionRuntimeState` (in `shared.ts`) is a discriminated union — always check `status`:

```
idle → running → awaiting_feedback → completed
         ↓              ↑
       paused ──────────┘
         ↓
      (Stop) → completed  [endedEarly: true]
```

- **`running`** — block timer active. Stores `currentBlockStartedAt`, `currentBlockEndsAt`, `currentPauses[]`, `snoozeCount`, `currentSnoozes[]`, `priorSnoozes[]`.
- **`paused`** — alarm cancelled. Stores `pausedAt`, `remainingMs`, `pauseReason?`, `currentPauses[]`, snooze fields.
- **`awaiting_feedback`** — modal shown to user. Has `endedBlock`, `endedBlockIndex`, `endedBlockTitle`, `nextIndex`, `nextBlockTitle`, `nextBlockNeedsTopic`, `snoozeCount`, `resolvedSettings`.
- **`completed`** — report saved to storage under `report_<runId>`.

### Alarm Strategy

`chrome.alarms.create(ALARM_NAME, { when: endsAt })` — always uses absolute epoch ms, never `delayInMinutes`. This survives service worker restarts. On pause, the alarm is cancelled and `remainingMs` is stored; on resume a new alarm is created with `now + remainingMs`.

### Data Persistence

**Extension** — `chrome.storage.local` with versioned keys (defined in `shared.ts`):
- `session_runtime_v3` — current `SessionRuntimeState`
- `report_<runId>` — completed `SessionReport`
- `latest_report_runId_v3` — runId of the most recent completed session
- `app_origin_v3` — website origin for opening the report tab

**Website (localStorage)**:
- `session_plan_v1` — last-built `SessionPlan` draft, written by `SessionBuilderPage` on Start; cleared on reset

**Website (cloud)** — after a session completes the website uploads the report to two services:
- **Cloudinary** — stores the full `SessionReport` as a raw JSON file at `reports/{uid}/{runId}.json`; returns a `secure_url`
- **Firestore** — stores lightweight metadata in `users/{uid}/reports/{runId}` (the Cloudinary URL + timestamps + `blockCount`); used as an index so the report can be fetched without re-downloading the full JSON

### Block Types

- **work** — requires a topic; shown in report with topic label
- **break** — no topic; `BREAK` label in pause breakdown
- **dynamic** — topic chosen at runtime when the block starts; if paused before topic is set, shows `DYNAMIC` in breakdown

### Block Settings

`BlockSettings` controls per-block behavior and is resolved via `resolveSettings(plan, blockIndex)` (defaults ← globalSettings ← localSettings):
- `inputRequired` / `breakInputRequired` — whether reflection is mandatory
- `endMaxCount` / `endSnoozeMaxMinutes` — snooze limit when block ends
- `returnMaxCount` / `returnSnoozeMaxMinutes` — snooze limit on return prompts
- `alertVolume` (0–100) — volume of the audio alert at block transitions
- `quarterAlerts` / `breakQuarterAlerts` — spoken alerts at 25%, 50%, 75% elapsed (work/dynamic and break respectively); requires blocks ≥ 10 min
- `preEndFrom` / `breakPreEndFrom` — ring every 5 min starting from this many minutes before the block ends (`0` = off); valid values are `PRE_END_THRESHOLDS` = `[30, 25, 20, 15, 10, 5]`
- `timeAwarenessVolume` (0–100) — volume for spoken time-awareness alerts (global-only, not overridable per-block)

Time awareness alarms use the prefix `TA_ALARM_PREFIX` (`"ta_"`) to distinguish from the main session alarm.

`SessionBlock` has `id`, `type`, `minutes`, `topic?`, `goals?`, and `localSettings?: Partial<BlockSettings>`.

### Report Data Model

`ReportBlock` has `startedAt`, `endedAt` (actual wall-clock), `minutes` (planned), `topic?`, `goals?`, `reflection?`, `pauses?: PauseRecord[]`, `snoozes?: SnoozeRecord[]`, and `plannedSettings?: BlockSettings`. `PauseRecord` holds `pausedAt`, `resumedAt`, `reason?`. `SnoozeRecord` holds `snoozedAt`, `resumedAt`, `minutes`. `SessionReport` has `endedEarly?: boolean` for stopped sessions.

`PendingSnooze` (`{ snoozedAt, minutes }`) is the in-flight snooze stored in runtime state (no `resumedAt` yet); it becomes a `SnoozeRecord` once the snooze expires and the timer resumes.

## Conventions

- TypeScript strict mode in both projects
- React Router v7 for routing in session-web
- ESLint flat config (session-web only; extension has no linter configured)
- No test framework is set up in either project

## UI Framework

- Strictly use **Material-UI (MUI)** for all styling and components in both the website and the extension popup.
- Do NOT use Tailwind CSS, custom CSS files, or inline styles.
- **Exception**: `extension/src/content/content.ts` uses raw DOM with inline styles intentionally — it must run inside arbitrary third-party pages and cannot use React or MUI.
