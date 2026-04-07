# Recovery Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `Recovery branch` tab into a fast operator console with one clear `Recovered` state, a contained recovery ladder, a compact right rail, and a full-width automation trail below the main layout.

**Architecture:** Extract recovery-specific display rules into a small pure helper module so the tab’s status model is consistent and testable, then refactor the recovery JSX to consume that view model and pair it with a narrower CSS redesign scoped to the recovery tab. Keep all runtime and data-fetching behavior in place; only the recovery display model, markup structure, and layout rules change.

**Tech Stack:** React 19, TypeScript, Vite, CSS, Vitest for a focused pure-function test on recovery display logic

---

## File Structure

### Existing files to modify

- `package.json`
  Responsibility: add a narrow frontend test command for recovery display logic.
- `package-lock.json`
  Responsibility: lock the added test dependency.
- `src/App.tsx`
  Responsibility: stop deriving recovery-tab UI directly from generic funnel state, consume the new recovery display helpers, and render the approved wide-console layout.
- `src/App.css`
  Responsibility: replace the broken recovery tab layout rules with contained grid/flex styling for the new structure.

### New files to create

- `src/recoveryDisplay.ts`
  Responsibility: pure helper functions for recovery-tab state, header badge, ladder rows, routing summary badge, and automation-trail cards.
- `src/recoveryDisplay.test.ts`
  Responsibility: lock the recovery-tab display rules with focused tests.

## Task 1: Add Recovery Display Test Harness

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/recoveryDisplay.test.ts`

- [ ] **Step 1: Add the failing test file**

```ts
import { describe, expect, it } from 'vitest'
import { getRecoveryDisplayModel } from './recoveryDisplay'

describe('getRecoveryDisplayModel', () => {
  it('treats recovered bookings as a recovered recovery-tab state', () => {
    const model = getRecoveryDisplayModel({
      lead: {
        id: 'lead-003',
        name: 'Jade Porter',
        handle: '@jadeteaches',
        source: 'Lead form retargeting',
        offer: 'Subscription',
        stage: 'won',
        owner: 'Alex',
        tags: ['subscriber'],
        budget: '$97 monthly',
        nextAction: 'Trigger onboarding autopilot',
        lastTouch: '31 min ago',
      },
      booking: {
        id: 'book-003',
        leadId: 'lead-003',
        slot: 'Yesterday, 11:00 AM',
        owner: 'Alex',
        status: 'recovered',
        recoveryAction: 'Recovered after no-show with one-click rebook',
      },
      escalationSignalCount: 1,
    })

    expect(model.headerStatus).toBe('Recovered')
    expect(model.escalationLabel).toBe('Recovery complete')
    expect(model.pipeline.map((entry) => entry.label)).toEqual([
      'Booked',
      'No-show',
      'Recovery',
      'Recovered',
    ])
    expect(model.pipeline.find((entry) => entry.label === 'Recovered')?.state).toBe('active')
    expect(model.pipeline.some((entry) => entry.label === 'Won')).toBe(false)
  })

  it('removes waiting copy from completed no-show states', () => {
    const model = getRecoveryDisplayModel({
      lead: {
        id: 'lead-003',
        name: 'Jade Porter',
        handle: '@jadeteaches',
        source: 'Lead form retargeting',
        offer: 'Subscription',
        stage: 'won',
        owner: 'Alex',
        tags: ['subscriber'],
        budget: '$97 monthly',
        nextAction: 'Trigger onboarding autopilot',
        lastTouch: '31 min ago',
      },
      booking: {
        id: 'book-003',
        leadId: 'lead-003',
        slot: 'Yesterday, 11:00 AM',
        owner: 'Alex',
        status: 'recovered',
        recoveryAction: 'Recovered after no-show with one-click rebook',
      },
      escalationSignalCount: 1,
    })

    expect(model.pipeline.find((entry) => entry.label === 'No-show')?.summary).toBe(
      'Attendance miss recorded before the recovery branch was triggered.',
    )
  })
})
```

- [ ] **Step 2: Add the test script and dependency**

```json
{
  "scripts": {
    "test:recovery-ui": "vitest run src/recoveryDisplay.test.ts"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 3: Run install to update the lockfile**

Run: `npm install`
Expected: `added ... packages` and `package-lock.json` updates with `vitest`

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:recovery-ui`
Expected: FAIL with a module-resolution error for `./recoveryDisplay` or missing export `getRecoveryDisplayModel`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/recoveryDisplay.test.ts
git commit -m "test: add recovery display coverage"
```

## Task 2: Implement Recovery Display Helpers

**Files:**
- Create: `src/recoveryDisplay.ts`
- Test: `src/recoveryDisplay.test.ts`

- [ ] **Step 1: Write the minimal helper module to satisfy the failing tests**

```ts
import type { Booking, Lead } from './types'

type RecoveryDisplayInput = {
  lead: Lead | null
  booking: Booking | null
  escalationSignalCount: number
}

type RecoveryPipelineEntry = {
  label: 'Booked' | 'No-show' | 'Recovery' | 'Recovered'
  summary: string
  state: 'complete' | 'active' | 'upcoming'
}

type RecoveryDisplayModel = {
  headerStatus: 'Recovered' | 'Recovery active' | 'No-show' | 'Booked'
  escalationLabel: 'Recovery complete' | 'Escalation active' | 'No-show waiting'
  pipeline: RecoveryPipelineEntry[]
}

function normalizeBookingStatus(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/[_\\s]+/g, '-')
}

export function getRecoveryDisplayModel({
  lead,
  booking,
  escalationSignalCount,
}: RecoveryDisplayInput): RecoveryDisplayModel {
  const stage = lead?.stage ?? null
  const bookingStatus = normalizeBookingStatus(booking?.status)
  const isRecovered = bookingStatus === 'recovered'
  const isRecoveryActive = stage === 'recovery' || bookingStatus === 'no-show'
  const isNoShow = stage === 'no-show' || bookingStatus === 'no-show'
  const isBooked = Boolean(booking) || stage === 'booked'

  const headerStatus = isRecovered
    ? 'Recovered'
    : isRecoveryActive
      ? 'Recovery active'
      : isNoShow
        ? 'No-show'
        : 'Booked'

  const escalationLabel = isRecovered
    ? 'Recovery complete'
    : escalationSignalCount > 0
      ? 'Escalation active'
      : 'No-show waiting'

  return {
    headerStatus,
    escalationLabel,
    pipeline: [
      {
        label: 'Booked',
        summary: 'Booked consult and routed to the assigned closer.',
        state: isBooked ? 'complete' : 'upcoming',
      },
      {
        label: 'No-show',
        summary: isRecovered || isRecoveryActive
          ? 'Attendance miss recorded before the recovery branch was triggered.'
          : 'Waiting for attendance timeout before recovery escalation.',
        state: isNoShow || isRecoveryActive || isRecovered ? 'complete' : 'upcoming',
      },
      {
        label: 'Recovery',
        summary: isRecovered
          ? 'Recovery branch completed with proof and one-click rebook.'
          : isRecoveryActive
            ? 'No-show branch active with queued proof and rebook actions.'
            : 'Recovery branch not triggered yet.',
        state: isRecovered ? 'complete' : isRecoveryActive ? 'complete' : 'upcoming',
      },
      {
        label: 'Recovered',
        summary: isRecovered
          ? 'Lead converted from no-show through the recovery workflow.'
          : 'Rebook is pending if recovery follow-up succeeds.',
        state: isRecovered ? 'active' : 'upcoming',
      },
    ],
  }
}
```

- [ ] **Step 2: Run the targeted test to verify it passes**

Run: `npm run test:recovery-ui`
Expected: PASS with `2 passed`

- [ ] **Step 3: Expand the helper module for the JSX refactor**

```ts
export type RecoveryRailCard = {
  title: string
  tone: 'neutral' | 'success'
  eyebrow: string
  body: string
}

export type RecoveryDisplayModel = {
  headerStatus: 'Recovered' | 'Recovery active' | 'No-show' | 'Booked'
  statusTone: 'success' | 'warning' | 'neutral'
  summary: string
  escalationLabel: 'Recovery complete' | 'Escalation active' | 'No-show waiting'
  escalationTone: 'success' | 'critical' | 'watch'
  pipeline: RecoveryPipelineEntry[]
  railCards: RecoveryRailCard[]
}

export function getRecoveryDisplayModel({
  lead,
  booking,
  escalationSignalCount,
}: RecoveryDisplayInput): RecoveryDisplayModel {
  const stage = lead?.stage ?? null
  const bookingStatus = normalizeBookingStatus(booking?.status)
  const isRecovered = bookingStatus === 'recovered'
  const isRecoveryActive = stage === 'recovery' || bookingStatus === 'no-show'
  const isNoShow = stage === 'no-show' || bookingStatus === 'no-show'
  const isBooked = Boolean(booking) || stage === 'booked'
  const owner = booking?.owner || lead?.owner || 'Unassigned'
  const nextAction = booking?.recoveryAction || lead?.nextAction || 'Recovery workflow complete.'

  return {
    headerStatus: isRecovered ? 'Recovered' : isRecoveryActive ? 'Recovery active' : isNoShow ? 'No-show' : 'Booked',
    statusTone: isRecovered ? 'success' : isRecoveryActive || isNoShow ? 'warning' : 'neutral',
    summary: booking?.recoveryAction || 'Recovery workflow metadata is not yet available.',
    escalationLabel: isRecovered ? 'Recovery complete' : escalationSignalCount > 0 ? 'Escalation active' : 'No-show waiting',
    escalationTone: isRecovered ? 'success' : escalationSignalCount > 0 ? 'critical' : 'watch',
    pipeline: [
      {
        label: 'Booked',
        summary: `Booked consult and routed to ${owner}.`,
        state: isBooked ? 'complete' : 'upcoming',
      },
      {
        label: 'No-show',
        summary: isRecovered || isRecoveryActive
          ? 'Attendance miss recorded before the recovery branch was triggered.'
          : 'Waiting for attendance timeout before recovery escalation.',
        state: isNoShow || isRecoveryActive || isRecovered ? 'complete' : 'upcoming',
      },
      {
        label: 'Recovery',
        summary: isRecovered
          ? 'Recovery branch completed with proof and one-click rebook.'
          : isRecoveryActive
            ? 'No-show branch active with queued proof and rebook actions.'
            : 'Recovery branch not triggered yet.',
        state: isRecovered ? 'complete' : isRecoveryActive ? 'complete' : 'upcoming',
      },
      {
        label: 'Recovered',
        summary: isRecovered
          ? 'Lead converted from no-show through the recovery workflow.'
          : 'Rebook is pending if recovery follow-up succeeds.',
        state: isRecovered ? 'active' : 'upcoming',
      },
    ],
    railCards: [
      {
        eyebrow: 'Proof',
        title: 'Booking recovered',
        tone: 'success',
        body: booking?.recoveryAction || 'Recovery proof not yet captured.',
      },
      {
        eyebrow: 'Next action',
        title: 'Next operator step',
        tone: 'neutral',
        body: nextAction,
      },
    ],
  }
}
```

- [ ] **Step 4: Re-run the targeted test to confirm the extension did not regress**

Run: `npm run test:recovery-ui`
Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/recoveryDisplay.ts src/recoveryDisplay.test.ts
git commit -m "feat: add recovery display model helpers"
```

## Task 3: Refactor the Recovery Tab Markup

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/recoveryDisplay.ts`
- Test: `src/recoveryDisplay.test.ts`

- [ ] **Step 1: Import and memoize the new recovery display model**

```ts
import { getRecoveryDisplayModel } from './recoveryDisplay'
```

```ts
const recoveryDisplay = useMemo(
  () =>
    getRecoveryDisplayModel({
      lead: activeLead,
      booking: activeBooking,
      escalationSignalCount: noShowEscalationSignals.length,
    }),
  [activeLead, activeBooking, noShowEscalationSignals.length],
)
```

- [ ] **Step 2: Replace the recovery header and ladder with the recovery-specific model**

```tsx
{workbenchTab === 'recovery' ? (
  <div className="recovery-console">
    <div className="recovery-console-main">
      <section className="stage-panel stage-panel-primary recovery-primary-panel">
        <div className="recovery-header">
          <div className="recovery-header-copy">
            <p className="mini-label">Recovery state</p>
            <h3>{activeLead?.name ?? 'No live recovery state loaded'}</h3>
            <p className="timeline-meta">
              {[activeBooking?.slot, activeRoutingDecision.owner, activeRoutingDecision.lane].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className={`booking-status booking-status-${recoveryDisplay.statusTone}`}>
            {recoveryDisplay.headerStatus}
          </span>
        </div>

        <p className="booking-copy recovery-summary">{recoveryDisplay.summary}</p>

        <div className="pipeline-model recovery-pipeline">
          {recoveryDisplay.pipeline.map((entry) => (
            <article key={entry.label} className={`pipeline-state pipeline-state-${entry.state}`}>
              <div className="section-topline">
                <p className="pipeline-state-label">{entry.label}</p>
                <span className={`status-pill status-${entry.state}`}>{entry.state}</span>
              </div>
              <p className="booking-copy">{entry.summary}</p>
            </article>
          ))}
        </div>
      </section>
```

- [ ] **Step 3: Replace the current rail with compact summary cards and move the automation trail below**

```tsx
      <aside className="workspace-actions-rail recovery-summary-rail">
        <article className="stage-panel recovery-rail-panel">
          <div className="section-topline">
            <div>
              <p className="mini-label">Routing</p>
              <h3>Routing visibility</h3>
            </div>
            <span className={`signal-badge signal-${recoveryDisplay.escalationTone}`}>
              {recoveryDisplay.escalationLabel}
            </span>
          </div>
          <div className="routing-grid recovery-routing-grid">
            <article className="routing-card">
              <p className="mini-label">Owner</p>
              <p className="booking-copy">{activeRoutingDecision.owner}</p>
            </article>
            <article className="routing-card">
              <p className="mini-label">Lane</p>
              <p className="booking-copy">{activeRoutingDecision.lane}</p>
            </article>
            <article className="routing-card">
              <p className="mini-label">Rule</p>
              <p className="booking-copy">{activeRoutingDecision.ruleLabel}</p>
            </article>
          </div>
        </article>

        {recoveryDisplay.railCards.map((card) => (
          <article key={card.title} className="stage-panel recovery-rail-panel">
            <div className="section-topline">
              <div>
                <p className="mini-label">{card.eyebrow}</p>
                <h3>{card.title}</h3>
              </div>
            </div>
            <p className="booking-copy">{card.body}</p>
          </article>
        ))}
      </aside>
    </div>

    <section className="stage-panel recovery-automation-panel">
      <div className="section-topline">
        <div>
          <p className="mini-label">Triggered events</p>
          <h3>Active automation trail</h3>
        </div>
      </div>
      <div className="recovery-automation-grid">
        {(activeLeadTimeline.length ? activeLeadTimeline.slice(0, 3) : []).map((entry) => (
          <article key={entry.id} className="timeline-card">
            <div className="section-topline">
              <div>
                <p className="event-name">{entry.title}</p>
                <p className="timeline-meta">{entry.type} · {entry.timestamp}</p>
              </div>
              <span className={`event-status event-${entry.type}`}>{entry.type}</span>
            </div>
            <p>{entry.detail}</p>
          </article>
        ))}
      </div>
    </section>
  </div>
) : null}
```

- [ ] **Step 4: Run the targeted test again**

Run: `npm run test:recovery-ui`
Expected: PASS with `2 passed`

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/recoveryDisplay.ts src/recoveryDisplay.test.ts
git commit -m "feat: restructure recovery tab content"
```

## Task 4: Rebuild the Recovery Tab CSS

**Files:**
- Modify: `src/App.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the broken recovery layout container rules**

```css
.recovery-console {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.recovery-console-main {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(280px, 360px);
  gap: 12px;
  align-items: start;
  min-width: 0;
}

.recovery-primary-panel {
  overflow: hidden;
}

.recovery-summary-rail {
  width: auto;
  grid-auto-rows: max-content;
}
```

- [ ] **Step 2: Add header, ladder, and summary-rail styling that favors scan speed**

```css
.recovery-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
}

.recovery-header-copy,
.recovery-summary {
  min-width: 0;
}

.recovery-pipeline {
  gap: 10px;
}

.recovery-routing-grid {
  grid-template-columns: 1fr;
}

.recovery-rail-panel {
  gap: 10px;
}
```

- [ ] **Step 3: Move automation content into a bottom full-width grid and preserve responsive containment**

```css
.recovery-automation-panel {
  gap: 12px;
}

.recovery-automation-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 1200px) {
  .recovery-console-main {
    grid-template-columns: minmax(0, 1fr);
  }

  .recovery-routing-grid,
  .recovery-automation-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .recovery-header {
    grid-template-columns: minmax(0, 1fr);
  }

  .recovery-routing-grid,
  .recovery-automation-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Run lint and build to verify the refactor**

Run: `npm run lint && npm run build`
Expected: ESLint completes without errors and Vite prints `✓ built in ...`

- [ ] **Step 5: Manually verify the recovery tab in the browser**

Run: `npm run dev`
Expected:
- The recovery ladder stays inside its panel
- `Won` and `Rescheduled` no longer appear in the main recovery ladder
- The right rail stays compact
- `Active automation trail` appears below the main two-column layout

- [ ] **Step 6: Commit**

```bash
git add src/App.css src/App.tsx
git commit -m "style: redesign recovery tab layout"
```

## Task 5: Final Verification and Documentation Sync

**Files:**
- Modify: `docs/superpowers/specs/2026-04-07-recovery-tab-redesign.md`
- Modify: `docs/superpowers/plans/2026-04-07-recovery-tab-redesign.md`

- [ ] **Step 1: Re-run all required verification commands**

Run: `npm run test:recovery-ui && npm run lint && npm run build`
Expected:
- Vitest: PASS
- ESLint: no errors
- Vite: `✓ built in ...`

- [ ] **Step 2: Compare the shipped UI against the spec**

Checklist:
- Header primary badge reads `Recovered`
- Main ladder shows only `Booked`, `No-show`, `Recovery`, `Recovered`
- Recovery ladder rows are fully contained inside the panel
- Right rail contains compact summary cards only
- Automation trail is below the main layout

- [ ] **Step 3: Update the spec document with a short implementation note if the final UI required a minor wording adjustment**

```md
## Implementation Notes

- The recovery tab now uses a dedicated recovery display model in `src/recoveryDisplay.ts`
- The automation trail remains available in the recovery tab, but only as a supporting full-width section below the main operator decision area
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-07-recovery-tab-redesign.md docs/superpowers/plans/2026-04-07-recovery-tab-redesign.md
git commit -m "chore: finalize recovery tab redesign plan"
```
