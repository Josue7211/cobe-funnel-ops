# Technology Stack

**Analysis Date:** 2026-04-04

## Languages

**Primary:**
- JavaScript (ES modules) - backend runtime and operational scripts in `server/index.js`, `server/sqlStore.js`, `server/supabaseSync.js`, `server/http-smoke.mjs`, and `server/smoke.mjs`
- TypeScript - frontend application code in `src/App.tsx`, `src/api.ts`, `src/types.ts`, and Vite config in `vite.config.ts`

**Secondary:**
- SQL - local schema in `server/schema.sql` and remote mirror schema in `server/remote-schema.sql`
- CSS - app styling in `src/App.css` and `src/index.css`

## Runtime

**Environment:**
- Node.js 22+ for local development because `node:sqlite` is used directly in `server/sqlStore.js`
- Node.js 24.x is configured in linked Vercel project metadata at `.vercel/project.json`

**Package Manager:**
- npm via `package.json`
- Lockfile: present in `package-lock.json`

## Frameworks

**Core:**
- React 19 in `src/main.tsx` and `src/App.tsx` for the single-page operator console
- Express 5 in `server/index.js` for the JSON API, workflow mutations, auth, export endpoints, sync endpoints, and SSE stream
- Vite 8 in `vite.config.ts` for frontend dev server, build, and `/api` proxying to `http://localhost:8787`

**Testing:**
- Node built-in assertions and direct script-based smoke tests in `server/smoke.mjs` and `server/http-smoke.mjs`

**Build/Dev:**
- TypeScript 5.9 project references in `tsconfig.json`, `tsconfig.app.json`, and `tsconfig.node.json`
- ESLint 9 flat config in `eslint.config.js`
- `concurrently` in `package.json` to run API and web dev servers together

## Key Dependencies

**Critical:**
- `react` / `react-dom` - UI runtime for the operator console in `src/main.tsx`
- `express` - backend routing layer in `server/index.js`
- `node:sqlite` - persistence layer via `DatabaseSync` in `server/sqlStore.js`
- `cors` - cross-origin support for the API in `server/index.js`

**Infrastructure:**
- `@vitejs/plugin-react` - React transform support in `vite.config.ts`
- `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` - lint stack in `eslint.config.js`
- `geist` - installed UI/brand font dependency declared in `package.json`

## Configuration

**Environment:**
- Optional remote sync and admin auth are configured through `.env.example`
- Required local/runtime vars currently surfaced by code are `PORT`, `REMOTE_SYNC_POLL_MS`, `ADMIN_API_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `ADMIN_SESSION_TTL_SECONDS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STATE_TABLE`, `SLACK_WEBHOOK_URL`, and `GOOGLE_SHEETS_WEBHOOK_URL` from `server/index.js`, `server/authSession.js`, and `server/supabaseSync.js`
- `server/supabaseSync.js` reads `.env.local` directly if present to hydrate `process.env`

**Build:**
- Frontend build is `tsc -b && vite build` from `package.json`
- Vite base is `./` in `vite.config.ts`, matching static asset hosting
- CI runs `npm ci`, `npm run lint`, and `npm run build` in `.github/workflows/ci.yml`

## Frontend/Backend Surface

**Frontend app:**
- The SPA is mounted in `src/main.tsx`
- `src/App.tsx` owns almost all UI state, loads `/api/bootstrap` and `/api/reports/overview`, and subscribes to `/api/realtime/stream` with `EventSource`
- `src/api.ts` is the typed fetch layer for queue, timeline, reports, workflow mutations, notes, tests, and connector actions

**Backend app:**
- `server/index.js` is the only HTTP entry point
- Domain operations are delegated through `server/store.js` into `server/sqlStore.js`
- Real-time updates are pushed through in-process SSE via `server/realtimeBus.js`

## Persistence

**Primary store:**
- SQLite on the local filesystem at `server/data/runtime.sqlite`, initialized from `server/schema.sql`
- The schema covers leads, bookings, conversations, messages, connector state, delivery queue, audit history, live tests, and onboarding runs

**Seed/reset behavior:**
- `server/seed.js` seeds the database through `server/sqlStore.js`
- `npm run reset:data` resets to seeded SQL-backed state through `package.json`

**Remote mirror:**
- Optional Supabase snapshot + table mirroring is implemented in `server/supabaseSync.js`
- Expected remote tables are defined in `server/remote-schema.sql`

## Platform Requirements

**Development:**
- Run `npm install` then `npm run dev` from `package.json`
- The frontend expects the Express API on port `8787` unless `PORT` overrides it in `server/index.js`

**Production:**
- Static frontend build output is produced by Vite in `dist/`
- Deployment surfaces detected:
  - Vercel link metadata in `.vercel/project.json`
  - GitHub Actions CI in `.github/workflows/ci.yml`
- The Express API is a separate Node process surface; no repo-native serverless adapter is present

---

*Stack analysis: 2026-04-04*
