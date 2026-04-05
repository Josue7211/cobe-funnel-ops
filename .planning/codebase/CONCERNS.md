# Codebase Concerns

**Analysis Date:** 2026-04-04

## Tech Debt

**Monolithic app and store layers:**
- Issue: UI state, orchestration, persistence mapping, workflow logic, reporting, and sync logic are concentrated in a few large files instead of smaller modules.
- Files: `src/App.tsx`, `server/sqlStore.js`, `server/index.js`
- Impact: Small changes can create cross-surface regressions, reasoning about state transitions is slow, and parallel work will conflict frequently.
- Fix approach: Split `src/App.tsx` by surface and data hooks, split `server/sqlStore.js` into read models, mutation handlers, and sync helpers, and keep `server/index.js` limited to routing/auth/composition.

**Frontend/backend contract drift:**
- Issue: The frontend keeps duplicate fallback domain state and loose API typing while the backend owns the real SQLite snapshot shape.
- Files: `src/App.tsx`, `src/api.ts`, `src/types.ts`, `src/data.ts`, `server/sqlStore.js`
- Impact: UI can appear healthy while diverging from live backend behavior, and API shape changes will fail late.
- Fix approach: Define one shared contract module for snapshot/query DTOs and remove static fallback behavior from live operator paths.

## Known Bugs

**Frontend operator actions are not wired to authenticated sessions:**
- Symptoms: The UI calls protected mutation endpoints without attaching a bearer token or session token.
- Files: `src/api.ts`, `src/App.tsx`, `server/index.js`, `server/authSession.js`
- Trigger: Set `ADMIN_API_TOKEN` or require session-based auth in any non-local environment.
- Workaround: Leave admin enforcement effectively open in local/dev, or call API endpoints manually with a token outside the frontend.

**Static deployments can load the app while all live API features fail:**
- Symptoms: The frontend uses relative `/api/*` requests and `EventSource('/api/realtime/stream')`, but current repo deployment artifacts show a static Vite output without an accompanying server runtime.
- Files: `vite.config.ts`, `src/api.ts`, `src/App.tsx`, `.github/workflows/ci.yml`
- Trigger: Deploy to GitHub Pages or a static Vercel target without a separately reachable Express API and proxy layer.
- Workaround: Run `npm run dev` locally with the Vite proxy, or deploy the Express server separately and front it with the same origin.

## Security Considerations

**Auth defaults are too permissive for anything beyond local demo use:**
- Risk: Default username/password and session secret fall back to predictable values, `requireAdmin` allows all mutations when `ADMIN_API_TOKEN` is unset, and CORS is fully open.
- Files: `server/authSession.js`, `server/index.js`, `.env.example`
- Current mitigation: Optional env-based overrides exist.
- Recommendations: Fail startup when admin secrets are missing outside local dev, require auth on all mutating routes by default, scope CORS to trusted origins, and add authenticated SSE if the stream remains operator-visible.

**Sensitive environment artifacts are present in the repo tree:**
- Risk: Deployment-generated environment files under `.vercel/` exist locally and are easy to commit by mistake.
- Files: `.vercel/`
- Current mitigation: `.vercel/README.txt` says the directory should not be shared.
- Recommendations: Ensure `.vercel/` stays ignored, remove any committed env artifacts, and keep secret-bearing files out of repository history.

## Performance Bottlenecks

**Every mutation pushes full snapshots and can rewrite all mirror tables:**
- Problem: Remote sync uses whole-state snapshot uploads plus delete-and-replace mirror table writes.
- Files: `server/index.js`, `server/supabaseSync.js`
- Cause: `maybeSyncSnapshot()` runs after each successful mutation and `pushRemoteMirror()` replaces every remote mirror table.
- Improvement path: Batch sync, move mirror updates to background jobs, and switch to incremental row-level upserts keyed by record version.

**Realtime refresh fan-out reloads multiple full views on every event:**
- Problem: Each realtime event can trigger bootstrap, queue, and reports refreshes from the client.
- Files: `src/App.tsx`, `server/realtimeBus.js`
- Cause: The SSE listener in `src/App.tsx` refetches multiple endpoints for several event types, and the server publishes frequently on sync/mutation paths.
- Improvement path: Send scoped event payloads, refresh only affected views, and debounce or coalesce refreshes client-side.

## Fragile Areas

**Remote reconciliation is lossy and conflict detection is shallow:**
- Files: `server/index.js`, `server/supabaseSync.js`, `server/sqlStore.js`
- Why fragile: Conflict detection compares only aggregate counts, reconciliation merges mostly by `id`, and `loadState()` replaces local tables wholesale. Concurrent edits with the same IDs or divergent field values can be overwritten silently.
- Safe modification: Add per-record `updated_at` or version fields, detect field-level conflicts, and avoid destructive full-table loads for normal sync.
- Test coverage: Only smoke coverage exists in `server/http-smoke.mjs`; conflict edge cases are not exercised in CI.

**UI failure modes are intentionally masked:**
- Files: `src/App.tsx`, `src/data.ts`
- Why fragile: The app falls back to seeded frontend state and persisted `localStorage` state when API calls fail, so operator-visible errors are easy to miss.
- Safe modification: Distinguish demo mode from live mode explicitly and surface API degradation instead of silently substituting local state.
- Test coverage: No frontend tests detected for offline/auth/degraded-mode behavior.

## Scaling Limits

**Single-process SQLite plus in-memory SSE bus:**
- Current capacity: One local process with a file-backed SQLite DB and in-memory connected SSE clients.
- Limit: Multiple API instances will not share realtime state, horizontal scaling will break event propagation, and the SQLite file model is not a good fit for distributed write traffic.
- Scaling path: Move realtime fan-out to shared infrastructure, define a single write authority, and treat SQLite as local-dev only once multi-user ops matter.

## Dependencies at Risk

**Node runtime assumptions are stricter than CI/deploy contract:**
- Risk: The app depends on `node:sqlite` and requires modern Node, while different parts of the repo reference Node 22+ and Vercel Node 24.x behavior.
- Files: `README.md`, `package.json`, `.github/workflows/ci.yml`, `.vercel/project.json`, `server/sqlStore.js`
- Impact: Local/dev/prod mismatches will show up as startup failures or deployment confusion rather than compile-time errors.
- Migration plan: Make runtime requirements explicit in deploy config, add server startup verification in CI, and document one supported deployment topology.

## Missing Critical Features

**No production deployment contract for the API:**
- Problem: The repo has build/deploy evidence for the static frontend, but no checked-in production path for `server/index.js`.
- Blocks: Reliable live operator usage, authenticated mutations, SSE, and remote sync from deployed environments.

**No first-class auth UX:**
- Problem: There is a backend login/session API, but no frontend login flow, token persistence, or auth-aware request wrapper.
- Blocks: Safely enabling admin protection without breaking the operator UI.

## Test Coverage Gaps

**Critical flows are not enforced in CI:**
- What's not tested: Backend smoke scripts, auth/session flow, sync/reconcile edge cases, static deployment behavior, and frontend degraded/offline behavior.
- Files: `.github/workflows/ci.yml`, `server/http-smoke.mjs`, `server/smoke.mjs`, `src/App.tsx`
- Risk: The repo can pass CI while shipped flows for login, sync, SSE, or deployed API connectivity are broken.
- Priority: High

## Immediate Leverage Points

**Lock down the deployment story first:**
- Problem: Static frontend and live Express API are not packaged as one deployable unit.
- Blocks: Nearly every operator workflow outside localhost.

**Add a real auth client boundary:**
- Problem: Requests in `src/api.ts` cannot carry login state today.
- Blocks: Turning on admin enforcement without breaking the app.

**Demote full-state sync to a controlled background path:**
- Problem: The current sync model is expensive and overwrite-prone.
- Blocks: Safe multi-user or remote-backed operation.

---

*Concerns audit: 2026-04-04*
