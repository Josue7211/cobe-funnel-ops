# Phase 3: Client Onboarding Autopilot - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Mode:** Auto-generated from the live codebase and roadmap

<domain>
## Phase Boundary

Turn successful payments into immediate fulfillment work with assets, links, invites, and operator visibility.

The onboarding system already exists at the backend level: provisioning runs are persisted in `onboarding_runs`, `provisionOnboarding()` upserts the record, and the runtime snapshot exposes the run list alongside the dashboard summary. The remaining work for this phase is to make the onboarding proof path feel first-class in the operator console and to keep incomplete provisioning visible rather than hidden.

</domain>

<decisions>
## Implementation Decisions

### Operator visibility is the product
Show the onboarding run records, status, and asset links in the live operator shell. The operator should be able to inspect and retry provisioning from the same console used for DM, booking, and recovery workflows.

### Provisioning is replayable
Use the existing onboarding provision endpoint as the retry path. A repeated provisioning action should upsert the run state instead of creating a separate retry-only contract.

### Visibility beats abstraction
Kajabi, Skool, and Discord handoff states should be visible in the console and reporting surfaces, but they should remain implemented as the existing backend workflow state rather than a new external coordination layer.

</decisions>

<code_context>
## Existing Code Insights

- `server/sqlStore.js` already stores `onboardingRuns` in the snapshot and implements `provisionOnboarding()` with folder, SOP, and invite URLs.
- `src/App.tsx` already triggers onboarding from the proof-recipe rail via `handleRunRecipe('onboarding')`.
- `src/App.tsx` currently only surfaced onboarding as a count; the new panel now exposes actual run records and retry affordances.
- `server/http-smoke.mjs` now asserts onboarding provisioning side effects, including the run record and the onboarding delivery queue entry.

</code_context>

<specifics>
## Specific Ideas

- Surface the latest onboarding run cards in the metrics rail with status and asset links.
- Keep the onboarding retry action on the same active lead/proof recipe flow already used by the console.
- Make the onboarding proof readable in interviews: show the folder, SOP, and invite links, plus the matching delivery queue item.

</specifics>
