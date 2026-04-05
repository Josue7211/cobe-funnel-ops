# Testing Patterns

**Analysis Date:** 2026-04-04

## Test Framework

**Runner:**
- No Jest, Vitest, Playwright, or Cypress config is present.
- Backend verification uses ad hoc Node smoke scripts: `server/smoke.mjs` and `server/http-smoke.mjs`.
- Config: Not applicable.

**Assertion Library:**
- `node:assert/strict` in `server/smoke.mjs` and `server/http-smoke.mjs`.

**Run Commands:**
```bash
npm run test:backend   # Run store-level smoke coverage
npm run test:http      # Run API/server smoke coverage
npm run lint           # Static frontend lint check
npm run build          # TypeScript compile + Vite production build
```

## Test File Organization

**Location:**
- Tests are separate scripts under `server/`, not co-located beside source files.

**Naming:**
- Smoke-style names communicate scope instead of feature-specific `*.test.*` names: `server/smoke.mjs`, `server/http-smoke.mjs`.

**Structure:**
```text
server/
├── smoke.mjs        # Direct store and workflow assertions
└── http-smoke.mjs   # Starts the server and checks HTTP endpoints
```

## Test Structure

**Suite Organization:**
```javascript
import assert from 'node:assert/strict'

async function main() {
  const seeded = await resetState()
  assert.equal(seeded.leadRecords.length, 3)

  const created = await createLead({...})
  assert.equal(created.ok, true)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

**Patterns:**
- Use a single `async function main()` per script.
- Perform imperative setup, then linear assertions against returned data.
- Exit with process code `1` on failure through a top-level `.catch(...)`.
- Prefer broad smoke validation over exhaustive branch-level checks.

## Mocking

**Framework:** None

**Patterns:**
```javascript
const child = spawn(process.execPath, ['server/index.js'], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    PORT: String(port),
    REMOTE_SYNC_POLL_MS: '1000',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
```

**What to Mock:**
- Very little is mocked.
- `server/http-smoke.mjs` controls the environment by spawning the real server with test-specific env vars instead of replacing modules.

**What NOT to Mock:**
- Do not mock the SQLite-backed store when following current practice; `server/smoke.mjs` exercises `server/store.js` directly.
- Do not mock HTTP routing when following current practice; `server/http-smoke.mjs` uses real `fetch` calls against a live process.

## Fixtures and Factories

**Test Data:**
```javascript
const created = await createLead({
  name: 'Smoke Lead',
  handle: '@smokelead',
  source: 'Manual',
  offer: 'Consult',
  owner: 'Alex',
  budget: '500',
  tags: ['smoke', 'manual'],
  message: 'Need details',
})
```

**Location:**
- The canonical seed fixture lives in `server/seed.js`.
- Tests also create inline records directly in the smoke scripts.
- `resetState` from `server/store.js` is the main test reset primitive.

## Coverage

**Requirements:** None enforced

**View Coverage:**
```bash
# No coverage command or report is configured
```

## Test Types

**Unit Tests:**
- Not present as isolated runner-based unit tests.
- The closest equivalent is `server/smoke.mjs`, which calls store functions directly without HTTP.

**Integration Tests:**
- `server/http-smoke.mjs` is an integration smoke test for Express routes, auth flow, sync endpoints, SSE, and workflow endpoints.

**E2E Tests:**
- Not used.
- There is no browser automation for the React UI in `src/`.

## Current Covered Areas

- Store reset, creation, update, queue reads, timeline reads, delivery retry, reports, and scenario instantiation through `server/smoke.mjs`.
- Health, queue, reports, auth login/session, sync endpoints, exports, remote mirror reads, workflow endpoints, and realtime stream through `server/http-smoke.mjs`.
- Frontend type-check/build integrity through `npm run build`.
- Frontend lint integrity through `npm run lint`.

## Gaps

- CI in `.github/workflows/ci.yml` does not run `npm run test:backend` or `npm run test:http`; only lint and build are enforced.
- There are no automated tests for React rendering, component behavior, state transitions, or API error presentation in `src/App.tsx` and `src/api.ts`.
- There are no route-focused tests that assert specific status codes and validation failures in `server/index.js`.
- There are no branch-specific tests for `server/sqlStore.js`, even though it contains most business logic and persistence behavior.
- There is no coverage reporting, mutation testing, snapshot testing, or contract testing between frontend request types and backend responses.

## Common Patterns

**Async Testing:**
```javascript
const queue = await fetch(`${baseUrl}/api/queue?limit=2`).then((response) => response.json())
assert.equal(Array.isArray(queue), true)
assert.ok(queue.length >= 1)
```

**Error Testing:**
```javascript
main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

## Verified Workflow Status

- `npm run lint`: passed on 2026-04-04.
- `npm run build`: passed on 2026-04-04.
- `npm run test:backend`: passed on 2026-04-04.
- `npm run test:http`: passed on 2026-04-04.
- Backend smoke scripts emit Node's experimental warning for `node:sqlite`; this is expected under the current Node 22 setup described in `README.md`.

---

*Testing analysis: 2026-04-04*
