# Coding Conventions

**Analysis Date:** 2026-04-04

## Naming Patterns

**Files:**
- Use lowercase file names with either plain words or camelCase by role: `src/api.ts`, `src/data.ts`, `src/types.ts`, `server/sqlStore.js`, `server/supabaseSync.js`, `server/authSession.js`.
- Use `PascalCase` only for the top-level React component file: `src/App.tsx`.
- Keep style sheets paired to entry/component names: `src/App.css`, `src/index.css`.

**Functions:**
- Use `camelCase` for functions in both frontend and backend: `parseMoneyValue` in `src/App.tsx`, `fetchQueue` in `src/api.ts`, `requireAdmin` in `server/index.js`, `readReports` in `server/sqlStore.js`.
- Prefer verb-first names for side effects and reads: `fetchBootstrap`, `runLiveTest`, `readLeadTimeline`, `pushRemoteSnapshot`, `verifyAdminSessionToken`.
- Reserve `handle*` naming for UI event handlers inside `src/App.tsx`; keep domain helpers as plain verbs.

**Variables:**
- Use `camelCase` for local variables and state: `defaultConnectorStates`, `reportsOverview`, `lastRemoteDigest`, `seedTimestampTotal`.
- Use `SCREAMING_SNAKE_CASE` only for process-wide constants: `STORAGE_KEY` in `src/App.tsx`.
- Use plural names for collections and singular names for records: `leadRecords` vs `lead`, `connectors` vs `connector`.

**Types:**
- Use `PascalCase` for TypeScript types and interfaces: `Lead`, `Conversation`, `ReportsOverview`, `WebhookValidation` in `src/types.ts`, `src/api.ts`, and `src/App.tsx`.
- Use string-literal unions for constrained domain states instead of enums: `FunnelStage` in `src/types.ts`, `DeliveryStatus` and `AuditKind` in `src/App.tsx`.
- Backend JavaScript does not declare runtime types; data shapes are implied by row mappers and returned objects in `server/sqlStore.js`.

## Code Style

**Formatting:**
- Formatting is driven by the existing Vite/TypeScript defaults plus consistent Prettier-like output. No dedicated Prettier or Biome config is present.
- Use single quotes, semicolons omitted, trailing commas in multiline objects/arrays, and 2-space indentation throughout `src/*.ts*` and `server/*.js`.
- Prefer early returns for guard clauses: `parseMoneyValue` in `src/App.tsx`, `requireAdmin` in `server/index.js`, `json` in `server/sqlStore.js`.
- Keep small pure helpers above component or route bodies, then place the main exported unit below them.

**Linting:**
- ESLint is configured only for `**/*.{ts,tsx}` in `eslint.config.js`; frontend TypeScript is linted, backend `.js` and `.mjs` files are not.
- The enforced rule set is `@eslint/js`, `typescript-eslint`, `react-hooks`, and `react-refresh` in `eslint.config.js`.
- `dist/` is globally ignored in `eslint.config.js`.

## Import Organization

**Order:**
1. External packages first: React, Express, Node built-ins, third-party libraries.
2. Relative local modules next: `./api`, `./types`, `./store.js`, `./supabaseSync.js`.
3. Styles last in React entry/component files: `import './App.css'`, `import './index.css'`.

**Path Aliases:**
- No path aliases are configured in `tsconfig.json` or `vite.config.ts`.
- Use relative imports only.

## Data Contracts

**Frontend contracts:**
- Define shared UI/domain types in `src/types.ts`.
- Define API-specific payload and response types near the fetch wrappers in `src/api.ts`.
- Prefer string-literal unions and explicit object shapes over broad records when the shape is known.

**Backend contracts:**
- Backend contracts are hand-maintained object shapes in `server/sqlStore.js` and route handlers in `server/index.js`.
- SQL rows are normalized into camelCase objects before returning them from store functions in `server/sqlStore.js`.
- JSON-serialized columns use `_json` storage names in SQLite and plain arrays/objects in JS, for example `tags_json` mapped to `tags` in `server/sqlStore.js`.

**Boundary rule:**
- There is no runtime schema validation library. Validation is ad hoc with string coercion, null checks, and custom guards such as `validateWebhookPayload` in `server/sqlStore.js` and request parsing in `server/index.js`.
- When adding fields, update both the TypeScript frontend type and the backend mapper/serializer path. There is no single source of truth enforcing this automatically.

## Error Handling

**Patterns:**
- Throw `Error` from frontend request helpers on non-2xx responses: `request` in `src/api.ts`.
- Return `{ ok: false, message }` style objects from backend workflow/store functions, then translate them to HTTP responses through `respondWithMutation` in `server/index.js`.
- Use `try`/`catch` only around true failure boundaries such as JSON parsing, remote fetches, and transaction wrappers.
- Use transactional rollback for multi-step writes with `withTransaction` in `server/sqlStore.js`.

## Logging

**Framework:** `console`

**Patterns:**
- Logging is minimal and operational. `console.log` and `console.error` appear in `server/index.js` for startup/failure and in smoke scripts for pass/fail output.
- Application behavior is tracked primarily through persisted audit rows and SSE events rather than verbose console logging: `insertAuditEntry` in `server/sqlStore.js`, `publishRealtime` in `server/realtimeBus.js`.

## Comments

**When to Comment:**
- Comments are rare. Prefer self-describing names and clear data structures over inline narration.
- The only notable inline comments are tool-generated section markers in `tsconfig.app.json` and `tsconfig.node.json`, plus the Vite config link comment in `vite.config.ts`.

**JSDoc/TSDoc:**
- Not used in the current codebase.

## Function Design

**Size:**
- Keep helpers small and composable in utility files such as `src/api.ts`, `server/authSession.js`, and `server/realtimeBus.js`.
- The main exception is `src/App.tsx`, which centralizes extensive UI state, local types, derived data, and handlers in one large component. New shared helpers should not expand that pattern further.
- `server/sqlStore.js` is a large procedural module. New persistence logic should follow its helper-plus-exported-operation structure rather than embedding SQL directly in `server/index.js`.

**Parameters:**
- Prefer one object parameter for multi-field mutations and workflows: `runLiveTest`, `runDmIntake` in `src/api.ts`; `createLead`, `upsertBooking`, `processStripePayment` in `server/sqlStore.js`.
- Use positional parameters only for narrow helper calls or identity + action patterns: `runLeadAction(leadId, action)`, `retryDelivery(deliveryId)`.

**Return Values:**
- Frontend fetch wrappers return parsed JSON directly and use typed promises when feasible in `src/api.ts`.
- Backend write operations generally return `{ ok, snapshot, ... }`; read operations return plain records or `{ ok, ... }` result objects depending on endpoint needs.

## Module Design

**Exports:**
- Use named exports for utilities and data modules: `src/api.ts`, `src/data.ts`, `src/types.ts`, `server/authSession.js`, `server/realtimeBus.js`.
- Use a single default export for the root React component in `src/App.tsx`.

**Barrel Files:**
- No barrel files are used.
- `server/store.js` acts as a thin re-export layer over `server/sqlStore.js`; keep it as a stable façade if additional storage implementations are introduced.

## Workflow Commands

**Local workflow:**
- Install: `npm install`
- Run app: `npm run dev`
- Lint: `npm run lint`
- Build: `npm run build`
- Reset seeded state: `npm run reset:data`
- Backend smoke: `npm run test:backend`
- HTTP smoke: `npm run test:http`

**CI workflow:**
- `.github/workflows/ci.yml` runs `npm ci`, `npm run lint`, and `npm run build`.
- CI does not run `npm run test:backend` or `npm run test:http`.

## Observed Gaps

- Backend JavaScript under `server/` is outside ESLint coverage because `eslint.config.js` targets only `*.ts` and `*.tsx`.
- There is no runtime validation layer shared across `src/api.ts`, `server/index.js`, and `server/sqlStore.js`, so contracts can drift silently.
- `src/App.tsx` contains many local types, helpers, state variables, and view logic in one file; reuse pressure should push new abstractions into `src/` modules instead of enlarging it.
- `.env.local` exists at repo root and is loaded manually by `server/supabaseSync.js`; keep secrets out of code and docs, and prefer `.env.example` for documenting required variables.

---

*Convention analysis: 2026-04-04*
