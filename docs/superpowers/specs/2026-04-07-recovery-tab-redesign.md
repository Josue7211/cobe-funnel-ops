# Recovery Tab Redesign

## Goal

Repair the `Recovery branch` tab so it optimizes for operator speed and company time saved. The screen should act like a recovery triage console, not a narrative dashboard.

## Current Problems

1. The main recovery stage model overflows its container and can render rows outside the visible panel.
2. The tab mixes recovery state with downstream onboarding/revenue state, causing contradictory signals like `Recovered` and `Won` being emphasized at the same time.
3. The right rail is too narrow and too tall, forcing summary cards and timeline content into a hard-to-scan vertical stack.
4. `Active automation trail` is positioned as the dominant remaining visible content near the bottom of the screen instead of supporting the operator’s primary decision.
5. Multiple status surfaces disagree: header badge, pipeline states, escalation badge, and proof cards can all describe different states.

## Product Principle

This tab should answer three operator questions in order:

1. What is the recovery status right now?
2. Who owns it and what happens next?
3. Is the recovery proof/event trail available if I need it?

Anything that does not support those three questions should be visually downgraded or moved lower on the page.

## Chosen Direction

Use the **wide console** layout:

- A wide left column for the recovery branch state model
- A compact right rail for routing and proof summaries
- A full-width automation trail below the main two-column layout

This direction is chosen because it produces the fastest scan path for operators and avoids the cramped vertical stacking that made the current redesign unusable.

## Layout Specification

### 1. Header

The recovery header should present a single current state, not a mixture of branch and downstream statuses.

Required header content:

- Lead name
- Primary status pill: `Recovered`
- Secondary metadata inline: slot, owner, lane
- One-line summary: `Recovered after no-show with one-click rebook`

Rules:

- Do not present `Won` as the primary visible state inside the recovery tab header
- Do not show escalation as active when recovery is already complete

### 2. Main Recovery Column

The left column is the primary operator surface.

It should contain a contained vertical stage model with these stages only:

- `Booked`
- `No-show`
- `Recovery`
- `Recovered`

Rules:

- Remove `Won` and `Rescheduled` from the main recovery-stage ladder on this tab
- Each stage row must remain inside the panel container with no overflow outside the bounding box
- Use consistent internal spacing and explicit container height behavior so rows expand the panel rather than escaping it
- Copy for each row must align with its state; for example, completed rows must not use “waiting” language

### 3. Right Summary Rail

The right rail should be narrow, but not so narrow that cards become tall text columns.

It should contain only compact summary modules:

- `Routing visibility`
- `Booking recovered`
- `Next action`

Rules:

- Remove the tall stacked message/event feed from the rail
- Keep card heights tight and scannable
- Show factual summary, not long narrative text
- If the current lead is recovered, replace `Escalation active` with a resolved or recovery-complete state

### 4. Automation Trail

`Active automation trail` should move below the main two-column layout and become a full-width supporting section.

Rules:

- Present it as a horizontal grid of compact event cards when there is room
- Fall back to a clean wrapped grid on smaller widths
- It should support verification, not dominate the screen

## State Model Rules

The recovery tab needs a tab-specific display model separate from downstream funnel progression.

Display rules:

- `Recovered` is the terminal visible state for this tab
- `Won` may exist in underlying data, but it must not become the highlighted state in the recovery-stage ladder
- If booking status is `recovered`, the tab’s primary badge, ladder highlight, and summary proof card must all agree
- If recovery is complete, escalation indicators must resolve to a non-alert state

## Copy Rules

- Use short operator-facing labels
- Remove waiting language from completed states
- Sidebar cards should summarize proof, ownership, and next action in one or two lines maximum
- Avoid onboarding/payload language inside the recovery playbook unless the operator explicitly navigates to a downstream workflow tab

## Responsive Behavior

Desktop:

- Two-column layout with dominant left column and compact right rail
- Automation trail below both columns

Tablet and smaller:

- Main recovery state first
- Summary cards second
- Automation trail last

In all breakpoints:

- No stage row may render outside the main panel
- No card should collapse into an unreadable narrow text stack

## Implementation Scope

This redesign should stay focused on the recovery tab only.

In scope:

- Recovery tab structure in `src/App.tsx`
- Recovery-related CSS/layout in `src/App.css`
- Recovery-specific status derivation and label rules needed for consistent display

Out of scope:

- Full dashboard redesign
- Changes to unrelated tabs
- Backend data model changes unless the frontend cannot derive the required display state without a small helper

## Success Criteria

The redesign is successful when:

1. The recovery tab no longer overflows its main stage panel
2. The screen has one unambiguous primary state: `Recovered`
3. The right rail is compact and readable
4. `Active automation trail` supports the page instead of dominating it
5. Operators can identify current state, owner, and next action within one screen scan
