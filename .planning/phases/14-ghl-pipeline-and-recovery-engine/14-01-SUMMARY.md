# Phase 14-01 Summary: Add GHL Pipeline State Model

- Added a visible GHL pipeline model to the Recovery workspace that now surfaces booked, no-show, recovery, recovered, rescheduled, and won state visibility with active/complete/upcoming labels.
- Added owner routing and no-show escalation visibility (`owner • lane`, current escalation status, and no-show action notes) directly in the recovery workbench.
- Reused existing lead/booking/queue state so state visibility stays grounded in live records with minimal backend changes.

### Verification
- `npm run lint`
- `npm run build`
- `npm run test:backend`
- `npm run test:http`
