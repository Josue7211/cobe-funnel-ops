---
phase: 01-live-runtime-contract
plan: 01
subsystem: infra
tags: [express, vite, runtime, smoke-test, same-origin]
requires: []
provides:
  - "Express serves the built SPA from dist while preserving /api/* ownership"
  - "HTTP smoke validates the same-origin deployment contract and treats Supabase sync as optional"
affects: [auth, deployment, frontend, api, testing]
tech-stack:
  added: []
  patterns: [same-origin express runtime, build-first deployment smoke]
key-files:
  created: []
  modified:
    - package.json
    - server/index.js
    - server/http-smoke.mjs
key-decisions:
  - "Keep Express as the single Phase 1 runtime authority for both built SPA assets and /api routes."
  - "Make HTTP smoke build the frontend and assert sync behavior conditionally so Supabase is optional in Phase 1."
patterns-established:
  - "Serve dist/ through Express and use a non-/api GET fallback to index.html for SPA routes."
  - "Validate deployment reality in smoke tests by hitting / and /api/* from the same spawned Node process."
requirements-completed: [DEP-01, DEP-03]
duration: 8min
completed: 2026-04-05
---

# Phase 1 Plan 1: Live Runtime Contract Summary

**Same-origin Express runtime for built Vite assets plus `/api/*`, with deployment smoke that proves `/` and API routes work from one process**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-05T02:54:47Z
- **Completed:** 2026-04-05T03:02:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added an explicit production `start` entrypoint so the repo exposes one deployable Node runtime.
- Updated Express to serve `dist/` assets and fall back to `dist/index.html` for non-API GET routes without intercepting `/api/*`.
- Reworked HTTP smoke to build first, assert the SPA shell at `/`, preserve live API and SSE checks, and make remote sync expectations depend on configuration.

## Task Commits

Task commits were intentionally skipped because `package.json` and `server/index.js` already contained unrelated uncommitted changes before this plan executed, so an atomic commit would have mixed unrelated work.

No metadata commit was created for the same reason.

## Files Created/Modified

- `package.json` - Added the production `start` script for the Node runtime.
- `server/index.js` - Added `dist/` path resolution, `express.static(...)`, and a fallback route that skips `/api/`.
- `server/http-smoke.mjs` - Added build-first smoke setup and same-origin runtime assertions with config-sensitive sync expectations.

## Decisions Made

- Kept the runtime change inside the existing Express server instead of introducing a second preview/runtime layer.
- Treated Supabase sync as optional for this phase so deployment smoke verifies the live contract rather than an external mirror dependency.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The worktree was already dirty in `package.json` and `server/index.js`, so per-task commits and the final docs commit were unsafe and were skipped intentionally.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The repo now has a verified same-origin runtime contract for a built SPA plus Express API.
- Phase `01-02` can wire the frontend auth/session behavior against this single-origin runtime without relying on Vite proxy assumptions.

## Self-Check: PASSED

- Found summary file at `.planning/phases/01-live-runtime-contract/01-live-runtime-contract-01-SUMMARY.md`
- No commits were expected for this plan because atomic commits were unsafe in the dirty worktree
