# Phase 6: Interview Mode And Guided Narrative - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Source:** COBE v2 milestone roadmap + shipped v1.0 console

<domain>
## Phase Boundary

Turn the shipped operator console into an interview-grade demo surface.

This phase should make the product easier to explain live: a one-click interview mode, a guided walkthrough that maps job-post skills to visible surfaces, and a proof-pack artifact that can be shared after the walkthrough.

</domain>

<decisions>
## Implementation Decisions

### Curated demo state
Interview mode should land on a high-signal lead and runtime state chosen for clarity, not randomness.

### Guided narrative
The app should explain itself with a concise set of steps tied to the job post and the live surfaces already in the console.

### Proof artifact
The existing proof-pack pattern should be extended so the operator can export an interview follow-up artifact from live state.

### the agent's Discretion
Exact layout, interaction flow, and which lead/scenario is curated are up to implementation as long as the result is useful in a live walkthrough.

</decisions>

<code_context>
## Existing Code Insights

- The app already has reusable runtime reset, proof artifact, and internal-tool generation code.
- The console already exposes queue, scenario, onboarding, connector, and reporting surfaces that can be repurposed for interview mode.
- Seed data includes three clear scenario archetypes: DM to Stripe, booked/no-show recovery, and payment to onboarding.

</code_context>

<specifics>
## Specific Ideas

- Add a one-click button that resets the runtime into a curated interview-ready state.
- Add a visible walkthrough that maps the job post to the current console sections.
- Reuse the proof-pack generator so the interviewer can leave with a clean summary.

</specifics>

<deferred>
## Deferred Ideas

- A separate external marketing/demo site.
- New core funnel logic unrelated to interview proof.

</deferred>

---

*Phase: 06-interview-mode-and-guided-narrative*
*Context gathered: 2026-04-05 via autonomous continuation*
