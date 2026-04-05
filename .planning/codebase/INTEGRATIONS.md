# External Integrations

**Analysis Date:** 2026-04-04

## APIs & External Services

**Database sync / remote analytics:**
- Supabase REST API - optional remote snapshot storage and mirror-table sync for local SQLite state
  - SDK/Client: native `fetch` in `server/supabaseSync.js`
  - Auth: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STATE_TABLE`
  - Surface: `/api/sync/status`, `/api/sync/push`, `/api/sync/pull`, `/api/sync/reconcile`, `/api/remote/leads`, and `/api/remote/deliveries` in `server/index.js`

**Notifications / exports:**
- Slack incoming webhook - sends a formatted ops summary built by `/api/exports/slack` and posted by `/api/exports/slack/send` in `server/index.js`
  - SDK/Client: native `fetch`
  - Auth: `SLACK_WEBHOOK_URL`
- Google Sheets-style webhook relay - posts metrics and queue rows from `/api/exports/sheets/send` in `server/index.js`
  - SDK/Client: native `fetch`
  - Auth: `GOOGLE_SHEETS_WEBHOOK_URL`

**Operator-facing simulated connectors:**
- ManyChat, Zapier, Make, Stripe, GHL, Slack, Google Sheets, and Meta CAPI appear as workflow concepts and UI surfaces in `README.md`, `src/data.ts`, and queue/report logic in `server/sqlStore.js`
  - SDK/Client: none detected
  - Auth: not applicable
  - Implementation: modeled state and relay simulation, not vendor SDK integrations

## Data Storage

**Databases:**
- SQLite via `DatabaseSync`
  - Connection: local file `server/data/runtime.sqlite`
  - Client: built-in `node:sqlite` in `server/sqlStore.js`
- Supabase Postgres mirror tables
  - Connection: `SUPABASE_URL`
  - Client: direct REST calls in `server/supabaseSync.js`
  - Schema: `server/remote-schema.sql`

**File Storage:**
- Local filesystem only
  - SQLite file and seeded assets live inside the repo at `server/data/` and `src/assets/`

**Caching:**
- None detected

## Authentication & Identity

**Auth Provider:**
- Custom admin auth
  - Implementation: username/password login in `server/authSession.js`, HMAC-signed session tokens, optional static `ADMIN_API_TOKEN` gate in `server/index.js`
  - Endpoints: `/api/auth/login` and `/api/auth/session` in `server/index.js`

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Process stdout/stderr only from `server/index.js`
- Operational audit history is stored as application data in SQLite tables defined in `server/schema.sql`
- Live UI refresh uses SSE events emitted from `server/realtimeBus.js` and consumed in `src/App.tsx`

## CI/CD & Deployment

**Hosting:**
- Static frontend hosting is compatible with Vite build output in `dist/`
- A linked Vercel project exists in `.vercel/project.json`
- README also references a GitHub Pages demo in `README.md`

**CI Pipeline:**
- GitHub Actions workflow in `.github/workflows/ci.yml`
  - Installs with `npm ci`
  - Runs `npm run lint`
  - Runs `npm run build`

## Environment Configuration

**Required env vars:**
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `ADMIN_SESSION_TTL_SECONDS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STATE_TABLE`
- `SLACK_WEBHOOK_URL`
- `GOOGLE_SHEETS_WEBHOOK_URL`
- `ADMIN_API_TOKEN`
- `PORT`
- `REMOTE_SYNC_POLL_MS`

**Secrets location:**
- `.env.example` documents expected variables
- `.env.local` is read by `server/supabaseSync.js` when present
- Linked Vercel project metadata exists under `.vercel/`, but runtime secret values are not committed as part of these docs

## Webhooks & Callbacks

**Incoming:**
- None detected for third-party callbacks; the app exposes internal workflow endpoints such as `/api/workflows/dm-intake`, `/api/workflows/stripe-payment`, and `/api/workflows/booking-update` in `server/index.js`

**Outgoing:**
- Slack webhook POST from `/api/exports/slack/send` in `server/index.js`
- Google Sheets relay webhook POST from `/api/exports/sheets/send` in `server/index.js`
- Supabase REST writes from `server/supabaseSync.js`

---

*Integration audit: 2026-04-04*
