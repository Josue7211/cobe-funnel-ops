# Requirements: COBE Integration Operating Graph

**Defined:** 2026-04-05
**Core Value:** An operator can move a lead from DM to payment, recovery, and onboarding from one trustworthy console without losing state or visibility.

## v3 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Event Contract and Inbox

- [ ] **EVT-01**: The app has one shared integration event model for inbound DM, orchestration, booking, payment, alerting, and enrichment events
- [ ] **EVT-02**: Integration events are visible in one inbox with source, type, target, payload summary, and status
- [ ] **EVT-03**: Queue state, lead timelines, and audit logs derive from the same integration event flow

### Lifecycle Visibility

- [ ] **LIFE-01**: A lead can be traced from Instagram DM or ManyChat entry through routing, booking, checkout, purchase, onboarding, and alerts
- [ ] **LIFE-02**: Every lifecycle transition shows which integration or automation run caused it

### Orchestration Proof

- [ ] **ORCH-01**: Zapier and Make runs show trigger, filters, branch decisions, actions, retries, and result
- [ ] **ORCH-02**: Operators can replay or rerun failed orchestration work
- [ ] **ORCH-03**: Orchestration runs link back to leads, alerts, and revenue effects

### GHL Pipeline Operations

- [ ] **GHL-01**: Booked, no-show, rescheduled, recovered, and won states behave like real pipeline transitions
- [ ] **GHL-02**: Owner assignment and recovery actions are visible and tied to real timeline state

### Payment and Onboarding Chain

- [ ] **PAY-01**: Stripe purchase events visibly update revenue, lead stage, and onboarding state
- [ ] **PAY-02**: Operators can inspect the payment-to-onboarding handoff and its failure states

### Team Alerts

- [ ] **ALERT-01**: Slack and Discord alerts are visible as triggered, delivered, retried, or failed work
- [ ] **ALERT-02**: Alerts are tied to lead, failure, or escalation context and can be acknowledged or retried

### Enrichment and Intelligence

- [ ] **ENRICH-01**: Apify enrichment visibly affects score, route, or queue priority
- [ ] **ENRICH-02**: Operators can inspect what enrichment changed and when it last refreshed

### Reliability and Replay

- [ ] **REL-01**: Major integration failures are visible and triageable from the app
- [ ] **REL-02**: Important integration events can be replayed or retried in-product
- [ ] **REL-03**: Connector health reflects real backlog, stale-run, and retry pressure

## Out of Scope

Explicitly excluded from this milestone.

| Feature | Reason |
|---------|--------|
| Real Instagram authentication and production ManyChat integration | Not required to deepen the operator product and would slow iteration |
| Full GHL, ManyChat, or Meta platform parity | The product should orchestrate work, not clone vendor UIs |
| Consumer-facing marketing site work | The repo is for internal operator use, not lead acquisition |
| Multi-tenant SaaS billing and account management | Outside the current internal-tool focus |
| New core funnel business logic unrelated to interview proof | The current operator system already covers the business path |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EVT-01 | Phase 11 | Pending |
| EVT-02 | Phase 11 | Pending |
| EVT-03 | Phase 11 | Pending |
| LIFE-01 | Phase 12 | Pending |
| LIFE-02 | Phase 12 | Pending |
| ORCH-01 | Phase 13 | Pending |
| ORCH-02 | Phase 13 | Pending |
| ORCH-03 | Phase 13 | Pending |
| GHL-01 | Phase 14 | Pending |
| GHL-02 | Phase 14 | Pending |
| PAY-01 | Phase 15 | Pending |
| PAY-02 | Phase 15 | Pending |
| ALERT-01 | Phase 16 | Pending |
| ALERT-02 | Phase 16 | Pending |
| ENRICH-01 | Phase 17 | Pending |
| ENRICH-02 | Phase 17 | Pending |
| REL-01 | Phase 18 | Pending |
| REL-02 | Phase 18 | Pending |
| REL-03 | Phase 18 | Pending |

**Coverage:**
- v3 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after v3.0 roadmap creation*
