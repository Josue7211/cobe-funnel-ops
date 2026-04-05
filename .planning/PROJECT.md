# Creator Funnel Ops

## Current State

v1.0 is shipped and archived. The first-90-days COBE operator system now covers DM intake to checkout, consult routing and no-show recovery, onboarding handoff, daily revenue visibility, and internal tools in one live console.

The archived milestone details live in [`.planning/milestones/v1.0-ROADMAP.md`](./milestones/v1.0-ROADMAP.md) and [`.planning/milestones/v1.0-REQUIREMENTS.md`](./milestones/v1.0-REQUIREMENTS.md).

## Current Milestone: v2.0 Interview Operating System

**Goal:** Make the shipped operator console unmistakably credible in interviews by adding guided demo mode, richer integration proof, replayable failure scenarios, stronger branding, and deployment/handoff clarity.

**Target features:**
- One-click interview mode that loads a curated, high-signal demo state
- A guided walkthrough that maps the job-post skills directly to live screens and workflows
- A proof and replay layer for integrations, scenarios, and failures so the system explains itself
- Stronger presentation, branding, and deployment proof so the product feels interview-ready and durable

## What This Is

Creator Funnel Ops is a brownfield React/Express operator console for creator funnel teams. It combines DM intake, checkout handoff, consult-call recovery, onboarding autopilot, and revenue visibility into one internal surface.

## Core Value

An operator can move a lead from DM to payment, recovery, and onboarding from one trustworthy console without losing state or visibility.

## Requirements

### Validated

- ✓ SQL-backed funnel state exists for leads, bookings, conversations, messages, deliveries, audit events, live tests, and onboarding runs
- ✓ Real workflow endpoints exist for DM intake, Stripe payment, booking updates, and onboarding provisioning
- ✓ Queue, reports, lead timeline, realtime SSE, and Supabase mirror sync exist behind the Express API
- ✓ Local operator development works with `npm run dev`, `npm run test:backend`, `npm run test:http`, `npm run lint`, and `npm run build`
- ✓ v1.0 first-90-days COBE operating system shipped: DM sprint funnel, consult routing, onboarding autopilot, revenue command center, and internal tools

### Active

- [ ] Interview mode can present a curated high-signal demo state in one click
- [ ] The app can guide an interviewer through the exact skills and outcomes from the job post
- [ ] Integration evidence for GHL, Meta CAPI, Zapier/Make, ManyChat, Apify, Kajabi, Skool, and Discord is visible, replayable, and believable
- [ ] The system can replay realistic success and failure scenarios across DM, booking, onboarding, sync, and connector flows
- [ ] The visual system feels like a premium internal operations tool with real brand assets and a coherent full-width layout
- [ ] Deployment, auth, and handoff proof are obvious enough that the app can be shown as a working product, not just a demo shell

### Out of Scope

- Real Instagram authentication and production ManyChat integration — not required to prove the operating system and would slow iteration
- Full GHL, ManyChat, or Meta platform parity — the product should orchestrate work, not clone vendor UIs
- Consumer-facing marketing site work — the repo is for internal operator use, not lead acquisition
- Multi-tenant SaaS billing and account management — outside the current internal-tool focus
- New core funnel business logic unrelated to interview proof — the current operator system already covers the business path

## Context

- The repo already contains a working brownfield stack: React 19, TypeScript, Vite 8, Express 5, SQLite via `node:sqlite`, optional Supabase mirror sync, and SSE realtime updates.
- Core business workflows from the target job post are already represented in code: DM qualification, Stripe handoff, no-show recovery, onboarding provisioning, reporting, Slack/Sheets-style exports, and Meta CAPI-ready payload handling.
- The dominant architectural pattern is a thin client with a single Express API and a large SQLite-backed domain layer in `server/sqlStore.js`.
- The biggest current risks for this milestone are presentation drift, weak interview narrative, lack of obvious proof for integrations, and too much hidden credibility behind the scenes.
- Codebase map is available under `.planning/codebase/` and should be treated as the source of truth for stack, structure, conventions, testing, integrations, and concerns during planning.

## Constraints

- **Tech stack**: Keep React + Express + SQLite + optional Supabase mirror.
- **Brownfield**: Plan around existing architecture and dirty worktree reality.
- **Deployment**: The product must still work as one real runtime, not split-brain static hosting.
- **Security**: Admin auth and remote sync must remain explicit before enabling real operator usage.
- **Verification**: Existing smoke tests must remain passing while expanding coverage.
- **Interview utility**: Every new screen or flow should increase demo clarity or product credibility.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep one operator product instead of splitting DM/recovery/reporting into separate apps | The domain workflow is one operational path, and shared state is already implemented | ✓ Good |
| Treat SQLite as local execution store with optional Supabase mirror instead of rewriting to remote-primary immediately | Preserves a working product while still enabling remote persistence and collaboration | ✓ Good |
| Initialize GSD as a brownfield project after codebase mapping | Existing code and runtime behavior are substantial enough that planning should start from reality, not blank templates | ✓ Good |
| Make deployment contract, auth contract, and live-mode integrity the first roadmap priority | Those were the main blockers preventing the current codebase from being a trustworthy internal tool | ✓ Good |
| Reframe the first milestone around the COBE first-90-days job post | It made the delivered product directly interview-relevant and measurable | ✓ Good |
| Move v2 scope toward interview proof, guided narrative, and credibility layers | The app already works; the next step is making that work obvious and memorable | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? Move to Out of Scope with reason
2. Requirements validated? Move to Validated with phase reference
3. New requirements emerged? Add to Active
4. Decisions to log? Add to Key Decisions
5. "What This Is" still accurate? Update if drifted

**After each milestone**:
1. Full review of all sections
2. Core Value check
3. Audit Out of Scope
4. Update Context with current state

---
*Last updated: 2026-04-05 after v2.0 milestone start*
