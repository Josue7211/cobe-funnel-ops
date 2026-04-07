# Phase 8: Scenario Simulator And Replay Lab - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning
**Source:** COBE v2 milestone roadmap + phase 6/7 interview console

<domain>
## Phase Boundary

Make the product replayable so the interviewer can see success paths and failure branches on demand.

This phase should let the console replay realistic DM, booking, onboarding, sync, and connector flows with obvious failure handling instead of relying on static screenshots or logs.

</domain>

<decisions>
## Implementation Decisions

### Scenario-first replay
The app should let the operator switch between realistic scenarios and branches quickly during a live walkthrough.

### Failure visibility
Failure states should be visible in the UI as first-class outcomes, not hidden exceptions.

### Branch clarity
The simulator should keep the success path and failure path understandable enough to talk through in an interview.

### the agent's Discretion
Exact failure modeling and replay controls are up to implementation as long as the result stays believable and useful live.

</decisions>

<code_context>
## Existing Code Insights

- The console already has three core scenario archetypes: DM to Stripe, booked/no-show recovery, and payment to onboarding.
- There is already a live stepper for scenario state, plus delivery failures, connector attention states, and webhook replay actions.
- The interview mode and integration evidence work give the simulator a stable surface to plug into.

</code_context>

<specifics>
## Specific Ideas

- Add scenario replay controls that switch the active story quickly.
- Add visible failure-state simulations for webhook, sync, and onboarding exceptions.
- Keep the replay and triage story live inside the console.

</specifics>

<deferred>
## Deferred Ideas

- Full synthetic browser automation or external test harnesses.
- Vendor-specific parity with GHL or Meta simulators.

</deferred>

---

*Phase: 08-scenario-simulator-and-replay-lab*
*Context gathered: 2026-04-05 via autonomous continuation*
