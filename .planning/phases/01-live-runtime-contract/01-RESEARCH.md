# Phase 1: Live Runtime Contract - Research

**Researched:** 2026-04-04
**Domain:** Brownfield React/Vite + Express + SQLite deployment/auth runtime contract
**Confidence:** HIGH

## User Constraints

No phase `CONTEXT.md` exists for this phase, so there are no locked discuss-phase decisions to copy verbatim.

Active constraints from the user request and project docs:
- Brownfield React/Vite frontend + Express API + SQLite runtime + optional Supabase mirror
- Focus research on deploy topology, auth/session boundary, same-origin or proxy strategy, static-host failure modes, and the minimum changes needed to make the current product honestly usable outside localhost
- Must address: `OPS-01`, `AUTH-01`, `AUTH-02`, `DEP-01`, `DEP-03`
- Keep SQLite as local execution store with optional Supabase mirror; do not turn Supabase into the required Phase 1 runtime dependency
- Prioritize one real deployment/auth contract before more product breadth

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-01 | Operator can open one authenticated console and view live queue, active workflow, operations rail, and reports from backend data | Same-origin runtime, frontend login/session persistence, and live-mode failure surfacing remove localhost-only assumptions |
| AUTH-01 | Operator can log in through the frontend and authenticated requests include the required session or token state | Cookie-backed same-origin session boundary fits both `fetch` and `EventSource` with minimal code churn |
| AUTH-02 | Protected mutation endpoints reject unauthenticated access outside explicit local-dev allowances | Boot-time env validation and stricter `requireAdmin` behavior make auth explicit in non-local environments |
| DEP-01 | There is one documented deployment topology where the operator UI and Express API both work outside localhost | Recommended topology is one origin: Express serves built SPA and `/api/*`, or a reverse proxy keeps SPA + API on one origin |
| DEP-03 | The deployed product path supports queue reads, workflow mutations, auth, and realtime without requiring local proxy assumptions | Removing reliance on Vite dev proxy, static-only hosting, and seeded fallbacks produces one honest live path |
</phase_requirements>

## Summary

This phase should standardize on one browser-visible contract: the operator loads the SPA and all live reads, mutations, auth, and SSE realtime come from the same origin. In this repo, that is the minimum-change path because the frontend already assumes relative `/api/*` URLs and `new EventSource('/api/realtime/stream')`, while the backend already owns the real runtime state, login endpoint, and SSE stream.

The current failure is not missing backend functionality. It is contract drift. Vite dev proxy hides the split between browser origin and API origin, static hosting can ship `dist/` without `server/index.js`, the frontend silently falls back to seeded/local state when API calls fail, and browser auth is incomplete because `src/api.ts` sends no session material. Those conditions let the app appear usable while the live product is actually broken outside localhost.

**Primary recommendation:** Plan Phase 1 around one same-origin deployment contract: Express remains the runtime authority, serves the built Vite app, owns `/api/*` and `/api/realtime/stream`, and authenticates the browser with a real session cookie in non-local environments.

## Project Constraints (from CLAUDE.md)

None. `CLAUDE.md` is not present in the project root.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js | `22.22.2` local | Runtime for Express and built-in `node:sqlite` | Existing backend already depends on `node:sqlite`; Phase 1 should preserve one Node server runtime |
| Express | `5.2.1` (npm registry verified 2026-04-01) | API, auth boundary, SSE, and static asset host | Existing backend already centralizes routes/auth/realtime here; Express can also serve built SPA assets |
| React | `19.2.4` (npm registry verified 2026-04-03) | Operator UI runtime | Existing app is already React; Phase 1 is not a framework migration |
| Vite | `8.0.3` current, repo uses `8.0.1` | Frontend build and dev server only | Keep Vite for local dev/build, but stop treating its dev proxy as a deploy contract |
| SQLite via `node:sqlite` | Built into Node 22+ | Primary local execution store | Matches existing architecture and near-term product decision |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cors` | `2.8.6` (npm registry verified 2026-01-22) | Local-dev cross-origin access only | Keep for localhost dev if needed; tighten or disable for production same-origin |
| Native `EventSource` | Browser baseline since Jan 2020 | Realtime stream consumption | Use for same-origin SSE updates from `/api/realtime/stream` |
| Reverse proxy / Node-capable host | Platform capability, not npm dependency | Keep SPA + API on one origin in deployment | Use when Express is not the public edge server directly |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Same-origin SPA + API | Split frontend and API across different origins | Adds CORS, cookie, and SSE credential complexity immediately; not the minimum-change Phase 1 path |
| Express serving `dist/` directly | Reverse proxy in front of Express and static assets | Also valid if both stay on one origin; adds infra work but keeps the same browser contract |
| Cookie-backed browser session | Bearer token in JS storage only | Works for `fetch`, but `EventSource` does not support custom auth headers; auth contract becomes inconsistent |

**Installation:**
```bash
npm install
```

**Version verification:** Verified locally on 2026-04-04 with:
```bash
npm view express version time.modified
npm view react version time.modified
npm view vite version time.modified
npm view cors version time.modified
```

## Architecture Patterns

### Recommended Project Structure
```text
server/
├── index.js            # Express runtime: API + auth + SSE + static SPA host
├── authSession.js      # Session creation/verification and environment gating
├── realtimeBus.js      # SSE fan-out
└── supabaseSync.js     # Optional mirror only
src/
├── api.ts              # Auth-aware request layer; no hidden live fallbacks
├── App.tsx             # Login gate + live/degraded mode UI
└── ...
dist/                   # Built Vite app served by Express in production
```

### Pattern 1: Same-Origin Runtime Contract
**What:** The browser talks to one origin for HTML, JS, CSS, `/api/*`, and `/api/realtime/stream`.
**When to use:** For the deployed operator product and for production-like previews.
**Example:**
```js
// Source: https://expressjs.com/en/starter/static-files.html
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'dist')

app.use(express.static(distDir))
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next()
  res.sendFile(path.join(distDir, 'index.html'))
})
```

### Pattern 2: Browser Session That Works For `fetch` And SSE
**What:** Login issues a signed session as an `HttpOnly` cookie; `requireAdmin` accepts that cookie and may still accept `Authorization` for scripted clients/tests.
**When to use:** Browser operator runtime in any non-local environment.
**Example:**
```js
// Source basis: existing server/authSession.js + MDN EventSource docs
app.post('/api/auth/login', (req, res) => {
  if (!authenticateAdmin(req.body.username, req.body.password)) {
    return res.status(401).json({ ok: false, message: 'Invalid credentials.' })
  }

  const token = createAdminSessionToken(req.body.username)
  res.setHeader(
    'Set-Cookie',
    `cobe_admin_session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure`
  )
  return res.json({ ok: true, user: req.body.username })
})
```

### Pattern 3: Explicit Local-Dev Allowance, Explicit Non-Local Enforcement
**What:** Local development may allow permissive auth only when the environment is clearly local; non-local startup must require admin credentials and a session secret.
**When to use:** Everywhere. This is the boundary that satisfies `AUTH-02`.
**Example:**
```js
const isLocalDev = process.env.NODE_ENV !== 'production' && process.env.ALLOW_INSECURE_LOCAL_AUTH === 'true'

if (!isLocalDev) {
  assertEnv('ADMIN_USERNAME')
  assertEnv('ADMIN_PASSWORD')
  assertEnv('ADMIN_SESSION_SECRET')
}
```

### Pattern 4: Live Mode Must Fail Loudly
**What:** The frontend can have a demo mode, but deployed live mode must not silently replace failed API calls with seeded/local state.
**When to use:** All operator-visible live screens.
**Example:**
```ts
async function fetchBootstrapLive() {
  const response = await request('/api/bootstrap')
  return response
}

// If request fails in live mode, set a degraded/live-error banner instead of applying demo data.
```

### Anti-Patterns to Avoid
- **Static-only hosting as the “deployment”:** `dist/` can load while `/api/*` and SSE are dead.
- **Bearer-only browser auth:** `fetch` can send it, but `EventSource` cannot attach custom headers.
- **`app.use(cors())` as security:** CORS is not auth and does not protect mutation routes.
- **Silent seeded fallback in live mode:** it turns real outages into fake success.
- **Treating Supabase as required for Phase 1:** the mirror is optional and currently brittle; the live runtime contract should not depend on it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser multi-origin auth for this phase | Custom cross-origin token + SSE workaround scheme | Same-origin session cookie | Lowest-friction way to make login, mutations, and SSE all obey one auth boundary |
| Production deploy story | Separate “frontend deploy” and undocumented API sidecar | One documented Node-capable topology | Prevents static-host success theater |
| Access control | Open CORS plus optional token header | Strict `requireAdmin` with env-gated local bypass only | Browsers enforce CORS, not authorization |
| Live fallback behavior | Replaying seeded/local demo data on request failure | Explicit live/degraded state and operator-visible errors | Required for an honest operator product |
| Phase 1 remote dependency | Mandatory Supabase for reads/mutations | SQLite primary runtime, Supabase optional mirror | Keeps the minimum viable product path small and reliable |

**Key insight:** The hardest part of this phase is not building auth endpoints. It is removing hidden alternate paths so there is exactly one truthful runtime contract outside localhost.

## Common Pitfalls

### Pitfall 1: Vite Dev Proxy Becomes The Product Contract
**What goes wrong:** Local dev works because `/api` proxies to `localhost:8787`, but deployed environments do not replicate that behavior.
**Why it happens:** `vite.config.ts` proxies only in dev; production `dist/` has no API host logic.
**How to avoid:** Make production same-origin by serving `dist/` from Express or by placing both behind one reverse proxy.
**Warning signs:** Frontend loads in deployment, but queue/auth/workflow/realtime all fail.

### Pitfall 2: Browser Auth Works For `fetch` But Not SSE
**What goes wrong:** Login appears implemented, but realtime stays unauthenticated or broken.
**Why it happens:** `EventSource()` only takes `url` and `withCredentials`; it does not send custom auth headers.
**How to avoid:** Use same-origin cookie-backed auth for browser sessions.
**Warning signs:** Authenticated mutations succeed, but realtime stream cannot be protected consistently.

### Pitfall 3: Production Still Boots With Demo Secrets
**What goes wrong:** Remote environments accept default `operator` / `operator-demo-pass` or default session secret.
**Why it happens:** `server/authSession.js` currently falls back to local-dev defaults.
**How to avoid:** Fail startup when auth secrets are missing outside explicit local-dev mode.
**Warning signs:** Production or preview logs show default credentials, or auth “works” without real env setup.

### Pitfall 4: Live Errors Are Masked By Seeded State
**What goes wrong:** Operators keep seeing plausible queue/timeline/report data when the backend is unreachable.
**Why it happens:** `src/App.tsx` falls back to local seeded state in multiple paths.
**How to avoid:** Separate demo mode from live mode and show live failure banners/status.
**Warning signs:** API outage does not visibly degrade the UI.

### Pitfall 5: Phase 1 Gets Coupled To Supabase Mirror Health
**What goes wrong:** Auth/deploy work is blocked by optional remote-sync setup.
**Why it happens:** Current HTTP smoke test assumes sync push succeeds, but local environment may not have Supabase configured.
**How to avoid:** Keep sync optional for Phase 1 and make tests branch correctly on configuration.
**Warning signs:** `npm run test:http` fails because `push.ok !== true` when sync is intentionally unset.

## Code Examples

Verified patterns from official sources:

### Serve Built Assets From Express
```js
// Source: https://expressjs.com/en/starter/static-files.html
app.use(express.static(distDir))
```

### Keep Vite As Dev/Build Tool, Not Production API Proxy
```ts
// Source: https://vite.dev/guide/backend-integration.html
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
```

### Same-Origin SSE Client
```ts
// Source: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
const stream = new EventSource('/api/realtime/stream')
stream.addEventListener('state.changed', refreshState)
```

### Cross-Origin SSE Requires Credentials Mode
```ts
// Source: https://developer.mozilla.org/en-US/docs/Web/API/EventSource/EventSource
const stream = new EventSource('https://api.example.com/realtime', {
  withCredentials: true,
})
```

For this phase, prefer the first SSE pattern by keeping the runtime same-origin.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static SPA + hidden local proxy assumptions | Same-origin app/API runtime | Current best practice for this repo in 2026 | Removes split-brain deploy failure and makes auth/realtime coherent |
| JS-stored bearer token as only browser credential | Cookie-backed browser session, optional bearer support for tests/scripts | Driven by long-standing EventSource browser API constraints | Makes authenticated SSE and fetch use the same browser contract |
| “Demo fallback” as resilience | Explicit live/degraded mode | Current operator-product expectation | Operators can trust outages are visible instead of masked |

**Deprecated/outdated:**
- GitHub Pages or static-only Vercel deploy as the main product path: incompatible with the current Express API + SSE runtime.
- Open `cors()` in production as a comfort blanket: it does not secure the API.

## Open Questions

1. **Which concrete host should own the same-origin runtime?**
   - What we know: The repo already has Vercel metadata, but no checked-in Node runtime adapter; Express can serve `dist/` directly.
   - What's unclear: Whether the project wants a plain Node host, a container host, or a reverse proxy in front of Express.
   - Recommendation: Keep the plan topology-agnostic at the browser contract level, but implement Express static serving so any Node-capable host works.

2. **Should local insecure auth bypass remain enabled by default?**
   - What we know: The current code effectively allows broad mutation access when `ADMIN_API_TOKEN` is unset.
   - What's unclear: Whether the team wants “works with zero env vars locally” to remain the default.
   - Recommendation: Keep a clearly named explicit local-dev bypass, but make it opt-in and impossible to ship accidentally.

3. **Should Supabase-related smoke assertions be phase-scoped or config-scoped?**
   - What we know: `npm run test:http` currently fails in this environment because it assumes `sync/push` succeeds.
   - What's unclear: Whether Supabase should be required in CI for this repo.
   - Recommendation: Phase 1 should make auth/deploy smoke tests pass without Supabase; Phase 4 can own sync-required validation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Express runtime, Vite build, `node:sqlite` | ✓ | `22.22.2` | — |
| npm | Install/build/test commands | ✓ | `11.12.1` | — |
| Supabase credentials | Optional mirror sync only | ✗ | — | Keep SQLite-only runtime path for Phase 1 |

**Missing dependencies with no fallback:**
- None for Phase 1 runtime-contract work, assuming deployment targets support a Node process.

**Missing dependencies with fallback:**
- Supabase runtime configuration: optional; planner should not make it a prerequisite for Phase 1 completion.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node script-based smoke tests using `node:assert/strict` |
| Config file | none |
| Quick run command | `npm run test:http` |
| Full suite command | `npm run test:backend && npm run test:http && npm run lint && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-01 | Authenticated operator can load live bootstrap/queue/reports | integration smoke | `npm run test:http` | ✅ |
| AUTH-01 | Login endpoint issues browser-usable session and authenticated requests succeed | integration smoke | `npm run test:http` | ✅ |
| AUTH-02 | Protected mutations reject unauthenticated requests outside local-dev allowance | integration smoke | `npm run test:http` | ✅ but needs new assertions |
| DEP-01 | One documented topology serves UI + API together | smoke/manual deploy check | `npm run build` plus hosted smoke | ❌ Wave 0 |
| DEP-03 | Queue, workflow mutations, auth, and realtime work without Vite proxy assumptions | integration smoke | `npm run test:http` | ✅ but needs same-origin deployment assertions |

### Sampling Rate
- **Per task commit:** `npm run test:http`
- **Per wave merge:** `npm run test:backend && npm run test:http && npm run build`
- **Phase gate:** Full suite green plus one production-like manual smoke against the documented topology before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/http-smoke.mjs` — add unauthenticated rejection assertions for protected routes in non-local mode
- [ ] `server/http-smoke.mjs` — stop assuming Supabase sync is configured unless env vars are present
- [ ] `server/http-smoke.mjs` — add production-contract assertions for Express-served static app or equivalent same-origin topology
- [ ] Frontend auth/degraded-mode verification — no React/browser test currently covers login gate or “live backend unavailable” UI behavior

## Sources

### Primary (HIGH confidence)
- [Vite Backend Integration](https://vite.dev/guide/backend-integration.html) - verified that Vite is a dev/build tool and backend integration is an explicit pattern
- [Vite Shared Options](https://vite.dev/config/shared-options.html) - verified `base` default `/` and `./` as embedded deployment mode
- [Express static files](https://expressjs.com/en/starter/static-files.html) - verified Express can serve static build output directly
- [Express cors middleware](https://expressjs.com/en/resources/middleware/cors.html) - verified default `cors()` behavior and that CORS is not authorization
- [MDN EventSource constructor](https://developer.mozilla.org/en-US/docs/Web/API/EventSource/EventSource) - verified constructor shape and `withCredentials` option
- [MDN Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) - verified same-origin/cross-origin SSE usage and connection behavior
- Local repo inspection - `server/index.js`, `server/authSession.js`, `server/supabaseSync.js`, `src/api.ts`, `src/App.tsx`, `vite.config.ts`, `.github/workflows/ci.yml`, `.env.example`
- Local npm registry checks on 2026-04-04 - `express@5.2.1`, `react@19.2.4`, `vite@8.0.3`, `cors@2.8.6`

### Secondary (MEDIUM confidence)
- None needed beyond official docs and direct code inspection

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - existing repo stack plus npm registry verification
- Architecture: HIGH - recommendation follows direct code inspection and official browser/backend docs
- Pitfalls: HIGH - each pitfall is observable in the current code or current test baseline

**Research date:** 2026-04-04
**Valid until:** 2026-05-04
