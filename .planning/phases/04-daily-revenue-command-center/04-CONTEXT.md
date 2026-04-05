# Phase 4: Daily Revenue Command Center - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Mode:** Auto-generated from the live codebase and roadmap

<domain>
## Phase Boundary

Give COBE the daily operating dashboard called out in the posting: Stripe, Meta, GHL, and funnel visibility in one place.

This phase should take the already-live reporting surfaces and sharpen them into an executive-friendly daily command center. The app already has revenue, queue, connector, CAPI, Slack, and Sheets proof in place; the remaining work is to make the operator/leadership story cleaner, more explicit, and easier to demo.

</domain>

<decisions>
## Implementation Decisions

### Command center first
The revenue dashboard should feel like the place where an operator checks daily health, not an incidental metrics appendix.

### Expose the health signals
Queue pressure, booked calls, recovered no-shows, Stripe revenue, CAPI status, connector health, Slack/Sheets payloads, and reporting outputs should be visible together.

### Keep the live contract honest
The dashboard should reflect the same backend truth used by the operator shell and should not reintroduce seeded-only or demo-only reporting paths.

</decisions>

<code_context>
## Existing Code Insights

- `src/App.tsx` already renders revenue metrics, Meta CAPI payloads, Slack/Sheets payload previews, and connector health.
- `server/sqlStore.js` already computes dashboard summaries and report structures from the live runtime snapshot.
- `src/App.tsx` now also exposes onboarding run counts and proof in the metrics rail.
- `server/http-smoke.mjs` already exercises the live runtime contract and the major workflow paths that feed revenue reporting.

</code_context>

<specifics>
## Specific Ideas

- Promote the daily revenue view into a clearer command-center layout without losing the current operator shell.
- Keep the report and export surfaces tied to the same live backend state that powers the queue and workflow actions.
- Make the lead/demo walkthrough easy: open the dashboard, show revenue and funnel health, then show the export payloads.

</specifics>
