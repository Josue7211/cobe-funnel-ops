# Creator Funnel Ops

`creator-funnel-ops` is a compact operator console for creator funnel ops: lead capture to checkout, call recovery, and revenue visibility.

Live demo:
- [GitHub Pages](https://josue7211.github.io/cobe-funnel-ops/)
- [GitHub repo](https://github.com/Josue7211/cobe-funnel-ops)

It demonstrates three connected modules in one operator-facing app:

- `DM Sprint Funnel` — a ManyChat-style inbox simulator for lead intake, intent routing, tagging, and checkout handoff
- `No-Show Recovery` — a GHL-style booking and recovery workflow with owner routing and follow-up states
- `Revenue Dashboard` — KPI tracking, Stripe-style payment outcomes, and Meta CAPI-ready server event naming

It also includes operator surfaces for:

- `Rule Lab` — editable automation logic with per-rule tests
- `Connector Lab` — Zapier, Make, Stripe, GHL, Slack, and Google Sheets-style relay cards
- `Operator Audit` — searchable execution history for webhook, rule, connector, and note actions

The app also includes guided operator scenarios and a live simulator layer so the demo can be driven like a real workflow:

- hot DM to checkout
- booked call to no-show recovery
- payment to onboarding autopilot

## Use case

For teams running creator funnels, the same problems repeat: high-intent DMs, leaky call attendance, and unclear revenue visibility. This console keeps the operator view in one place: DM intent, recovery state, outbound relay, and tracking audit trails.

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

## Differentiation

- Purpose-built for creator funnel ops instead of a generic CRM or chatbot clone.
- Operator-first: workflow steps, audit trails, and relay checkpoints are visible.
- Built to explain and debug automations, not just run them.

## Demo framing

The app is intentionally scoped as one repo with one shared state model so the story is coherent:

1. lead comes in through DM
2. system tags and qualifies
3. checkout or consult flow branches
4. no-show recovery fires if needed
5. revenue and tracking stay visible
