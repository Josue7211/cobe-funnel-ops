# Phase 2: GHL Call Routing And No-Show Recovery - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the consult-call operating path the COBE posting asks for: booking creation, owner routing, reminder/no-show handling, recovery sequencing, and visible operator proof across queue, timeline, audit, delivery, and metrics surfaces.

</domain>

<decisions>
## Implementation Decisions

### Booking pipeline behavior
- **D-01:** This phase treats consult handling as a first-class workflow track, not a side effect hidden under the generic queue.
- **D-02:** Booking events must drive visible lead stage transitions across `booked`, `no-show`, and `recovery`.
- **D-03:** Owner assignment is part of the product requirement and must be visible in both backend state and UI surfaces.

### Recovery system behavior
- **D-04:** No-show actions must create durable recovery work, not only a label change. Required artifacts include delivery queue items, audit entries, and timeline history.
- **D-05:** Recovery must include explicit escalation semantics such as reminder state, rebook prompt, or alert path so the operator can explain the workflow clearly.

### Product surface expectations
- **D-06:** The operator UI must make call routing and no-show recovery feel like a primary operating system, not a demo-only recipe card.
- **D-07:** Metrics for booked calls, no-shows, recovered calls, and recovery backlog should become more explicit in this phase.

### the agent's Discretion
Exact visual treatment, component breakdown, and whether the operator surface uses existing rail modules or a new dedicated workspace can be decided during planning so long as the result stays coherent with the current UI.

</decisions>

<specifics>
## Specific Ideas

- Keep the implementation grounded in the existing queue/workspace/rail architecture rather than redesigning the whole product.
- Reuse the current booking workflow endpoint and extend it instead of introducing parallel flow abstractions unless the planner finds a clear reason.
- Align this phase directly with the posting language: `call routing`, `no-show recovery`, `GHL pipelines`, `triggers`, and `webhooks`.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and roadmap
- `.planning/PROJECT.md` — project purpose and brownfield decisions
- `.planning/ROADMAP.md` — current 90-day phase structure and success criteria
- `.planning/REQUIREMENTS.md` — existing requirement inventory and traceability that this phase will likely evolve
- `.planning/STATE.md` — current phase progression and prior decisions

### Existing code and behavior
- `src/App.tsx` — existing queue, workspace, recipe, rule lab, metrics, and booking-related UI
- `src/data.ts` — seeded workflow scenarios, booking examples, and connector descriptions
- `server/index.js` — workflow endpoint routing and auth boundary
- `server/sqlStore.js` — booking workflow, lead actions, queue reads, metrics, and timeline/audit side effects

### Prior phase artifacts
- `.planning/phases/01-live-runtime-contract/01-RESEARCH.md` — runtime and product constraints already established
- `.planning/phases/01-live-runtime-contract/01-VALIDATION.md` — prior phase validation outcomes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `runBookingUpdateRequest` in `src/App.tsx` already exercises the booking workflow path from the UI.
- `server/sqlStore.js` already contains booking state, lead stage mapping, delivery queue writing, and audit/timeline patterns that can be extended.
- The `queue`, `workspace`, `automation rail`, and `metrics rail` already display enough state to support a stronger consult-call workflow without starting over.

### Established Patterns
- Workflow mutations return snapshots that are applied back into frontend state.
- Queue, timeline, delivery, and audit state are intended to stay in sync after a mutation.
- The current product prefers one same-origin runtime and one operator shell over multiple disconnected tools.

### Integration Points
- `/api/workflows/booking-update`
- `/api/leads/:leadId/actions`
- queue filtering and active lead workspace in `src/App.tsx`
- reports and metrics returned from `readReports()` in `server/sqlStore.js`

</code_context>

<deferred>
## Deferred Ideas

- Full daily revenue command-center polish belongs to Phase 4.
- Post-sale provisioning and community access belong to Phase 3.
- Internal-tool factory work belongs to Phase 5.

</deferred>

---

*Phase: 02-ghl-call-routing-and-no-show-recovery*
*Context gathered: 2026-04-05*
