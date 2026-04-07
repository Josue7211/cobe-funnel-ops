# Roadmap: COBE Integration Operating Graph

## Overview

This milestone turns the console from an interview-proof dashboard into a system where integrations actively drive the product. The goal is not to add more connector logos. The goal is to make Instagram DM, ManyChat, Zapier, Make, GHL, Stripe, Discord, Slack, and Apify behave like real sources of state, routing, enrichment, escalation, and revenue movement inside the app.

The milestone focuses on one thing: when someone clicks a lead, they should be able to see which integrations touched it, what each one did, what failed, what retried, and what the operator should do next.

## Phases

**Phase Numbering:**
- Integer phases continue from the previous milestone: 11, 12, 13, 14, 15, 16, 17, 18

- [x] **Phase 11: Integration Inbox And Event Contract** - Turn integrations into first-class inbound events with one shared event model
- [x] **Phase 12: Lead Lifecycle Graph** - Show the full integration-driven lead journey from DM to onboarding
- [ ] **Phase 13: Zapier And Make Run Inspector** - Expose orchestration runs, branches, retries, and downstream mutations
- [ ] **Phase 14: GHL Pipeline And Recovery Engine** - Make call routing, no-show recovery, and owner assignment feel operationally real
- [ ] **Phase 15: Stripe To Onboarding Chain** - Make payment events visibly trigger revenue updates and onboarding handoff
- [ ] **Phase 16: Slack And Discord Alert Center** - Turn team escalation into a visible and retryable part of the workflow
- [ ] **Phase 17: Apify Enrichment And Lead Intelligence** - Make enrichment affect score, priority, and route decisions
- [ ] **Phase 18: Reliability, Replay, And Failure Hardening** - Prove the integration layer can fail visibly and recover cleanly

## Phase Details

### Phase 11: Integration Inbox And Event Contract
**Goal**: Make integrations feel real by turning them into one shared inbound event system.
**Depends on**: Existing queue, timeline, audit, and connector state surfaces
**Requirements**: [EVT-01, EVT-02, EVT-03]
**Success Criteria** (what must be TRUE):
  1. The app has one integration inbox that records inbound events across DM, orchestration, booking, payment, alerting, and enrichment.
  2. Every inbound event mutates visible product state or explicitly records why it did not.
  3. Lead timelines, queue state, and audit logs read from the same integration event model.
**Plans**: 4 plans

Plans:
- [ ] 11-01: Define a shared integration event shape for inbound connector activity
- [ ] 11-02: Build an integration inbox surface with type, source, target, payload summary, and status
- [ ] 11-03: Map inbound events into queue, timeline, and audit mutations
- [ ] 11-04: Add operator filters for source, status, and lead targeting across the inbox

### Phase 12: Lead Lifecycle Graph
**Goal**: Let the operator inspect one lead and understand its full journey across systems.
**Depends on**: Phase 11
**Requirements**: [LIFE-01, LIFE-02]
**Success Criteria** (what must be TRUE):
  1. A lead can be traced from IG DM or ManyChat entry through routing, booking, checkout, purchase, onboarding, and alerts.
  2. Every lifecycle step shows which integration caused it and when.
**Plans**: 4 plans

Plans:
- [ ] 12-01: Build a per-lead lifecycle graph or timeline for integration-driven state changes
- [ ] 12-02: Tie queue stages and badges directly to lifecycle transitions
- [ ] 12-03: Add visible cross-system links between DM, booking, payment, onboarding, and alerts
- [ ] 12-04: Make the active workflow pane prioritize lifecycle understanding over filler chrome

### Phase 13: Zapier And Make Run Inspector
**Goal**: Make orchestration logic inspectable and believable instead of implied.
**Depends on**: Phase 12
**Requirements**: [ORCH-01, ORCH-02, ORCH-03]
**Success Criteria** (what must be TRUE):
  1. Zapier and Make runs show trigger, branch, actions, status, retries, and downstream effects.
  2. Operators can replay or rerun failed orchestration work from the app.
  3. The app proves workflow logic, not just connector presence.
**Plans**: 4 plans

Plans:
- [ ] 13-01: Add a run inspector for Zapier and Make scenarios
- [ ] 13-02: Show branch decisions, filters, and action chains inside the inspector
- [ ] 13-03: Add rerun, replay, and retry actions for orchestration failures
- [ ] 13-04: Link orchestration runs back to leads, alerts, and revenue effects

### Phase 14: GHL Pipeline And Recovery Engine
**Goal**: Make GHL pipeline behavior first-class in the product.
**Depends on**: Phase 13
**Requirements**: [GHL-01, GHL-02]
**Success Criteria** (what must be TRUE):
  1. Booked, no-show, rescheduled, recovered, and won states behave like real pipeline stages.
  2. Owner routing and recovery playbooks are visible, actionable, and tied to timeline events.
**Plans**: 4 plans

Plans:
- [ ] 14-01: Add a visible GHL pipeline state model to the lead workflow
- [ ] 14-02: Show owner assignment, routing rules, and no-show escalation triggers
- [ ] 14-03: Add reschedule and recovery sequences as inspectable timeline branches
- [ ] 14-04: Tie GHL mutations into alerts, queue priority, and revenue recovery

### Phase 15: Stripe To Onboarding Chain
**Goal**: Make purchase events visibly drive revenue and onboarding.
**Depends on**: Phase 14
**Requirements**: [PAY-01, PAY-02]
**Success Criteria** (what must be TRUE):
  1. Stripe purchase events visibly update revenue, lead state, and onboarding state.
  2. Operators can inspect the exact handoff from payment to provisioning.
**Plans**: 4 plans

Plans:
- [ ] 15-01: Connect purchase events to revenue state and lead promotion
- [ ] 15-02: Show onboarding autopilot steps created by Stripe purchase events
- [ ] 15-03: Add payment-to-provisioning handoff proof in the active workflow
- [ ] 15-04: Surface failures where payment succeeded but onboarding or notification did not

### Phase 16: Slack And Discord Alert Center
**Goal**: Make team communication part of the operating system rather than a side note.
**Depends on**: Phase 15
**Requirements**: [ALERT-01, ALERT-02]
**Success Criteria** (what must be TRUE):
  1. Slack and Discord alerts are visible as triggered, acknowledged, retried, or failed work.
  2. Alerting logic is tied to lead state, failures, and escalations.
**Plans**: 4 plans

Plans:
- [ ] 16-01: Build an alert center for Slack and Discord notifications
- [ ] 16-02: Track recipient, acknowledgment, retry, and delivery status
- [ ] 16-03: Add alert triggers for hot leads, no-shows, failures, and recovered revenue
- [ ] 16-04: Link alerts back to the lead lifecycle and operator queue

### Phase 17: Apify Enrichment And Lead Intelligence
**Goal**: Make lead enrichment operationally consequential.
**Depends on**: Phase 16
**Requirements**: [ENRICH-01, ENRICH-02]
**Success Criteria** (what must be TRUE):
  1. Apify enrichment updates visible lead score, route, or priority.
  2. Operators can see what enrichment changed and why it mattered.
**Plans**: 3 plans

Plans:
- [ ] 17-01: Add an enrichment panel with creator or lead intelligence results
- [ ] 17-02: Feed enrichment into lead score, routing, and queue priority
- [ ] 17-03: Show enrichment provenance and last-refresh state in the workflow

### Phase 18: Reliability, Replay, And Failure Hardening
**Goal**: Prove that the integration graph is durable under failure, not just in happy paths.
**Depends on**: Phase 17
**Requirements**: [REL-01, REL-02, REL-03]
**Success Criteria** (what must be TRUE):
  1. Failures across orchestration, alerts, booking, payment, and enrichment are visible and triageable.
  2. Important integration events can be replayed or retried from the app.
  3. Connector health reflects real retry and backlog pressure, not generic status labels.
**Plans**: 4 plans

Plans:
- [ ] 18-01: Expand replay and retry across all major integrations
- [ ] 18-02: Add backlog, stale-run, and failure-state indicators with real consequences
- [ ] 18-03: Build operator triage views for failed events and blocked leads
- [ ] 18-04: Add regression coverage around the integration graph and replay surfaces

## Progress

**Execution Order:**
Phases execute in numeric order: 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 11. Integration Inbox And Event Contract | 4/4 | Completed | 2026-04-06 |
| 12. Lead Lifecycle Graph | 4/4 | Completed | 2026-04-06 |
| 13. Zapier And Make Run Inspector | 3/4 | In progress | - |
| 14. GHL Pipeline And Recovery Engine | 0/4 | Not started | - |
| 15. Stripe To Onboarding Chain | 0/4 | Not started | - |
| 16. Slack And Discord Alert Center | 0/4 | Not started | - |
| 17. Apify Enrichment And Lead Intelligence | 0/3 | Not started | - |
| 18. Reliability, Replay, And Failure Hardening | 0/4 | Not started | - |
