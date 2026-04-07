# memd memory

This file is maintained by `memd` for agents that do not have built-in durable memory.

## Project bootstrap

# memd project bootstrap

This bundle was initialized from the existing project context at `/home/josue/Documents/projects/cobe-funnel-ops`.

## Loaded sources

- README.md
- ROADMAP.md
- .planning/STATE.md
- .planning/PROJECT.md
- .planning/ROADMAP.md
- .planning/codebase/ARCHITECTURE.md
- .planning/codebase/STRUCTURE.md

## Imported summaries

### README.md

# Creator Funnel Ops
`creator-funnel-ops` is a compact operator console for creator funnel ops: lead capture to checkout, call recovery, and revenue visibility.
Supported runtime contract:
- one Node-capable deployment
- one same-origin browser entrypoint
- Express serves the built app shell and `/api/*`
- the authenticated console uses the same origin for login, queue reads, workflow mutations, reports, and realtime
It ships three connected modules in one operator-facing app:
- `DM Sprint Funnel` — a ManyChat-style inbox simulator for lead intake, intent routing, tagging, and checkout handoff
- `No-Show Recovery` — a GHL-style booking and recovery workflow with owner routing and follow-up states
- `Revenue Dashboard` — KPI tracking, Stripe-style payment outcomes, and Meta CAPI-ready server event naming
It also includes operator surfaces for:
- `Rule Lab` — editable automation logic with per-rule tests
- `Connector Lab` — Zapier, Make, Stripe, GHL, Slack, and Google Sheets-style relay cards
- `Operator Audit` — searchable execution history for webhook, rule, connector, and note actions
- `Live Test Runs` — SQL-backed scenario tests that validate payloads and record relay outcomes
The system supports common operator paths:
- hot DM to checkout
- booked call to no-show recovery
- payment to onboarding autopilot
## Use case
For teams running creator funnels, the same problems repeat: high-intent DMs, leaky call attendance, and unclear revenue visibility. This console keeps the operator view in one place: DM intent, recovery state, outbound relay, and tracking audit trails.
## Stack
- React

### ROADMAP.md

# Roadmap
## Phase 1
Scaffold repo and replace starter app with a creator-ops shell.
Status: complete
## Phase 2
Implement the three product modules:
- DM sprint funnel
- no-show recovery
- revenue dashboard
Status: in progress
## Phase 3
Add operator docs:
- architecture
- SOP
- week-one plan
Status: in progress
## Phase 4
Polish for application:
- tighten copy
- verify build
- prepare Loom talking points
Status: pending

### .planning/STATE.md

---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Integration Operating Graph
status: planning
stopped_at: Created v3 roadmap for deeper integration-driven product behavior
last_updated: "2026-04-05T23:58:00.000Z"
last_activity: 2026-04-05
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 31
  completed_plans: 0
  percent: 0
---
# Project State
## Project Reference
See: .planning/PROJECT.md (updated 2026-04-05)
**Core value:** An operator can move a lead from DM to payment, recovery, and onboarding from one trustworthy console without losing state or visibility.
**Current focus:** Phase 11 - Integration inbox and event contract
## Current Position
Phase: 11 - Integration Inbox And Event Contract
Plan: —
Status: v3 milestone defined; planning not started

### .planning/PROJECT.md

# Creator Funnel Ops
## Current State
v1.0 is shipped and archived. The first-90-days COBE operator system now covers DM intake to checkout, consult routing and no-show recovery, onboarding handoff, daily revenue visibility, and internal tools in one live console.
The archived milestone details live in [`.planning/milestones/v1.0-ROADMAP.md`](./milestones/v1.0-ROADMAP.md) and [`.planning/milestones/v1.0-REQUIREMENTS.md`](./milestones/v1.0-REQUIREMENTS.md).
## Current Milestone: v3.0 Integration Operating Graph
**Goal:** Make integrations drive the product instead of sitting beside it by turning inbound events, orchestration runs, pipeline transitions, alerts, and enrichment into first-class operator state.
**Target features:**
- One shared integration inbox and event contract for inbound connector activity
- A real per-lead lifecycle graph spanning Instagram DM, ManyChat, Zapier/Make, GHL, Stripe, onboarding, Slack, Discord, and Apify
- A run inspector that proves orchestration logic, retries, and downstream effects
- Deeper alerting, enrichment, and failure-triage layers so the app behaves like an operating system instead of a proof wall
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
- ✓ Interview mode can present a curated high-signal demo state in one click
- ✓ The app can guide an interviewer through the exact skills and outcomes from the job post

### .planning/ROADMAP.md

# Roadmap: COBE Integration Operating Graph
## Overview
This milestone turns the console from an interview-proof dashboard into a system where integrations actively drive the product. The goal is not to add more connector logos. The goal is to make Instagram DM, ManyChat, Zapier, Make, GHL, Stripe, Discord, Slack, and Apify behave like real sources of state, routing, enrichment, escalation, and revenue movement inside the app.
The milestone focuses on one thing: when someone clicks a lead, they should be able to see which integrations touched it, what each one did, what failed, what retried, and what the operator should do next.
## Phases
**Phase Numbering:**
- Integer phases continue from the previous milestone: 11, 12, 13, 14, 15, 16, 17, 18
- [ ] **Phase 11: Integration Inbox And Event Contract** - Turn integrations into first-class inbound events with one shared event model
- [ ] **Phase 12: Lead Lifecycle Graph** - Show the full integration-driven lead journey from DM to onboarding
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

### .planning/codebase/ARCHITECTURE.md

# Architecture
**Analysis Date:** 2026-04-04
## Pattern Overview
**Overall:** Thin React client + single Express API + SQLite-backed state engine.
**Key Characteristics:**
- `src/` is a client-only dashboard that renders the operator UI, calls HTTP endpoints in `server/index.js`, and subscribes to server-sent events from `/api/realtime/stream`.
- `server/index.js` is the only runtime boundary for backend concerns: auth, API routing, sync endpoints, exports, and realtime fan-out.
- `server/sqlStore.js` is the real domain layer. It owns persistence, seed/bootstrap behavior, queue scoring, workflow simulation, timeline assembly, and snapshot mutation.
## Layers
**Client UI:**
- Purpose: Render the ops dashboard and keep local UI state in sync with backend snapshots.
- Location: `src/App.tsx`, `src/main.tsx`, `src/api.ts`, `src/types.ts`, `src/data.ts`
- Contains: React state, derived view models, fallback demo data, fetch wrappers, SSE refresh logic.
- Depends on: Browser `fetch`, `EventSource`, `/api/*` routes exposed by `server/index.js`.
- Used by: The browser runtime started from `src/main.tsx`.
**HTTP API Layer:**
- Purpose: Expose read and mutation endpoints and translate requests into store operations.
- Location: `server/index.js`
- Contains: Express app setup, auth/session checks, query filtering, sync/reconcile endpoints, export endpoints, SSE endpoint.
- Depends on: `server/store.js`, `server/supabaseSync.js`, `server/authSession.js`, `server/realtimeBus.js`.
- Used by: The Vite frontend during development via the proxy in `vite.config.ts`, and any direct HTTP client.
**Domain and Persistence Layer:**
- Purpose: Persist state, derive queue/report views, and execute funnel workflows.
- Location: `server/sqlStore.js`, `server/schema.sql`, `server/seed.js`, `server/data/runtime.sqlite`

### .planning/codebase/STRUCTURE.md

# Codebase Structure
**Analysis Date:** 2026-04-04
## Directory Layout
```text
cobe-funnel-ops/
├── src/                 # React client app and browser-only state
├── server/              # Express API, SQLite store, sync logic, and scripts
├── public/              # Static assets copied by Vite
├── docs/                # Product/process docs outside the runtime path
├── .github/workflows/   # CI workflow
├── dist/                # Built frontend output
└── .planning/codebase/  # Generated codebase mapping docs
```
## Directory Purposes
**`src/`:**
- Purpose: Client application code.
- Contains: `App.tsx` dashboard logic, `api.ts` fetch helpers, `types.ts`, fallback `data.ts`, CSS, and image assets in `src/assets/`.
- Key files: `src/App.tsx`, `src/api.ts`, `src/main.tsx`, `src/types.ts`
**`server/`:**
- Purpose: Backend runtime and persistence.
- Contains: Express entrypoint, SQLite-backed store, sync/auth/realtime helpers, schema/seed files, and smoke scripts.
- Key files: `server/index.js`, `server/sqlStore.js`, `server/store.js`, `server/supabaseSync.js`, `server/realtimeBus.js`, `server/authSession.js`, `server/schema.sql`, `server/seed.js`
**`server/data/`:**
- Purpose: Local runtime database storage.

## Notes

- project: `cobe-funnel-ops`
- init agent: `codex`
- bootstrap mode: `seed_existing`
- Add a separate import command if you need a deeper file sweep or more context than the default bootstrap budget.

Refresh it with:

- `memd resume --output /home/josue/Documents/projects/cobe-funnel-ops/.memd --intent current_task`
- `memd resume --output /home/josue/Documents/projects/cobe-funnel-ops/.memd --intent current_task --semantic`
- `memd handoff --output /home/josue/Documents/projects/cobe-funnel-ops/.memd`
- `memd handoff --output /home/josue/Documents/projects/cobe-funnel-ops/.memd --semantic`

## Bundle Defaults

- project: cobe-funnel-ops
- namespace: main
- agent: codex
- workspace: none
- visibility: all
- route: auto
- intent: current_task
- heartbeat_model: llama-desktop/qwen
- auto_short_term_capture: true

## Notes

- `resume` keeps the active working memory fresh on the fast local hot path.
- `handoff` adds shared workspace, source-lane, and delegation state.
- automatic short-term capture runs on compaction spill boundaries unless disabled in the bundle env/config.
- add `--semantic` only when you want slower deep recall from the semantic backend.
- future dream/consolidation output should flow back into this same memory surface.
