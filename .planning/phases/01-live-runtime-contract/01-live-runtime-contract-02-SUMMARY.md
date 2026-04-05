---
phase: 01-live-runtime-contract
plan: 02
subsystem: auth
tags: [express, react, cookies, sse, runtime-contract]
requires:
  - phase: 01-live-runtime-contract
    provides: Express-served same-origin runtime for the SPA and API
provides:
  - Cookie-backed browser auth routes for login, session bootstrap, and logout
  - Explicit local-only admin bypass semantics with fail-closed protected routes
  - Auth-gated React bootstrap for queue, workflow shell, reports, and SSE
affects: [workflow-productization, operator-ux-integrity, realtime]
tech-stack:
  added: []
  patterns: [same-origin HttpOnly session cookie, auth-gated console bootstrap, fail-closed admin middleware]
key-files:
  created: []
  modified: [server/authSession.js, server/index.js, server/http-smoke.mjs, .env.example, src/api.ts, src/App.tsx, src/App.css]
key-decisions:
  - "Use one same-origin HttpOnly cookie as the primary browser credential while preserving header-based access for scripted clients."
  - "Skip task commits because every target code file already had uncommitted brownfield changes, making atomic plan-only commits unsafe."
patterns-established:
  - "Protected browser reads, mutations, and SSE wait for `/api/auth/session` before the console boots."
  - "Authenticated runtime failures surface as auth-required or degraded states instead of falling back to seeded demo data."
requirements-completed: [AUTH-01, AUTH-02, OPS-01]
duration: 6min
completed: 2026-04-05
---

# Phase 1 Plan 2: Live Runtime Contract Summary

**Same-origin admin cookie auth now gates frontend login, protected mutations, queue/workflow/report bootstrap, and realtime SSE behind one honest browser session boundary**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-05T03:05:43Z
- **Completed:** 2026-04-05T03:11:42Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added explicit browser-safe admin session helpers for cookie issue/read/clear plus named local-only bypass enforcement in [server/authSession.js](/home/josue/Documents/projects/cobe-funnel-ops/server/authSession.js).
- Updated [server/index.js](/home/josue/Documents/projects/cobe-funnel-ops/server/index.js) so login sets an `HttpOnly` cookie, session/logout use the same contract, `requireAdmin` fails closed outside explicit local bypass, and `/api/realtime/stream` shares the same auth boundary.
- Refactored [src/api.ts](/home/josue/Documents/projects/cobe-funnel-ops/src/api.ts) and [src/App.tsx](/home/josue/Documents/projects/cobe-funnel-ops/src/App.tsx) so the console boots only after `/api/auth/session` succeeds, live runtime calls use `credentials: 'include'`, logout tears down access, and degraded/auth-required states stay visible.
- Extended [server/http-smoke.mjs](/home/josue/Documents/projects/cobe-funnel-ops/server/http-smoke.mjs) to prove unauthenticated rejection, cookie login/session success, SSE access via the same cookie, logout clearing, and post-logout `401` behavior.

## Task Commits

Task commits were intentionally skipped.

- Target files for both tasks already contained unrelated uncommitted brownfield changes in the worktree.
- Creating atomic plan-only commits would have mixed this plan with pre-existing edits and violated the repo instruction to skip unsafe commit boundaries.

## Files Created/Modified

- [server/authSession.js](/home/josue/Documents/projects/cobe-funnel-ops/server/authSession.js) - Cookie serialization/parsing, local bypass flag, and auth config enforcement.
- [server/index.js](/home/josue/Documents/projects/cobe-funnel-ops/server/index.js) - Cookie login/session/logout routes, fail-closed `requireAdmin`, and auth-gated SSE.
- [server/http-smoke.mjs](/home/josue/Documents/projects/cobe-funnel-ops/server/http-smoke.mjs) - End-to-end cookie/session/logout smoke coverage.
- [.env.example](/home/josue/Documents/projects/cobe-funnel-ops/.env.example) - Documents cookie and explicit local bypass env contract.
- [src/api.ts](/home/josue/Documents/projects/cobe-funnel-ops/src/api.ts) - Credential-aware request helper plus login/session/logout client APIs.
- [src/App.tsx](/home/josue/Documents/projects/cobe-funnel-ops/src/App.tsx) - Login gate, session bootstrap, auth-tied runtime loading, and teardown on logout.
- [src/App.css](/home/josue/Documents/projects/cobe-funnel-ops/src/App.css) - Minimal auth gate and degraded/auth-required banner styling.

## Decisions Made

- Use the session cookie as the primary browser credential because it works for both `fetch` and `EventSource('/api/realtime/stream')` without cross-origin token complexity.
- Keep header-based session/API-token access in `requireAdmin` for smoke scripts and manual API clients while making browser auth cookie-first.
- Keep the UI scope tight: add an auth gate and runtime-status banner without redesigning the existing console layout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved merged request headers while enabling `credentials: 'include'`**
- **Found during:** Task 2
- **Issue:** The shared request helper could let `init.headers` overwrite the merged defaults, which risked inconsistent auth/request behavior across client calls.
- **Fix:** Split `init` into `headers` and `rest` so the helper always merges default headers and still applies the caller's overrides.
- **Files modified:** `src/api.ts`
- **Verification:** `npm run build`, `npm run test:http`
- **Committed in:** Not committed; commit skipped due unsafe dirty tree

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Low. The fix was required for a reliable shared client auth contract and stayed within plan scope.

## Issues Encountered

- The existing `App.tsx` contained authenticated-mode local fallbacks that would have masked backend failures after login. Those paths were removed so the live console now degrades honestly instead of simulating success.
- The repo worktree was already dirty in all target plan files, so task and metadata commits were skipped intentionally.

## User Setup Required

None - no external service configuration required beyond setting the documented admin auth env vars for non-bypass runtimes.

## Next Phase Readiness

- Phase 2 can now assume one real browser session contract for workflow mutations and authenticated console bootstrap.
- Remaining work should build on the explicit `auth_required`/`degraded` states instead of reintroducing seeded live-mode fallbacks.

## Self-Check: PASSED

- Found summary file: `.planning/phases/01-live-runtime-contract/01-live-runtime-contract-02-SUMMARY.md`
- Verification commands passed: `npm run test:http`, `npm run build`
- Commits intentionally skipped due unsafe dirty worktree and documented above

---
*Phase: 01-live-runtime-contract*
*Completed: 2026-04-05*
