# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Productivity timer Chrome extension MVP ("Session Blocks") with two parts:
- **extension/** — Chrome MV3 extension: injects overlays on webpages, manages timed focus blocks, captures user reflections
- **session-web/** — React website (localhost:5173): provides Start UI and Report viewing

Both are independent TypeScript + React 19 + Vite apps (no monorepo workspace linking).

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

Load the extension: chrome://extensions → Developer Mode → Load Unpacked → select `extension/dist/`. Copy the Extension ID into `session-web/src/App.tsx` (EXTENSION_ID constant).

## Architecture

### Communication Flow

Website → Extension (external messaging via `chrome.runtime.sendMessage(EXTENSION_ID, msg)`):
- `START_SESSION` — triggers a timed focus block
- `GET_REPORT` — fetches the latest session report

Background ↔ Content Script (internal messaging):
- `SHOW_RUNNING_OVERLAY` / `SHOW_DONE_OVERLAY` — background → content
- `SUBMIT_REFLECTION` — content → background (user's typed reflection)

### Key Files

- **`extension/src/shared.ts`** — Message type definitions, `SessionState` enum (idle/running/awaiting_reflection/completed), storage keys, alarm names. This is the contract between all components.
- **`extension/src/background/background.ts`** — Service worker handling timers (chrome.alarms), state transitions, storage, and message routing. Falls back to notifications when content script can't be reached.
- **`extension/src/content/content.ts`** — Injects DOM overlays on the active webpage for timer display and reflection input.
- **`extension/src/runner/runner.tsx`** — Extension popup UI (React), alternative interface showing session state.
- **`session-web/src/App.tsx`** — Website with Home (start session) and Report (view results) routes.

### Extension Build

Vite builds three separate entry points (configured in `extension/vite.config.ts`):
- `background.ts` → `background.js` (service worker)
- `content.ts` → `content.js` (content script)
- `runner/index.html` → popup HTML page

### State Persistence

Uses `chrome.storage.local` with versioned keys (e.g., `session_state_v1`). Timers use `chrome.alarms` API.

## Conventions

- TypeScript strict mode in both projects
- React Router v7 for routing in both apps
- ESLint flat config (session-web only; extension has no linter configured)
- No test framework is set up in either project
