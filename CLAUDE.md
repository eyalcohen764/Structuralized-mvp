# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always write the most clean, reusable, modular, readable, testable, scalable, sustainable, maintainable code, who follows best practices + DRY and KISS principles.

Always use **strict, explicit types** — never `any` / unknown or unsafe casts except when unavoidable.

## Project Overview

Productivity timer Chrome extension MVP ("Session Blocks") with two parts:

- **extension/** — Chrome MV3 extension: injects overlays on webpages, manages timed focus blocks, captures user reflections
- **session-web/** — React website (localhost:5173): provides Start UI and Report viewing

Both are independent TypeScript + React 19 + Vite apps (no monorepo workspace linking). **Exception**: `session-web/src/reportStorage.ts` imports `SessionReport` directly from `../../extension/src/shared` — the two projects share types via relative path, not a package.

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
- `PAUSE_SESSION { payload: { reason } }` — pauses the running block; cancels the alarm
- `RESUME_SESSION` — resumes a paused block; recreates alarm with remaining time
- `STOP_SESSION` — immediately ends the session; saves report with `endedEarly: true`

**Background → Content Script** (tab messaging):
- `SHOW_RUNNING_OVERLAY` — shows a dismissible corner card with block title and end time
- `SHOW_FEEDBACK_MODAL` — shows a fullscreen modal for reflection + optional dynamic topic input

**Content Script → Background**:
- `SUBMIT_BLOCK_FEEDBACK { reflection, nextTopic? }` — submits user reflection after a block ends
- `OPEN_REPORT { runId }` — triggers opening the web report page

### Key Files

- **`extension/src/shared.ts`** — Single source of truth: all message types (`Msg`), `SessionRuntimeState` discriminated union, `SessionPlan`, `ReportBlock`, `SessionReport`, `PauseRecord`, and all `chrome.storage.local` keys. Touch this first when changing data contracts.
- **`extension/src/background/background.ts`** — Service worker: alarm scheduling, state machine transitions, message routing, report persistence, fallback notifications.
- **`extension/src/content/content.ts`** — Plain DOM (no React) injected into active tabs. Renders the running overlay and the reflection/feedback modal. Uses raw DOM because it runs inside arbitrary third-party pages.
- **`extension/src/runner/runner.tsx`** — Extension popup (React). Shows current state, Pause/Resume/Stop controls with inline confirmation flows.
- **`session-web/src/SessionBuilderPage.tsx`** — Main session creation UI with block configuration and live clock estimates.
- **`session-web/src/ReportPage.tsx`** — Displays a completed `SessionReport` with Planned vs Actual comparison, pause segment breakdown, and stopped-block markers.
- **`session-web/src/App.tsx`** — Routes: `/login`, `/` (HomePage), `/app` (SessionGateway → ActiveSessionPage or SessionBuilderPage), `/report`. All routes except `/login` are wrapped in `RequireAuth`.
- **`session-web/src/AuthContext.tsx`** — Firebase Auth context: Google sign-in via `signInWithPopup`, exposes `useAuth()` hook (`user`, `loading`, `signInWithGoogle`, `signOut`).
- **`session-web/src/reportStorage.ts`** — Cloud persistence: uploads `SessionReport` JSON to Cloudinary, saves metadata (`cloudinaryUrl`, timestamps, `blockCount`) to Firestore under `users/{uid}/reports/{runId}`. Idempotent — skips re-upload if already saved.
- **`session-web/src/extensionState.ts`** — Thin helper that calls `GET_STATE` and returns the session `status` string; used by `SessionGateway` to poll every 4 s.
- **`session-web/src/config.ts`** — Extension ID resolution: auto-detect via postMessage → localStorage → hardcoded default.

### Extension Build

Vite builds three separate entry points (configured in `extension/vite.config.ts`):
- `background.ts` → `background.js` (service worker)
- `content.ts` → `content.js` (content script, injected on demand via `chrome.scripting`)
- `src/runner/index.html` → popup HTML page (React app)

### Session State Machine

`SessionRuntimeState` (in `shared.ts`) is a discriminated union — always check `status`:

```
idle → running → awaiting_feedback → completed
         ↓              ↑
       paused ──────────┘
         ↓
      (Stop) → completed  [endedEarly: true]
```

- **`running`** — block timer active. Stores `currentBlockStartedAt`, `currentBlockEndsAt`, `currentPauses[]`.
- **`paused`** — alarm cancelled. Stores `pausedAt`, `remainingMs`, `pauseReason?`, accumulated `currentPauses[]`.
- **`awaiting_feedback`** — modal shown to user. Has `endedBlock`, `nextIndex`, `nextBlockNeedsTopic`.
- **`completed`** — report saved to storage under `report_<runId>`.

### Alarm Strategy

`chrome.alarms.create(ALARM_NAME, { when: endsAt })` — always uses absolute epoch ms, never `delayInMinutes`. This survives service worker restarts. On pause, the alarm is cancelled and `remainingMs` is stored; on resume a new alarm is created with `now + remainingMs`.

### Data Persistence

**Extension** — `chrome.storage.local` with versioned keys (defined in `shared.ts`):
- `session_runtime_v3` — current `SessionRuntimeState`
- `report_<runId>` — completed `SessionReport`
- `latest_report_runId_v3` — runId of the most recent completed session
- `app_origin_v3` — website origin for opening the report tab

**Website (cloud)** — after a session completes the website uploads the report to two services:
- **Cloudinary** — stores the full `SessionReport` as a raw JSON file at `reports/{uid}/{runId}.json`; returns a `secure_url`
- **Firestore** — stores lightweight metadata in `users/{uid}/reports/{runId}` (the Cloudinary URL + timestamps + `blockCount`); used as an index so the report can be fetched without re-downloading the full JSON

### Block Types

- **work** — requires a topic; shown in report with topic label
- **break** — no topic; `BREAK` label in pause breakdown
- **dynamic** — topic chosen at runtime when the block starts; if paused before topic is set, shows `DYNAMIC` in breakdown

### Report Data Model

`ReportBlock` has `startedAt`, `endedAt` (actual wall-clock), `minutes` (planned), `reflection?`, and `pauses?: PauseRecord[]`. `PauseRecord` holds `pausedAt`, `resumedAt`, `reason?`. `SessionReport` has `endedEarly?: boolean` for stopped sessions.

## Conventions

- TypeScript strict mode in both projects
- React Router v7 for routing in session-web
- ESLint flat config (session-web only; extension has no linter configured)
- No test framework is set up in either project

## UI Framework

- Strictly use **Material-UI (MUI)** for all styling and components in both the website and the extension popup.
- Do NOT use Tailwind CSS, custom CSS files, or inline styles.
- **Exception**: `extension/src/content/content.ts` uses raw DOM with inline styles intentionally — it must run inside arbitrary third-party pages and cannot use React or MUI.
