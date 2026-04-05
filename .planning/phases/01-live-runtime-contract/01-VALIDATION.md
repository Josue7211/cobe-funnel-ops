---
phase: 1
slug: live-runtime-contract
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-04
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node smoke scripts + frontend lint/build |
| **Config file** | `package.json` scripts (`test:http`, `build`, `lint`) |
| **Quick run command** | Task-local quick command from the map below (`npm run build` or `npm run test:http`) |
| **Full suite command** | `npm run lint && npm run test:http && npm run build` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task-local quick command from the map below so feedback stays under the full-suite cadence where feasible.
- **After every completed plan:** Run `npm run lint && npm run test:http && npm run build`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | DEP-01 | integration | `npm run build` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | DEP-03 | integration | `npm run test:http` | ✅ | ⬜ pending |
| 1-02-01 | 02 | 2 | AUTH-01, AUTH-02 | integration | `npm run test:http` | ✅ | ⬜ pending |
| 1-02-02 | 02 | 2 | OPS-01 | build + manual | `npm run build` | ✅ | ⬜ pending |
| 1-03-01 | 03 | 3 | OPS-01, DEP-03 | manual UI + build | `npm run build` | ✅ | ⬜ pending |
| 1-03-02 | 03 | 3 | DEP-03 | build + docs | `npm run build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements; no Wave 0 task creation is needed for this phase.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser login gate appears before operator console when no valid session exists | AUTH-01, OPS-01 | Current repo has no browser automation harness | Run app, clear cookies, load `/`, confirm login/auth-required gate appears before queue/workspace surfaces |
| Authenticated console surfaces load from backend data only after successful login | OPS-01, AUTH-01 | Current repo has no browser automation harness for the post-login console path | Log in from the browser and confirm the queue, active workflow, operations rail, and reports populate only after session bootstrap, not before authentication succeeds |
| UI surfaces degraded or auth-required state instead of silently using seeded fallback after bootstrap/auth/API failure | OPS-01, DEP-03 | This is a user-visible shell behavior not currently covered by automated browser tests | Start app, force failed bootstrap or unauthenticated session, confirm visible runtime status (`degraded`, `auth_required`, or equivalent) appears and queue/workflow do not masquerade as healthy live data |
| Failed protected mutations do not leave successful local state behind after session loss or logout | AUTH-02, OPS-01, DEP-03 | The affected mutation handlers live in `src/App.tsx` and need browser-path verification | Log in, trigger a protected action once to establish baseline behavior, then clear or expire the session and retry that action; confirm the UI shows failure/degraded state and does not keep the post-action queue/workflow/report state as though the live write succeeded |
| SSE starts only after authenticated session bootstrap and disconnects cleanly on logout | AUTH-01, AUTH-02 | EventSource/login interaction is browser-path specific | Log in, confirm live console initializes only after session bootstrap and the realtime stream is active; log out, confirm live console tears down and protected state is no longer shown |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or manual/Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
