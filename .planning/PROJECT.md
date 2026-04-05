# Creator Funnel Ops

## Current State

v1.0 is shipped and archived. The first-90-days COBE operator system now covers DM intake to checkout, consult routing and no-show recovery, onboarding handoff, daily revenue visibility, and internal tools in one live console.

The archived milestone details live in [`.planning/milestones/v1.0-ROADMAP.md`](./milestones/v1.0-ROADMAP.md) and [`.planning/milestones/v1.0-REQUIREMENTS.md`](./milestones/v1.0-REQUIREMENTS.md).

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

### Next Milestone Goals

- [ ] Ship a single deployable live system where the operator UI and API work together outside localhost
- [ ] Replace remaining demo/fallback behavior with explicit live-mode product flows and authenticated operator actions
- [ ] Harden sync, auth, and testing so the system is safe to use as a real internal ops surface
- [ ] Raise the frontend to a coherent operator product that supports daily use instead of a stitched demo shell

### Out of Scope

- Real Instagram authentication and production ManyChat integration
- Full GHL, ManyChat, or Meta platform parity
- Consumer-facing marketing site work
- Multi-tenant SaaS packaging

## Context

- The repo already contains a working brownfield stack: React 19, TypeScript, Vite 8, Express 5, SQLite via `node:sqlite`, optional Supabase mirror sync, and SSE realtime updates.
- Core business workflows from the target job post are already represented in code: DM qualification, Stripe handoff, no-show recovery, onboarding provisioning, reporting, Slack/Sheets-style exports, and Meta CAPI-ready payload handling.
- The dominant architectural pattern is a thin client with a single Express API and a large SQLite-backed domain layer in `server/sqlStore.js`.
- The biggest current risks for the next milestone are deployment split-brain, auth/client drift, broad frontend fallback behavior, and limited automated verification in CI.
- Codebase map is available under `.planning/codebase/` and should be treated as the source of truth for stack, structure, conventions, testing, integrations, and concerns during planning.

## Constraints

- **Tech stack**: Keep React + Express + SQLite + optional Supabase mirror.
- **Brownfield**: Plan around existing architecture and dirty worktree reality.
- **Deployment**: Static-only hosting is insufficient for the current product.
- **Security**: Admin auth and remote sync must be made explicit before enabling real operator usage.
- **Verification**: Existing smoke tests must remain passing while expanding coverage.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Keep one operator product instead of splitting DM/recovery/reporting into separate apps | The domain workflow is one operational path, and shared state is already implemented | ✓ Good |
| Treat SQLite as local execution store with optional Supabase mirror instead of rewriting to remote-primary immediately | Preserves a working product while still enabling remote persistence and collaboration | ✓ Good |
| Initialize GSD as a brownfield project after codebase mapping | Existing code and runtime behavior are substantial enough that planning should start from reality, not blank templates | ✓ Good |
| Make deployment contract, auth contract, and live-mode integrity the first roadmap priority | Those were the main blockers preventing the current codebase from being a trustworthy internal tool | ✓ Good |
| Reframe the first milestone around the COBE first-90-days job post | It made the delivered product directly interview-relevant and measurable | ✓ Good |

---
*Last updated: 2026-04-05 after v1.0 milestone archive*
