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
- Contains: `runtime.sqlite`.
- Key files: `server/data/runtime.sqlite`

**`public/`:**
- Purpose: Static files served by Vite without import processing.
- Contains: SVG assets.
- Key files: `public/favicon.svg`, `public/icons.svg`

**`docs/`:**
- Purpose: Human documentation for architecture, demos, and SOPs.
- Contains: Markdown reference docs, not imported by runtime code.
- Key files: `docs/ARCHITECTURE.md`, `docs/DEMO_FLOW.md`, `docs/SOP.md`

## Key File Locations

**Entry Points:**
- `src/main.tsx`: Browser entrypoint that mounts the React app.
- `server/index.js`: API server entrypoint used by `npm run dev:api`.

**Configuration:**
- `package.json`: Scripts for dev, build, lint, reset, and backend smoke tests.
- `vite.config.ts`: React plugin setup plus `/api` proxy to `http://localhost:8787`.
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`: TypeScript project configuration.
- `eslint.config.js`: Lint rules.
- `.github/workflows/ci.yml` pattern under `.github/workflows/`: CI runs install, lint, and build.

**Core Logic:**
- `src/App.tsx`: Main client runtime, UI state, bootstrap fetches, and SSE refresh handling.
- `src/api.ts`: Typed HTTP helper layer for all client-to-server calls.
- `server/sqlStore.js`: Core backend logic, SQLite persistence, derived reads, and workflow mutations.
- `server/supabaseSync.js`: Remote snapshot/mirror sync implementation.

**Testing and Verification:**
- `server/smoke.mjs`: Store-level smoke tests.
- `server/http-smoke.mjs`: HTTP-level smoke tests against the running API.

## Naming Conventions

**Files:**
- Client React entry/components use PascalCase only for the top-level app file: `src/App.tsx`.
- Most modules use lower camel or descriptive lowercase filenames: `src/api.ts`, `server/sqlStore.js`, `server/realtimeBus.js`.
- Support scripts use suffixes that describe execution intent: `*.mjs`, `schema.sql`, `seed.js`.

**Directories:**
- Top-level directories are short lowercase nouns: `src`, `server`, `public`, `docs`.
- Backend data lives under a dedicated subdirectory: `server/data`.

## Where to Add New Code

**New client-facing feature:**
- Primary code: `src/App.tsx` if it belongs to the existing single-screen dashboard.
- Shared request helper: `src/api.ts` for any new backend call.
- Shared types: `src/types.ts` when the data shape is reused across client code.

**New backend read or mutation endpoint:**
- Route registration: `server/index.js`
- Business logic and persistence: `server/sqlStore.js`
- Re-export through: `server/store.js` so the API layer imports remain centralized.

**New workflow or automation path:**
- Implementation: `server/sqlStore.js`
- Side effects: keep audit entries, delivery queue inserts, and connector updates in the same transaction as the main mutation.

**New sync or external mirror behavior:**
- Supabase-specific code: `server/supabaseSync.js`
- HTTP controls/status route: `server/index.js`

**New static asset:**
- Imported by app code: `src/assets/`
- Served directly by Vite: `public/`

## Runtime Paths

**Frontend runtime path:**
1. `index.html` loads the Vite bundle.
2. `src/main.tsx` mounts `src/App.tsx`.
3. `src/App.tsx` calls `src/api.ts` helpers and subscribes to `/api/realtime/stream`.

**Backend runtime path:**
1. `server/index.js` starts Express on port `8787` by default.
2. Routes delegate to `server/store.js`, which forwards to `server/sqlStore.js`.
3. `server/sqlStore.js` reads/writes `server/data/runtime.sqlite`.
4. Successful mutations may call `server/supabaseSync.js` and `server/realtimeBus.js`.

## Special Directories

**`.planning/codebase/`:**
- Purpose: Generated reference docs for other GSD steps.
- Generated: Yes
- Committed: Intended to be committed

**`dist/`:**
- Purpose: Built frontend assets from `npm run build`.
- Generated: Yes
- Committed: Present in the repo at analysis time

**`.vercel/output/`:**
- Purpose: Deployment/build output artifacts.
- Generated: Yes
- Committed: Present in the repo at analysis time

**`.gstack/` and `.interface-design/`:**
- Purpose: Tooling/project workflow artifacts.
- Generated: Yes
- Committed: Present in the repo at analysis time

---

*Structure analysis: 2026-04-04*
