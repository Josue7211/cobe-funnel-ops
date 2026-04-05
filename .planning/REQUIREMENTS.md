# Requirements: COBE Interview Operating System

**Defined:** 2026-04-05
**Core Value:** An operator can move a lead from DM to payment, recovery, and onboarding from one trustworthy console without losing state or visibility.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Narrative and Interview Mode

- [ ] **NARR-01**: The app can open in an interview mode that loads a curated, high-signal demo state in one click
- [ ] **NARR-02**: The app can guide an interviewer through the job-post skills and show where each one is proven in the product
- [ ] **NARR-03**: A proof pack can be generated from live state for follow-up after the walkthrough

### Integration Evidence

- [ ] **INTG-01**: GHL, Meta CAPI, Zapier/Make, ManyChat, Apify, Kajabi, Skool, and Discord evidence is visible in the UI
- [ ] **INTG-02**: Connector payloads, history, retries, and health are inspectable from the operator console
- [ ] **INTG-03**: Event naming, webhook proof, and replay data are understandable without external logs

### Simulation and Reliability

- [ ] **SIM-01**: The app can replay realistic success and failure scenarios across DM, booking, onboarding, sync, and connector flows
- [ ] **SIM-02**: Failure states surface clearly enough that webhook, sync, and onboarding issues can be triaged from the console

### Presentation and Brand

- [ ] **BRAND-01**: The visual system feels like a premium internal operations tool with real brand assets and a coherent full-width layout
- [ ] **BRAND-02**: The app maintains a single intentional presentation layer instead of fragmented boxes and ad hoc demo surfaces

### Deployment and Credibility

- [ ] **DEP-04**: The app has one obvious deployable runtime story that can be explained and demonstrated without local-only assumptions
- [ ] **DEP-05**: Auth, sync, and operator handoff behavior are obvious enough that the product can be shown as a working system, not a shell
- [ ] **DATA-01**: The app explains which data powers queue state, revenue state, timelines, integrations, and proof artifacts

## v2 Requirements

Deferred to a later release. Tracked, but not in the current roadmap.

### Advanced Operator Controls

- **ADV-01**: Role-specific views for operator, manager, and admin
- **ADV-02**: More advanced automated routing rules and branching logic
- **ADV-03**: A richer internal tool factory with templates for additional operator workflows

## Out of Scope

Explicitly excluded from this milestone.

| Feature | Reason |
|---------|--------|
| Real Instagram authentication and production ManyChat integration | Not required to prove the operating system and would slow iteration |
| Full GHL, ManyChat, or Meta platform parity | The product should orchestrate work, not clone vendor UIs |
| Consumer-facing marketing site work | The repo is for internal operator use, not lead acquisition |
| Multi-tenant SaaS billing and account management | Outside the current internal-tool focus |
| New core funnel business logic unrelated to interview proof | The current operator system already covers the business path |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| NARR-01 | Phase 6 | Pending |
| NARR-02 | Phase 6 | Pending |
| NARR-03 | Phase 6 | Pending |
| INTG-01 | Phase 7 | Pending |
| INTG-02 | Phase 7 | Pending |
| INTG-03 | Phase 7 | Pending |
| SIM-01 | Phase 8 | Pending |
| SIM-02 | Phase 8 | Pending |
| BRAND-01 | Phase 9 | Pending |
| BRAND-02 | Phase 9 | Pending |
| DEP-04 | Phase 10 | Pending |
| DEP-05 | Phase 10 | Pending |
| DATA-01 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after v2.0 milestone start*
