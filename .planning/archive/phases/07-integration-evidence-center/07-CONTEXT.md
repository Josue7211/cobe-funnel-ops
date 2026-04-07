# Phase 7: Integration Evidence Center - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Source:** COBE v2 milestone roadmap + shipped interview-mode console

<domain>
## Phase Boundary

Expose the real connector story so the interviewer can see payloads, retries, health, replay, and event naming instead of reading labels.

This phase should make integrations impossible to hand-wave away by surfacing evidence for GHL, Meta CAPI, Zapier/Make, ManyChat, Apify, Kajabi, Skool, and Discord in the live console.

</domain>

<decisions>
## Implementation Decisions

### Evidence-first connector view
The console should present connector evidence as a first-class surface with selector-driven detail instead of buried logs.

### Replayable payloads
The product should show real payload history, retry state, and connector health from live runtime data where possible.

### Job-post traceability
Event naming, webhook proof, and replay detail should be obvious enough that the interviewer can connect the app to the job requirements without extra explanation.

### the agent's Discretion
Exact layout, selection model, and which connector is highlighted by default are up to implementation as long as the evidence is clear and credible.

</decisions>

<code_context>
## Existing Code Insights

- The systems rail already includes connector health cards, Meta CAPI proof, and retryable outbox rows.
- Live test runs and delivery items already contain enough payload information to show evidence without inventing fake data.
- The interview-mode groundwork from phase 6 gives the console a stable guided entry point for evidence-heavy walkthroughs.

</code_context>

<specifics>
## Specific Ideas

- Add a connector selector that changes the evidence detail view.
- Show replay history, payload text, and outbox rows for the chosen connector.
- Keep the evidence visible in the same console so the walkthrough stays live.

</specifics>

<deferred>
## Deferred Ideas

- External log analysis dashboards.
- Vendor-specific parity with Zapier, GHL, or Meta tooling.

</deferred>

---

*Phase: 07-integration-evidence-center*
*Context gathered: 2026-04-05 via autonomous continuation*
