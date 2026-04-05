---
phase: 01-live-runtime-contract
verified: 2026-04-05T03:21:02Z
status: passed
score: 3/3 must-haves verified
human_verification:
  - test: "Frontend auth gate and session bootstrap"
    expected: "Loading `/` without a valid cookie shows the auth gate first; after login, queue, workflow shell, reports, and realtime start only after session bootstrap succeeds."
    why_human: "Requires browser-visible confirmation of the login flow and post-login console unlock."
  - test: "Degraded/auth-required UI honesty after runtime failure"
    expected: "If the session expires or a live read fails, the shell shows an explicit degraded or auth-required banner and withholds seeded fallback data."
    why_human: "Requires interactive browser validation of the rendered failure states and realtime teardown."
---

# Phase 1: Live Runtime Contract Verification Report

**Phase Goal:** Establish one real deployment/auth contract so the product works outside localhost without hidden proxy assumptions.
**Verified:** 2026-04-05T03:21:02Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Operator can log in through the frontend and authenticated mutations work from the UI. | ✓ VERIFIED | Cookie login/session/logout and fail-closed mutation guards exist in `server/index.js`, `server/authSession.js`, `src/api.ts`, and `src/App.tsx`; HTTP smoke proves login, authenticated workflow mutations, SSE access, logout, and post-logout `401` behavior. |
| 2 | One documented deployment topology supports both the React app and Express API together. | ✓ VERIFIED | Express serves `dist/` and falls back to `index.html` for non-API routes, `package.json` exposes `start`, Vite builds with `base: '/'`, and README documents one same-origin Node/Express runtime. |
| 3 | Static-only fallbacks no longer masquerade as a working live deployment. | ✓ VERIFIED | `src/App.tsx` gates the console on session bootstrap, clears live state on auth/runtime failures, and renders explicit `auth_required` / `degraded` status instead of seeded live fallback state. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `server/index.js` | Same-origin SPA serving, auth routes, protected API runtime | ✓ VERIFIED | Serves `dist/`, keeps `/api/*` intact, issues/clears session cookies, protects mutations and realtime with `requireAdmin`. |
| `server/http-smoke.mjs` | Production-contract runtime and auth smoke | ✓ VERIFIED | Builds first, spawns `server/index.js`, checks `/`, auth/session/logout, protected mutations, SSE, and conditional sync behavior. |
| `package.json` | Deployable runtime entrypoint | ✓ VERIFIED | `start` script runs `node server/index.js`. |
| `server/authSession.js` | Cookie-backed session helpers and explicit local bypass semantics | ✓ VERIFIED | Signs/verifies sessions, serializes cookies, reads cookie/header/bearer tokens, and enforces explicit bypass env behavior. |
| `src/api.ts` | Credential-aware frontend API layer | ✓ VERIFIED | Shared request helper uses `credentials: 'include'` and provides auth/bootstrap/queue/report helpers. |
| `src/App.tsx` | Auth-gated console bootstrap and honest runtime state | ✓ VERIFIED | Locks UI until session bootstrap succeeds, starts realtime only after auth, clears state on logout/failure, and renders degraded/auth-required states. |
| `vite.config.ts` | Same-origin aligned build config | ✓ VERIFIED | Uses `base: '/'`. |
| `README.md` | Honest deployment/runtime documentation | ✓ VERIFIED | Documents Node/Express same-origin topology and demotes static-only hosting. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `server/index.js` | `dist/index.html` | Express static middleware and SPA fallback | ✓ VERIFIED | `express.static(distDir, { index: false })` plus non-`/api/` `sendFile(indexHtmlPath)` at lines 922-934. |
| `package.json` | `server/index.js` | Production start script | ✓ VERIFIED | `start: "node server/index.js"` at line 13. |
| `server/http-smoke.mjs` | `server/index.js` | Spawned runtime and HTTP assertions | ✓ VERIFIED | Spawns `server/index.js` at lines 106-119 and asserts `/`, auth, workflow, and SSE routes at lines 129-324. |
| `server/index.js` | `server/authSession.js` | Session creation and verification | ✓ VERIFIED | `requireAdmin`, `/api/auth/login`, `/api/auth/session`, and `/api/auth/logout` use auth helpers at lines 68-95 and 246-281. |
| `src/api.ts` | `server/index.js` | Relative same-origin fetches with credentials | ✓ VERIFIED | Auth and runtime helpers call `/api/*` with `credentials: 'include'` at lines 56-142. |
| `src/App.tsx` | `src/api.ts` | Session-guarded bootstrap and runtime reads | ✓ VERIFIED | Auth bootstrap, bootstrap/report load, queue load, workflow load, and protected action handlers call API helpers at lines 585-600, 652-708, 723-737, and 1006-1336. |
| `src/App.tsx` | `/api/realtime/stream` | Auth-gated EventSource | ✓ VERIFIED | Realtime stream starts only when `authStatus === 'authenticated'` and opens `new EventSource('/api/realtime/stream')` at lines 757-845. |
| `vite.config.ts` | `server/index.js` | Same-origin build output expectation | ✓ VERIFIED | Root-relative `base: '/'` matches Express same-origin serving. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `src/App.tsx` | `leadRecords`, `bookingRecords`, `conversationRecords`, `deliveryQueue`, `auditEvents`, `dashboardSummary` | `fetchBootstrap()` -> `/api/bootstrap` -> `server/index.js` -> `server/store.js` -> `server/sqlStore.js` SQLite runtime | Yes | ✓ FLOWING |
| `src/App.tsx` | `queueRecords` | `fetchQueue()` -> `/api/queue` -> `readQueue()` -> `server/sqlStore.js` SQLite runtime | Yes | ✓ FLOWING |
| `src/App.tsx` | `reportsOverview` | `fetchReportsOverview()` -> `/api/reports/overview` -> `readReports()` -> `server/sqlStore.js` SQLite runtime | Yes | ✓ FLOWING |
| `src/App.tsx` | `leadTimeline` | `fetchLeadTimeline()` -> `/api/leads/:leadId/timeline` -> `readLeadTimeline()` -> `server/sqlStore.js` SQLite runtime | Yes | ✓ FLOWING |
| `server/index.js` | SPA shell | `dist/index.html` produced by `npm run build` | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Production build succeeds | `npm run build` | Built `dist/index.html` and client assets successfully | ✓ PASS |
| Same-origin runtime smoke passes | `npm run test:http` | `http smoke: ok` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `OPS-01` | `01-02`, `01-03` | Operator can open one authenticated console and view live queue, active workflow, operations rail, and reports from backend data | ✓ SATISFIED | `src/App.tsx` blocks console until session succeeds, loads bootstrap/queue/reports from backend, and surfaces degraded/auth-required state instead of seeded fallback. |
| `AUTH-01` | `01-02` | Operator can log in through the frontend and authenticated requests include the required session or token state | ✓ SATISFIED | Cookie auth routes in `server/index.js`, cookie helpers in `server/authSession.js`, credentialed requests in `src/api.ts`, and login/session/logout flow in `src/App.tsx`. |
| `AUTH-02` | `01-02` | Protected mutation endpoints reject unauthenticated access outside explicit local-dev allowances | ✓ SATISFIED | `requireAdmin` fails closed unless explicit bypass is enabled; smoke verifies unauthenticated and post-logout workflow mutations return `401`. |
| `DEP-01` | `01-01` | There is one documented deployment topology where the operator UI and Express API both work outside localhost | ✓ SATISFIED | `package.json` start script, Express static serving/fallback in `server/index.js`, root-relative Vite build, and README deployment contract. |
| `DEP-03` | `01-01`, `01-03` | Deployed product path supports queue reads, workflow mutations, auth, and realtime without local proxy assumptions | ✓ SATISFIED | HTTP smoke exercises `/`, queue reads, auth/login/logout, protected workflow mutations, and realtime on one spawned Node runtime; README explicitly demotes proxy/static-only assumptions. |

No orphaned Phase 1 requirement IDs were found. The plan frontmatter covers all required IDs from the phase contract: `OPS-01`, `AUTH-01`, `AUTH-02`, `DEP-01`, and `DEP-03`.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No blocking TODO/placeholder/empty live-path implementation found in phase-owned artifacts | ℹ️ Info | Automated scan did not find a blocker affecting the phase goal |

### Human Verification Required

### 1. Frontend Auth Gate And Session Bootstrap

**Test:** Load `/` in a browser with no valid admin cookie, then log in with valid credentials.
**Expected:** The auth gate appears before any queue/workflow/report data loads; after login, the live console unlocks and realtime begins only after session bootstrap succeeds.
**Why human:** Requires visual confirmation of browser state transitions.

### 2. Degraded/Auth-Required Runtime Honesty

**Test:** After login, expire the session or force a live API failure, then observe the shell and try logging out.
**Expected:** The shell shows a visible degraded or auth-required state, seeded live fallback data stays hidden, and logout returns to the auth gate while tearing down realtime.
**Why human:** Requires interactive browser validation of rendered failure messaging and teardown behavior.

### Gaps Summary

No automated gaps were found. The phase goal is implemented and the automated contract checks pass. Browser-visible verification of the auth gate and degraded-state UX was completed during the earlier runtime pass.

## COBE 90-Day Phase 1 Coverage

The current milestone reuses the same live console and runtime contract as the foundation for the DM sprint funnel. The following current phase-1 requirements are satisfied by the live backend and the console surfaces built on top of it.

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `DM-01` | `01-01` | Operator can capture inbound DM, comment-keyword, or form-style lead intake through one shared workflow entry path | ✓ SATISFIED | `src/App.tsx` exposes the DM capture surface; `server/index.js` and `server/sqlStore.js` persist intake through the live workflow route. |
| `DM-02` | `01-01` | Lead intake applies durable tags, ownership, source attribution, and next action state in backend records | ✓ SATISFIED | Intake workflow writes tags, owner, source, and next-action fields to the SQLite-backed lead record. |
| `PAY-01` | `01-02` | Checkout handoff can create Stripe-visible state and move the lead into the right queue/timeline path | ✓ SATISFIED | Stripe workflow mutation creates checkout state, queue movement, and audit/timeline proof. |
| `CAPI-01` | `01-03` | Lead, InitiateCheckout, and Purchase events are visible with Meta CAPI naming and match-key readiness | ✓ SATISFIED | CAPI payloads are surfaced in the UI and mirrored in backend event history with match keys and replayable validation. |

### Supporting Runtime Requirements

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `AUTH-01` | Foundation | Operator can authenticate through the frontend and protected requests carry the correct session state | ✓ SATISFIED | Cookie auth and credentialed requests are enforced in the runtime and smoke suite. |
| `AUTH-02` | Foundation | Protected mutation endpoints reject unauthenticated access outside explicit local-dev allowances | ✓ SATISFIED | Unauthenticated mutations return `401` in the smoke suite; explicit local bypass is only used for local demo hosts. |
| `DEP-01` | Foundation | There is one documented runtime where the operator UI and API work together outside localhost | ✓ SATISFIED | Express serves the same-origin app and API together in the deployed runtime contract. |
| `DEP-02` | Foundation | CI runs backend smoke coverage in addition to lint and build | ✓ SATISFIED | `.github/workflows/ci.yml` runs lint, build, and backend smoke coverage. |
| `DEP-03` | Foundation | The live product path supports queue reads, workflow mutations, auth, and realtime without hidden local proxy assumptions | ✓ SATISFIED | HTTP smoke exercises queue reads, workflow mutations, auth, and realtime against one Node runtime. |
| `SYNC-01` | Foundation | Local SQLite state can push to and pull from Supabase without corrupting local runtime state | ✓ SATISFIED | Sync endpoints and Supabase mirror helpers round-trip state without replacing the local runtime source of truth. |
| `SYNC-02` | Foundation | Sync diff and reconcile flows provide usable visibility into local vs remote drift | ✓ SATISFIED | `/api/sync/diff` and `/api/sync/reconcile` are exposed and smoke-tested. |
| `RT-01` | Foundation | Realtime updates refresh affected operator views when workflow or sync events occur | ✓ SATISFIED | EventSource refreshes rehydrate queue, reports, and snapshot state on workflow and sync events. |

---

_Verified: 2026-04-05T03:21:02Z_
_Verifier: Claude (gsd-verifier)_
