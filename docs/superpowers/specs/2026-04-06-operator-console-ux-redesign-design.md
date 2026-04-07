# Operator Console UX Redesign

Date: 2026-04-06
Project: COBE Funnel Ops
Scope: Operator console information architecture, layout hierarchy, overflow behavior, and action prioritization

## Goal

Redesign the operator console so it saves company time by making cross-system orchestration faster. The product should optimize for moving a lead through integrated systems with less scanning, less hunting, and fewer clicks.

The redesign is not a visual polish pass. It is a workflow speed pass.

The interface must answer three questions immediately:

1. Where is the lead across systems?
2. What is blocked, failing, or waiting?
3. What should the operator do next?

## Product Principle

The app exists to integrate multiple systems into one operating surface that saves time. The UI should optimize for orchestration speed rather than dashboard completeness, inspection depth, or visual density.

Anything that does not directly help an operator understand cross-system state or take the next high-confidence action should be secondary by default.

## Chosen Direction

Lock the redesign to:

- Layout A shell
- Compact left queue
- Lifecycle and recovery-first center canvas
- Actions rail on the right side of the active workflow
- Secondary tabs or drawers for timeline, notes, proof, payload details, and diagnostics

This direction was chosen because it preserves throughput while making the primary workflow area dominant.

## Layout Architecture

### Top Bar

Replace the current heavy header with a calm system bar.

The top bar should contain only:

- Product title
- Minimal live system status
- A few real KPIs that help triage
- Global actions such as run test, export, logout

The top bar should not contain:

- Large stat-card grids
- Competing walkthrough surfaces
- Dense clusters of equal-weight controls
- Decorative copy that pushes the work area down

### Left Queue

The left column remains visible and operational.

Purpose:

- Fast lead switching
- Triage by stage, blocker, or next step
- Maintain operator throughput across multiple leads

Each queue row should show only:

- Lead identity
- Current stage or branch
- Most important blocker or next action
- One priority signal

Each queue row should not show:

- Multiple decorative pills
- Repeated metadata lines
- Low-signal labels that slow scanning

### Center Workspace

The center area becomes the dominant surface in the product.

It should contain:

- A compact lead summary strip
- The primary lifecycle and recovery canvas
- A secondary tab layer for transcript, payloads, and audit detail

Default center view:

- Lifecycle and recovery state

Rationale:

- Recovery, retries, and handoffs are where operator time is usually lost
- This view best exposes integration dependencies and blocked states
- It keeps the product focused on orchestration outcomes

### Right Actions Rail

The right side of the active workflow becomes an actions rail.

Purpose:

- Reduce decision-to-action time
- Surface the next high-confidence operator moves without forcing mode switches

Examples of actions:

- Retry failed step
- Send recovery action
- Reroute owner
- Advance handoff
- Send alert
- Log note

The actions rail should be short and opinionated. It should not become a general-purpose information rail or a systems dump.

## Information Hierarchy

The visual order should be:

1. Selected lead and current orchestration state
2. Cross-system blocker, branch, or failure
3. Next recommended action
4. Supporting context
5. Historical detail and proof artifacts

This means:

- Timeline is secondary
- Notes are secondary
- Proof snippets are secondary
- Metrics are secondary
- System diagnostics are secondary unless they block the current lead path

## Scroll and Overflow Model

The redesigned workspace must have explicit overflow boundaries.

Rules:

- The queue scrolls independently
- The center workflow area owns the primary scroll region
- The actions rail should stay compact and avoid becoming a second large scroll surface
- Nested competing scroll regions inside the main workflow should be avoided

Required outcome:

- No overlapping panels
- No trapped content below the fold
- No center-column sections fighting for height inside the same grid without shrink boundaries

## Component Boundaries

### Queue List

Responsibility:

- Lead selection and triage

Must not become:

- A mini-dashboard
- A second workflow canvas

### Workflow Canvas

Responsibility:

- Show the live integrated state for the selected lead
- Explain what happened, what is blocked, and what comes next

Must prioritize:

- Lifecycle state
- Recovery branch state
- Active blocker or pending handoff

### Actions Rail

Responsibility:

- Surface time-saving actions tied to the selected state

Must not include:

- Passive diagnostic content as default
- Large audit dumps
- Generic button grids disconnected from live state

### Secondary Views

Secondary views should be reachable via tabs, drawers, or explicit drill-downs:

- Transcript
- Payload editor
- Timeline
- Notes
- Proof pack artifacts
- Full diagnostics

These views remain important, but they must not dominate the default workflow path.

## Data Model Expectations

Visible workflow state should continue to read from one shared integration event model.

The UI should act as a projection over shared cross-system events rather than a collection of isolated widgets.

The center workspace should derive:

- Current lifecycle stage
- Failure or waiting state
- Recommended next actions
- Relevant supporting context

When an operator triggers an action, the resulting mutation should feed back into the same shared state model so the UI can update in one place.

## Interaction Model

The primary interaction loop should be:

1. Select lead
2. Read blocker or current branch
3. Trigger next action
4. See updated state immediately

The default screen should minimize:

- Scrolling to find the main action
- Scanning multiple unrelated panels
- Interpreting redundant badges
- Jumping between separate surfaces to understand one lead

## Visual Direction

The redesign should follow a restrained operational UI style.

Use:

- Clear panel hierarchy
- Tight but readable spacing
- Stronger typography hierarchy
- Fewer chips and status pills
- Real contrast between primary and secondary surfaces

Avoid:

- Equal-weight panels everywhere
- Decorative dashboard chrome
- Badge spam
- Oversized header treatments
- Right-side rails that compete with the center workspace

## Error Handling

Failures should be operational, not cosmetic.

If an integration fails, the default view should show:

- What failed
- What downstream state is blocked
- Whether the issue is retryable
- Which action can unblock it

Detailed payloads and raw traces can exist behind drill-downs, but the main workflow should prioritize unblocking work over explaining internals.

## Testing Requirements

Verification should focus on operator speed and workflow clarity, not only rendering.

Minimum checks:

- Center workflow scrolls correctly without overlap
- Queue scroll is independent
- Only one primary workflow scroll region exists
- The default view opens on lifecycle and recovery state
- The actions rail always shows state-relevant actions
- Lead switching does not break layout or scroll behavior

Regression paths to verify:

- DM intake
- Booking update
- No-show recovery
- Payment handoff
- Retry and replay flows

## Success Criteria

The redesign is successful when:

- An operator can identify the selected lead's cross-system state at a glance
- The current blocker or waiting state is obvious
- The next operator action is visible without hunting
- The app feels like an orchestration tool first and a dashboard second
- The new layout removes the current overlap and scroll failures

## Out of Scope

This redesign does not include:

- New integration breadth
- New backend orchestration features
- A brand redesign
- Interview-mode storytelling expansion

This pass is strictly about making the existing integration-heavy product faster and clearer to operate.

## Recommendation

Proceed with implementation of:

- Simplified top bar
- Compact triage queue
- Dominant lifecycle and recovery workspace
- Actions rail
- Secondary detail tabs and drawers
- Explicit overflow and height handling in the center workspace

This is the highest-leverage redesign for reducing operator time spent coordinating work across integrated systems.
