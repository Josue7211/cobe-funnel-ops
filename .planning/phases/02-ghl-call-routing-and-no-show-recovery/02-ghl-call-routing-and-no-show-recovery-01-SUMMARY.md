---
phase: 02-ghl-call-routing-and-no-show-recovery
plan: 01
subsystem: api
tags: [express, sqlite, bookings, ghl, routing]
requires:
  - phase: 01-live-runtime-contract
    provides: same-origin Express runtime, authenticated workflow mutations, SQLite-backed operator state
provides:
  - explicit consult workflow normalization for booked, reminded, no-show, recovered, and rescheduled states
  - durable owner-aware booking mutations shared by webhook and operator actions
  - validated `/api/workflows/booking-update` contract with leadId/handle targeting
affects: [queue, timeline, audit, reports, recovery]
tech-stack:
  added: []
  patterns: [centralized consult workflow transition map, normalized booking endpoint parsing]
key-files:
  created: []
  modified: [server/sqlStore.js, server/index.js, src/types.ts]
key-decisions:
  - "Define consult lead-stage and booking-status semantics in one transition map inside `server/sqlStore.js`."
  - "Keep `/api/workflows/booking-update` as the only booking mutation path while allowing either `handle` or `leadId` addressing."
patterns-established:
  - "Consult workflow state is normalized before queue, report, timeline, and delivery side effects are derived."
  - "Owner routing is written into both lead and booking records on every consult mutation."
requirements-completed: [GHL-01, GHL-02]
duration: 13 min
completed: 2026-04-05
---

# Phase 02 Plan 01: GHL Call Routing And No-Show Recovery Summary

**Centralized consult workflow transitions now drive owner-aware booking updates, recovery state, and the canonical booking-update API contract**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-05T20:56:30Z
- **Completed:** 2026-04-05T21:09:53Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Centralized consult workflow semantics for `booked`, `reminded`, `no-show`, `recovered`, `rescheduled`, and `lost` in the backend model.
- Made owner assignment durable across webhook mutations, manual lead actions, queue/report derivation, and booking upserts.
- Tightened `/api/workflows/booking-update` input validation so routing and recovery inputs are accepted consistently without adding parallel routes.

## Task Commits

Task-level code commits were skipped for this plan.

Reason: `server/sqlStore.js` and `server/index.js` already contained broad brownfield edits in the working tree, so isolating a safe plan-only commit would have risked bundling unrelated user changes.

## Files Created/Modified
- `server/sqlStore.js` - Added the consult transition map, owner resolution, normalized booking reads, and shared workflow delivery side effects.
- `server/index.js` - Added canonical booking-update request parsing and validation before the store mutation path.
- `src/types.ts` - Extended booking types with normalized consult statuses and routing metadata exposed to the frontend.

## Decisions Made

- Centralized consult workflow transitions in one backend map so lead stage, booking status, next action, recovery text, and downstream delivery semantics cannot drift.
- Preserved `/api/workflows/booking-update` as the single booking mutation route and widened it to accept `leadId` or `handle` instead of creating a new route.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added booking-update request validation**
- **Found during:** Task 2 (Keep the API contract aligned with normalized backend behavior)
- **Issue:** The booking workflow route accepted arbitrary bodies, which let invalid statuses silently collapse into default behavior.
- **Fix:** Added endpoint-level parsing plus store-level status validation for supported consult states and required lead targeting.
- **Files modified:** `server/index.js`, `server/sqlStore.js`
- **Verification:** `npm run test:backend`, `npm run test:http`, `npm run build`
- **Committed in:** None - task commit skipped because target files already had unrelated brownfield edits

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The added validation was necessary to keep the normalized consult pipeline trustworthy. No scope creep beyond the booking contract.

## Issues Encountered

- `npm run test:http` failed once on an intermediate run with a false `payment.ok` assertion. A clean rerun passed without additional code changes, so the issue appears transient rather than a persistent regression from this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The backend now exposes stable consult routing semantics for 02-02 to build explicit no-show triggers and escalation timers on top.
- No blockers identified for moving to 02-02.

## Self-Check: PASSED

- Summary file exists on disk.
- No task commit hashes were expected for this plan because task commits were intentionally skipped due to dirty brownfield target files.

---
*Phase: 02-ghl-call-routing-and-no-show-recovery*
*Completed: 2026-04-05*
