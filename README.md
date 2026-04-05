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
- TypeScript
- Vite
- Express
- SQLite (`node:sqlite`)

No paid services are required to run it locally. ManyChat, GHL, Zapier/Make, and Meta CAPI are represented as operator-friendly mirrors so the logic stays visible and cheap to run, while the backend persists live state in SQLite.

## Run it

- Frontend + API dev runtime: `npm run dev`
- Production-like same-origin runtime: `npm run build && npm start`
- Reset SQL data: `npm run reset:data`

## Local development

- Use Node 22+ so the built-in `node:sqlite` module is available.

```bash
npm install
npm run dev
```

`npm run dev` starts:
- Vite on the frontend for local development only
- Express on the API runtime
- a local dev proxy for `/api/*`

That proxy is not the deployment contract. It only exists to make local iteration convenient.

Build:

```bash
npm run build
```

Run the same-origin server after building:

```bash
npm start
```

In the supported topology, Express serves:
- the built SPA from `dist/`
- authenticated API routes at `/api/*`
- realtime at `/api/realtime/stream`

Static-only hosting is not a supported live product path for Phase 1 because the operator console depends on the same-origin backend runtime.

## Deployment

Phase 1 supports one honest deployment topology:

1. Build the frontend with `npm run build`
2. Run `node server/index.js` on a Node-capable host
3. Serve the built `dist/` assets and `/api/*` from the same origin

Equivalent reverse-proxy setups are fine if the browser still sees one origin for the app shell and API.

Required behavior for a supported deployment:
- `/` returns the built operator console
- `/api/auth/session` checks the current admin session
- `/api/queue`, `/api/reports/overview`, workflow mutations, and realtime all resolve on that same origin

Not supported as the primary product path:
- GitHub Pages
- static-only Vercel/Netlify style hosting without the Express runtime
- split frontend/backend deployments that rely on an undocumented browser proxy

## Repo docs

- [PROJECT.md](./PROJECT.md)
- [ROADMAP.md](./ROADMAP.md)
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/SOP.md](./docs/SOP.md)

## Differentiation

- Purpose-built for creator funnel ops instead of a generic CRM or chatbot clone.
- Operator-first: workflow steps, audit trails, and relay checkpoints are visible.
- Built to explain and debug automations, not just run them.

## Workflow

The app is intentionally scoped as one repo with one shared state model so the workflow stays coherent:

1. lead comes in through DM
2. system tags and qualifies
3. checkout or consult flow branches
4. no-show recovery fires if needed
5. revenue and tracking stay visible
