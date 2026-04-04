# Creator Funnel Ops

`creator-funnel-ops` is a lightweight interview build tailored to the posted `Vibe Coder / Marketing Automation Engineer (AI + No-Code)` role.

It demonstrates three connected modules in one operator-facing app:

- `DM Sprint Funnel` — a ManyChat-style inbox simulator for lead intake, intent routing, tagging, and checkout handoff
- `No-Show Recovery` — a GHL-style booking and recovery workflow with owner routing and follow-up states
- `Revenue Dashboard` — KPI tracking, Stripe-style payment outcomes, and Meta CAPI-ready server event naming

## Why this exists

The job post asked for proof of:

- ManyChat-to-Stripe DM funnel thinking
- call routing and no-show recovery
- daily revenue dashboards
- clean tracking and naming standards
- lightweight internal tools that save time and make money

This repo is a compact vertical slice of that exact workflow.

## Stack

- React
- TypeScript
- Vite

No paid services are required for the demo. ManyChat, GHL, Zapier/Make, and Meta CAPI are represented as operator-friendly mirrors so the logic stays visible and cheap to demo.

## Local development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Repo docs

- [PROJECT.md](./PROJECT.md)
- [ROADMAP.md](./ROADMAP.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/DEMO_FLOW.md](./docs/DEMO_FLOW.md)
- [docs/SOP.md](./docs/SOP.md)

## Demo framing

The app is intentionally scoped as one repo with one shared state model so the story is coherent:

1. lead comes in through DM
2. system tags and qualifies
3. checkout or consult flow branches
4. no-show recovery fires if needed
5. revenue and tracking stay visible
