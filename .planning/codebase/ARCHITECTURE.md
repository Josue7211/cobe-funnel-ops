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
- Contains: SQLite schema bootstrapping, seed loading, snapshot readers, transactional mutations, workflow processors, scenario instantiation.
- Depends on: Node `sqlite`, schema SQL, seed data.
- Used by: `server/index.js` through the re-export shim in `server/store.js`.

**Remote Sync Layer:**
- Purpose: Mirror local state into Supabase and inspect remote snapshot status/diffs.
- Location: `server/supabaseSync.js`
- Contains: `.env.local` loading, snapshot hashing, Supabase REST calls, local-to-remote table mapping.
- Depends on: Environment variables for Supabase URL/key and the local snapshot returned from `server/sqlStore.js`.
- Used by: `server/index.js` after successful mutations and during periodic remote polling.

**Realtime Layer:**
- Purpose: Broadcast state and sync events to connected dashboards.
- Location: `server/realtimeBus.js`
- Contains: In-memory client registry, SSE stream attachment, event publishing, connection stats.
- Depends on: Node `EventEmitter` and active HTTP responses.
- Used by: `server/index.js` after mutations, sync pushes/pulls, and remote watcher updates.

## Data Flow

**Initial dashboard load:**
1. `src/main.tsx` mounts `src/App.tsx`.
2. `src/App.tsx` loads fallback demo data, then requests `/api/bootstrap` and `/api/reports/overview` through `src/api.ts`.
3. `server/index.js` calls `readState()` and `readReports()` from `server/store.js`.
4. `server/sqlStore.js` seeds SQLite on first access, reads normalized tables, assembles a snapshot, and returns JSON to the client.

**Queue and timeline refresh:**
1. `src/App.tsx` requests `/api/queue` when lead filters change.
2. `readQueue()` in `server/sqlStore.js` joins leads, bookings, conversations, and deliveries into queue records with derived priority, lane, and recommended action.
3. When a lead is selected, `src/App.tsx` requests `/api/leads/:leadId/timeline`.
4. `readLeadTimeline()` composes messages, bookings, delivery attempts, audit events, and notes into a single event stream.

**Mutation path:**
1. The client calls a mutation helper in `src/api.ts`, such as `/api/workflows/dm-intake`, `/api/leads/:leadId/actions`, or `/api/deliveries/:deliveryId/retry`.
2. `server/index.js` runs `requireAdmin` for protected routes, then delegates to a store mutation in `server/sqlStore.js`.
3. `server/sqlStore.js` executes a SQLite transaction, updates normalized tables, appends audit/delivery side effects, and returns the full snapshot.
4. `respondWithMutation()` in `server/index.js` optionally pushes the snapshot to Supabase, emits realtime events, and returns the updated snapshot payload.
5. `src/App.tsx` listens for SSE events and re-fetches bootstrap, queue, and reports to converge UI state.

**Remote sync path:**
1. Successful mutations call `maybeSyncSnapshot()` in `server/index.js`.
2. `server/supabaseSync.js` posts the full snapshot row plus denormalized mirror tables to Supabase REST endpoints.
3. `startRemoteWatcher()` polls Supabase on an interval and compares snapshot digests.
4. If the digest changes, `server/index.js` emits `sync.remote_changed`, which causes the client SSE listener to refresh.

## State Management

**Client state:**
- `src/App.tsx` owns nearly all UI and view state with `useState`.
- The client persists a broad local cache into `window.localStorage`, but server responses are treated as the source of truth whenever the API is reachable.
- Realtime updates do not patch state incrementally; they trigger a full re-fetch of bootstrap, queue, and reports.

**Server state:**
- `server/sqlStore.js` stores authoritative runtime data in normalized SQLite tables under `server/data/runtime.sqlite`.
- Snapshot reads denormalize table rows back into the shape expected by the client.
- Mutations are wrapped in `withTransaction()` so multi-table workflow changes commit atomically.

## Key Abstractions

**Snapshot:**
- Purpose: Canonical application payload shared between the backend and frontend.
- Examples: `src/api.ts`, `server/index.js`, `server/sqlStore.js`
- Pattern: Read operations return either the full snapshot or derived views built from snapshot tables.

**Queue Record:**
- Purpose: Operational work item synthesized from lead, booking, conversation, and delivery state.
- Examples: `src/api.ts`, `server/sqlStore.js`
- Pattern: Derived read model computed by `readQueue()` rather than stored directly.

**Workflow Processor:**
- Purpose: Simulate funnel events and attach side effects consistently.
- Examples: `processDmIntake()`, `processStripePayment()`, `processBookingWebhook()`, `provisionOnboarding()` in `server/sqlStore.js`
- Pattern: Transactional command handlers that mutate tables, append audit entries, and enqueue delivery attempts.

**Scenario Template:**
- Purpose: Create demo/runtime records for specific funnel situations.
- Examples: `scenarioTemplates` and `instantiateScenario()` in `server/sqlStore.js`
- Pattern: Template metadata plus procedural inserts across multiple tables.

## Entry Points

**Web App Entry:**
- Location: `src/main.tsx`
- Triggers: Browser loading `index.html`
- Responsibilities: Create the React root and mount `App`.

**API Server Entry:**
- Location: `server/index.js`
- Triggers: `npm run dev:api` or direct `node server/index.js`
- Responsibilities: Start Express, register routes, and launch the remote watcher.

**Database Bootstrap:**
- Location: `server/sqlStore.js`
- Triggers: First import/use of the store module.
- Responsibilities: Create `server/data/`, open `runtime.sqlite`, execute `server/schema.sql`, and seed if empty.

## Error Handling

**Strategy:** Return structured `{ ok: false, message }` results from store functions and convert them to HTTP status codes in `server/index.js`.

**Patterns:**
- Validation failures stay inside the store layer and are returned without throwing when the failure is user/input related.
- Transactional mutations throw only for unexpected paths; `withTransaction()` rolls back automatically before the error escapes.
- Frontend fetches in `src/App.tsx` often swallow errors and fall back to bundled demo data or existing UI state.

## Cross-Cutting Concerns

**Logging:** Minimal console logging in `server/index.js` for startup and remote watcher failures.
**Validation:** Route-level auth checks in `server/index.js`; payload validation and required-field checks in `server/sqlStore.js`.
**Authentication:** Header/session token validation in `server/authSession.js` plus `requireAdmin()` in `server/index.js`.
**Realtime:** SSE fan-out in `server/realtimeBus.js`; client refresh loop in `src/App.tsx`.
**Remote Sync:** Snapshot push/pull/reconcile logic in `server/index.js` backed by `server/supabaseSync.js`.

---

*Architecture analysis: 2026-04-04*
