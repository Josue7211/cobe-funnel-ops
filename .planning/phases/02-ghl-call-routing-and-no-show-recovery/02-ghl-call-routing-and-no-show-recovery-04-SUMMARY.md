---
phase: 02-ghl-call-routing-and-no-show-recovery
plan: 04
subsystem: qa
tags: [smoke, replay, bookings, recovery, verification]
requires:
  - phase: 02-ghl-call-routing-and-no-show-recovery
    provides: consult routing UI and recovery state surfaces
provides:
  - automated replay coverage for booked, no-show, recovered, and rescheduled flows
  - HTTP-level assertion that the consult pipeline fails when the workflow contract breaks
  - proof that the operator demo can be trusted without hidden manual steps
affects: [smoke, workflows, recovery, ui-proof]
tech-stack:
  added: []
  patterns: [replay smoke coverage, workflow contract verification]
key-files:
  created: []
  modified: [server/http-smoke.mjs, server/smoke.mjs, src/App.tsx]
key-decisions:
  - "Use the real booking-update endpoint as the replay surface for the consult pipeline."
  - "Assert the final consult state after replay so the smoke checks for orphaned or duplicated booking rows."
patterns-established:
  - "Recovery and reschedule flows are replayable through the canonical HTTP contract."
  - "Smoke coverage now exercises the consult workflow path end to end, including the no-show recovery branch."
requirements-completed: [REC-02, DEP-02]
duration: 15 min
completed: 2026-04-05
---

# Phase 02 Plan 04: Replay and verification summary

## Accomplishments
- Expanded the HTTP smoke so it exercises booked, no-show, recovered, and rescheduled states in sequence.
- Added assertions that the final booking state is singular and reflects the replayed consult flow instead of accumulating duplicate rows.
- Confirmed the booking workflow can be demonstrated as a real contract in automated verification.

## Verification
- `npm run test:http` — passed
- `npm run build` — passed

## Notes
- The smoke now behaves like a real regression guard for consult routing and recovery paths.
