# Operator Console UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the operator console so it saves time by making cross-system state, blockers, and next actions obvious from one dominant workflow surface.

**Architecture:** Keep the existing single-file React screen and current data model, but reorganize the shell into a compact queue, a dominant center workflow canvas, and a narrow actions rail. Move timeline, notes, replay, and systems detail out of the default path, and fix the current overlapping/scroll-trap layout by giving the center workspace one primary scroll owner.

**Tech Stack:** React 19, TypeScript, Vite, CSS, existing Express/SQLite backend smoke tests

---

## File Structure

### Existing files to modify

- `src/App.tsx`
  - Recompose the screen structure
  - Move lifecycle/recovery into the primary workflow body
  - Convert the right side of the active workflow into an actions rail
  - Demote timeline/notes/replay/systems content into secondary surfaces
- `src/App.css`
  - Replace the current equal-weight three-column feel with a queue + main canvas + action rail layout
  - Fix overflow ownership and remove overlapping scroll regions
  - Reduce badge noise and tighten hierarchy
- `src/index.css`
  - Adjust global spacing/scroll variables only if needed to support the new shell cleanly

### No new runtime files

This redesign should stay inside the existing screen and style files. Do not add new state-management layers or split the page into multiple components in this pass unless `src/App.tsx` becomes impossible to reason about during implementation.

---

### Task 1: Rebuild The Top Shell Around Time-Saved Workflow

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `npm run build`

- [ ] **Step 1: Replace the heavy header composition with a calm system bar**

Update the top-level JSX in `src/App.tsx` so the header no longer stacks a large metric strip, command bar, and interview block above the workspace. Replace it with a compact top bar that contains title, minimal KPIs, and global actions only.

Use this shape for the new shell:

```tsx
<div className="console-shell">
  <header className="console-topbar">
    <div className="console-topbar-title">
      <h1>COBE operator console</h1>
      <p>{runtimeStatus === 'ready' ? 'Cross-system workflow live' : 'Runtime requires attention'}</p>
    </div>

    <div className="console-topbar-metrics">
      {headerStats.slice(0, 3).map((stat) => (
        <article key={stat.label} className="topbar-metric">
          <span>{stat.label}</span>
          <strong>{stat.value}</strong>
        </article>
      ))}
    </div>

    <div className="console-topbar-actions">
      <span className="topbar-status">{runtimeStatus === 'ready' ? 'Backend live' : 'Backend degraded'}</span>
      <button type="button" className="button button-primary button-small" onClick={handleRunLiveTest}>
        Run live test
      </button>
      <button type="button" className="button button-secondary button-small" onClick={handleExportProof}>
        Export proof
      </button>
      <button type="button" className="button button-secondary button-small" onClick={handleLogout}>
        Logout
      </button>
    </div>
  </header>

  <main className="console-grid">
    {/* queue / workspace / rail */}
  </main>
</div>
```

- [ ] **Step 2: Remove the old header-only UI blocks from the default path**

Delete or demote these blocks from the default shell in `src/App.tsx`:

- `header-strip`
- `command-bar`
- `interview-band`
- `interview-step-grid`

The only exception is if one of these blocks contains logic that must survive. In that case, preserve the logic but relocate it into a secondary drawer or deferred section instead of keeping it above the fold.

Use this rule while editing:

```tsx
// Keep only one top-level message band when there is a real state problem.
{runtimeStatus !== 'ready' && apiError ? (
  <div className="runtime-banner runtime-banner-degraded">
    <strong>Runtime attention required</strong>
    <span>{apiError}</span>
  </div>
) : null}
```

- [ ] **Step 3: Rewrite the top-shell CSS so it stops competing with the workspace**

In `src/App.css`, replace the old header styles with a compact top-bar layout.

Add or replace with:

```css
.console-topbar {
  display: grid;
  grid-template-columns: minmax(260px, 1.2fr) minmax(320px, 1fr) auto;
  gap: 16px;
  align-items: start;
  padding: 14px 16px;
  border: 1px solid var(--line);
  background: var(--bg-1);
}

.console-topbar-title,
.console-topbar-actions {
  display: grid;
  gap: 8px;
}

.console-topbar-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.topbar-metric {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  background: var(--bg-0);
}
```

- [ ] **Step 4: Run the build to verify the shell still compiles**

Run:

```bash
npm run build
```

Expected:

- TypeScript completes successfully
- Vite build completes successfully

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "feat: simplify operator console shell"
```

---

### Task 2: Recompose The Workspace Into Queue + Canvas + Actions Rail

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Test: `npm run build`

- [ ] **Step 1: Convert the current workspace into one dominant center canvas**

In `src/App.tsx`, keep the left queue panel, but simplify its rows and stop using it like a second dashboard. Then restructure the active workspace so the center column owns the main content and the permanent side column becomes actions only.

Use this target shape:

```tsx
<main className="console-grid">
  <aside className="console-panel queue-panel">
    {/* simplified queue */}
  </aside>

  <section className="console-panel workspace-panel">
    <div className="workspace-summary">
      <div>
        <p className="panel-kicker">Active workflow</p>
        <h2>{activeLead?.name ? `${activeLead.name} workflow` : activeScenario.title}</h2>
        <p className="stat-note">{activeLead?.nextAction ?? 'Select a lead to inspect workflow state.'}</p>
      </div>
      <div className="workspace-summary-meta">
        <span>{runtime.stepLabels[stepIndex]}</span>
        <span>{activeRoutingDecision.lane}</span>
        <span>{activeMetricValue}</span>
      </div>
    </div>

    <div className="workspace-body">
      <div className="workspace-canvas">
        {/* lifecycle/recovery-first content */}
      </div>
      <aside className="workspace-actions-rail">
        {/* context-aware actions only */}
      </aside>
    </div>
  </section>
</main>
```

- [ ] **Step 2: Make lifecycle and recovery the default center view**

Set the default workbench state in `src/App.tsx` so the center canvas opens in `recovery`, not `funnel`.

Change the state initialization to:

```tsx
const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>(
  persisted?.workbenchTab ?? 'recovery'
)
```

Then move the lifecycle strip and recovery content into the center canvas, ahead of transcript and payload detail.

Use this render order:

```tsx
<div className="workspace-canvas-scroll">
  <section className="lifecycle-strip" aria-label="Lead lifecycle graph">
    {/* lifecycle nodes */}
  </section>

  {workbenchTab === 'recovery' ? (
    <section className="stage-layout stage-layout-primary">
      {/* recovery-first state */}
    </section>
  ) : null}

  {workbenchTab === 'funnel' ? (
    <section className="stage-layout stage-layout-secondary">
      {/* transcript */}
    </section>
  ) : null}

  {workbenchTab === 'payload' ? (
    <section className="stage-layout stage-layout-secondary">
      {/* payload editor */}
    </section>
  ) : null}
</div>
```

- [ ] **Step 3: Turn the permanent right column into an actions rail**

Move the existing operator buttons out of the nested stage panels and into one dedicated actions rail in `src/App.tsx`.

Use this structure:

```tsx
<aside className="workspace-actions-rail">
  <section className="actions-rail-section">
    <p className="mini-label">Next actions</p>
    <div className="action-list">
      <button type="button" className="button button-primary" onClick={() => activeLead && handleLeadAction('recover', activeLead.id)}>
        Recover lead
      </button>
      <button type="button" className="button button-secondary" onClick={() => activeLead && handleLeadAction('route', activeLead.id)}>
        Reroute owner
      </button>
      <button type="button" className="button button-secondary" onClick={() => activeLead && handleLeadAction('checkout', activeLead.id)}>
        Queue checkout
      </button>
      <button type="button" className="button button-warning" onClick={() => activeLead && handleLeadAction('alert', activeLead.id)}>
        Send alert
      </button>
    </div>
  </section>
</aside>
```

- [ ] **Step 4: Add the new workspace layout CSS**

In `src/App.css`, add the new workspace composition:

```css
.console-grid {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
}

.workspace-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
}

.workspace-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 12px;
  min-height: 0;
}

.workspace-canvas,
.workspace-actions-rail {
  min-height: 0;
  border: 1px solid var(--line);
  background: var(--bg-0);
}
```

- [ ] **Step 5: Run the build to confirm the new render tree compiles**

Run:

```bash
npm run build
```

Expected:

- Build passes
- No TypeScript errors for moved handlers or removed blocks

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "feat: recompose operator workspace around actions"
```

---

### Task 3: Demote Secondary Detail And Reduce Visual Noise

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/index.css`
- Test: `npm run build`

- [ ] **Step 1: Simplify queue rows to emphasize state and next step**

In `src/App.tsx`, trim each queue row so it shows only the highest-signal content.

Replace the noisy row body with:

```tsx
<button
  key={lead.id}
  type="button"
  className={`queue-item ${isActive ? 'queue-item-active' : ''}`}
  onClick={() => handleLeadSelect(lead.id)}
>
  <div className="queue-item-topline">
    <strong>{lead.name}</strong>
    <span className="queue-priority">{lead.priorityBand}</span>
  </div>
  <p className="queue-item-stage">{lifecyclePhaseLabel(lifecyclePhase)}</p>
  <p className="queue-item-note">{lead.recommendedAction}</p>
</button>
```

Remove:

- extra chip groups
- redundant timeline-meta lines
- secondary explanatory copy that repeats the stage

- [ ] **Step 2: Move notes, replay, and systems detail out of the default open state**

In `src/App.tsx`, keep notes, replay, and systems content available, but collapse them behind tabs, drawers, or toggles.

Apply this pattern:

```tsx
const [secondaryPanel, setSecondaryPanel] = useState<'timeline' | 'notes' | 'systems' | null>(null)

<div className="workspace-secondary-tabs">
  <button type="button" className={`tab-button ${secondaryPanel === 'timeline' ? 'tab-button-active' : ''}`} onClick={() => setSecondaryPanel('timeline')}>
    Timeline
  </button>
  <button type="button" className={`tab-button ${secondaryPanel === 'notes' ? 'tab-button-active' : ''}`} onClick={() => setSecondaryPanel('notes')}>
    Notes
  </button>
  <button type="button" className={`tab-button ${secondaryPanel === 'systems' ? 'tab-button-active' : ''}`} onClick={() => setSecondaryPanel('systems')}>
    Systems
  </button>
</div>
```

Do not render the old always-open systems rail by default.

- [ ] **Step 3: Reduce chip, badge, and decorative status density in CSS**

In `src/App.css`, stop giving every piece of state a pill or badge treatment.

Update these selectors:

```css
.status-pill,
.score-badge,
.stage-badge,
.tag {
  min-height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 0.7rem;
}

.queue-item-stage,
.workspace-summary-meta,
.mini-label {
  color: var(--text-dim);
}

.queue-item-note {
  color: var(--text-main);
}
```

Also remove unused styles for the deleted or demoted blocks:

- `.header-strip`
- `.command-bar`
- `.systems-panel`
- `.scenario-replay-band` if replay is moved into a secondary surface

- [ ] **Step 4: Tighten the global shell spacing only where needed**

In `src/index.css`, keep the dark theme, but reduce the tendency for panels to feel overpadded or visually flat.

Use only minimal token changes:

```css
:root {
  --radius-outer: 8px;
  --radius-inner: 6px;
  --shadow-panel: 0 2px 10px rgba(0, 0, 0, 0.14);
}

#root {
  padding: 10px;
}
```

Do not introduce gradients, glows, or decorative surface treatments.

- [ ] **Step 5: Run the build to verify the simplified UI compiles**

Run:

```bash
npm run build
```

Expected:

- Build passes
- Removed blocks do not leave dead references behind

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.css src/index.css
git commit -m "feat: prioritize high-signal workflow detail"
```

---

### Task 4: Fix Overflow Ownership And Responsive Behavior

**Files:**
- Modify: `src/App.css`
- Modify: `src/App.tsx`
- Test: `npm run build`
- Test: manual browser verification at `http://localhost:5173`

- [ ] **Step 1: Give the center workflow one explicit scroll owner**

In `src/App.tsx`, wrap the center workflow content in a dedicated scroll container.

Use:

```tsx
<div className="workspace-canvas">
  <div className="workspace-canvas-scroll">
    {/* lifecycle + active tab content */}
  </div>
</div>
```

Do not leave scroll responsibility split across:

- `workspace-panel`
- `stage-layout`
- `stage-panel-primary`
- nested content blocks

- [ ] **Step 2: Update CSS so nested panels can shrink without overlap**

In `src/App.css`, add explicit min-height and overflow rules:

```css
.workspace-canvas,
.workspace-canvas-scroll,
.stage-layout,
.stage-stack,
.stage-panel,
.stage-panel-primary {
  min-height: 0;
}

.workspace-canvas-scroll {
  height: 100%;
  overflow: auto;
  padding-right: 4px;
}

.stage-layout {
  height: auto;
  overflow: visible;
}

.stage-panel-primary {
  overflow: visible;
}
```

This is the core fix for the current “cannot scroll active workflow” and “overlap happening again” behavior.

- [ ] **Step 3: Make the actions rail compact instead of scroll-heavy**

Add CSS:

```css
.workspace-actions-rail {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 12px;
  overflow: hidden;
}

.action-list {
  display: grid;
  gap: 8px;
}
```

The rail should not become a second long diagnostic stack.

- [ ] **Step 4: Adjust mobile and narrow-width breakpoints to preserve the primary path**

In the responsive section of `src/App.css`, stack the layout in this order:

```css
@media (max-width: 1080px) {
  .console-grid,
  .workspace-body,
  .console-topbar,
  .console-topbar-metrics {
    grid-template-columns: 1fr;
  }

  .workspace-actions-rail {
    order: 3;
  }

  .workspace-canvas {
    order: 2;
  }

  .queue-panel {
    order: 1;
  }
}
```

On narrow widths, the workflow canvas must still appear before the actions rail.

- [ ] **Step 5: Run build and manual layout verification**

Run:

```bash
npm run build
```

Then manually verify in the browser:

1. Open `http://localhost:5173`
2. Log in if required
3. Select a live lead
4. Confirm the center workflow scrolls
5. Confirm no content overlaps the notes or secondary panels
6. Confirm the queue and center canvas scroll independently

Expected:

- No overlap
- No trapped content
- Default center path remains readable

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "fix: stabilize workflow scroll and overflow boundaries"
```

---

### Task 5: Final Verification And Regression Check

**Files:**
- Modify: none unless verification finds issues
- Test: `npm run build`
- Test: `npm run test:backend`
- Test: `npm run test:http`

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected:

- Vite build succeeds

- [ ] **Step 2: Run backend smoke tests**

```bash
npm run test:backend
```

Expected:

- Smoke suite passes

- [ ] **Step 3: Run HTTP smoke tests**

```bash
npm run test:http
```

Expected:

- HTTP smoke suite passes

- [ ] **Step 4: Manually verify the time-saved operator loop**

Check these flows in the browser:

1. Pick a lead from the queue
2. Read the blocker/current branch from the center workspace
3. Trigger one action from the actions rail
4. Confirm the visible state updates without hunting

Also verify:

- Recovery is the default center view
- Timeline and notes are secondary, not dominant
- The UI feels like an orchestration tool instead of a dashboard

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.css src/index.css
git commit -m "style: finalize operator console redesign"
```

---

## Self-Review

### Spec coverage

- Simplified top bar: covered in Task 1
- Compact triage queue: covered in Task 2 and Task 3
- Lifecycle/recovery-first center canvas: covered in Task 2
- Actions rail: covered in Task 2
- Secondary tabs/drawers for notes/timeline/systems detail: covered in Task 3
- Explicit overflow handling and no overlap: covered in Task 4
- Verification around speed and regressions: covered in Task 5

### Placeholder scan

No `TODO`, `TBD`, or deferred “write tests later” language remains.

### Type consistency

- `workbenchTab` remains `WorkbenchTab`
- new secondary panel state is explicitly typed
- existing action handlers are reused instead of renamed

