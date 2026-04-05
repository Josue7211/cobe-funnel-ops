# Roadmap: COBE Interview Operating System

## Overview

This milestone turns the shipped COBE operator console into an interview-grade product. The job of v2 is not to rebuild the core system; v2 makes the existing system easier to explain, easier to trust, and harder to dismiss as a demo.

The roadmap focuses on one thing: when someone watches the product for the first time, they should immediately understand the workflow, the integrations, the resilience, and why the operator would be hireable.

## Phases

**Phase Numbering:**
- Integer phases continue from the archived milestone: 6, 7, 8, 9, 10

- [ ] **Phase 6: Interview Mode And Guided Narrative** - Add one-click curated demo state, guided skill walkthroughs, and proof-pack generation
- [ ] **Phase 7: Integration Evidence Center** - Expose the real connector story: payloads, retries, health, replay, and live evidence
- [ ] **Phase 8: Scenario Simulator And Replay Lab** - Make the product replayable so success paths and failure branches can be shown on demand
- [ ] **Phase 9: Brand And Presentation Upgrade** - Rebuild the presentation layer so the console feels premium, consistent, and interview-ready
- [ ] **Phase 10: Deployment, Hand-off, And Credibility Hardening** - Make deployment, auth, data transparency, and operator handoff obvious and trustworthy

## Phase Details

### Phase 6: Interview Mode And Guided Narrative
**Goal**: Give the app a one-click interview mode and a guided tour that maps the job post to the product.
**Depends on**: v1.0 shipped console
**Requirements**: [NARR-01, NARR-02, NARR-03]
**Success Criteria** (what must be TRUE):
  1. The app can open directly into a curated, high-signal state without manual setup.
  2. The app can narrate its own value by connecting visible UI sections to the interview requirements.
  3. A proof pack can be generated from live state after the walkthrough.
**Plans**: 3 plans

Plans:
- [ ] 06-01: Add an interview-mode bootstrap that selects a high-signal lead, queue, and report state
- [ ] 06-02: Build a guided walkthrough that maps the job post skills to the app surfaces
- [ ] 06-03: Add a proof-pack export that summarizes the live demo state for follow-up

### Phase 7: Integration Evidence Center
**Goal**: Make the app’s integrations impossible to hand-wave away by surfacing real connector evidence.
**Depends on**: Phase 6
**Requirements**: [INTG-01, INTG-02, INTG-03]
**Success Criteria** (what must be TRUE):
  1. GHL, Meta CAPI, Zapier/Make, ManyChat, Apify, Kajabi, Skool, and Discord are visible as working evidence, not just labels.
  2. Connector payloads, retries, and health can be inspected in the console.
  3. Replay data and event naming are understandable without opening server logs.
**Plans**: 4 plans

Plans:
- [ ] 07-01: Build an integration evidence view for every named job-post connector
- [ ] 07-02: Add connector payload history and retry inspection surfaces
- [ ] 07-03: Surface event naming, webhook proof, and replay detail in the operator console
- [ ] 07-04: Add health summaries that explain which integrations are healthy, degraded, or retrying

### Phase 8: Scenario Simulator And Replay Lab
**Goal**: Let the product replay realistic success and failure branches across the full workflow.
**Depends on**: Phase 7
**Requirements**: [SIM-01, SIM-02]
**Success Criteria** (what must be TRUE):
  1. The console can replay a full lead journey from DM to onboarding with different branches.
  2. Common failure states are visible and actionable instead of buried in logs.
**Plans**: 3 plans

Plans:
- [ ] 08-01: Add scenario replay controls for the main lead journeys
- [ ] 08-02: Add failure-state simulations for webhook, sync, and onboarding exceptions
- [ ] 08-03: Build a replay and triage flow that shows what happened, what failed, and what to do next

### Phase 9: Brand And Presentation Upgrade
**Goal**: Make the console feel like a deliberate premium internal tool instead of a set of dashboard boxes.
**Depends on**: Phase 8
**Requirements**: [BRAND-01, BRAND-02]
**Success Criteria** (what must be TRUE):
  1. The layout reads as full-width, intentional, and interview-ready.
  2. The visual system uses real COBE brand assets consistently.
  3. The page hierarchy stays coherent across the major operator surfaces.
**Plans**: 4 plans

Plans:
- [ ] 09-01: Refresh the full-width layout and page hierarchy around the best-performing console sections
- [ ] 09-02: Replace weak or inconsistent branding with the real COBE brand assets
- [ ] 09-03: Unify typography, spacing, motion, and card treatments across the product
- [ ] 09-04: Tune the presentation so the product is visually strong in a live walkthrough

### Phase 10: Deployment, Hand-off, And Credibility Hardening
**Goal**: Make the system obviously deployable, transparent, and trustworthy enough to hand off.
**Depends on**: Phase 9
**Requirements**: [DEP-04, DEP-05, DATA-01]
**Success Criteria** (what must be TRUE):
  1. The deployment story is clear and repeatable.
  2. The app explains what data powers the queue, revenue, timeline, integrations, and proof layers.
  3. The console is easy to hand off because auth, sync, and operator behavior are obvious.
**Plans**: 4 plans

Plans:
- [ ] 10-01: Document and reinforce the primary deploy/runtime story for the app
- [ ] 10-02: Add data transparency panels that explain what powers each major surface
- [ ] 10-03: Clarify auth, sync, and operator handoff behavior inside the product
- [ ] 10-04: Add regression coverage for the new interview-mode, evidence, and replay surfaces

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. Interview Mode And Guided Narrative | 0/3 | Not started | - |
| 7. Integration Evidence Center | 0/4 | Not started | - |
| 8. Scenario Simulator And Replay Lab | 0/3 | Not started | - |
| 9. Brand And Presentation Upgrade | 0/4 | Not started | - |
| 10. Deployment, Hand-off, And Credibility Hardening | 0/4 | Not started | - |
