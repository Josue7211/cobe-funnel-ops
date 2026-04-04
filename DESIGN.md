# COBE Funnel Ops Design System

## Direction

- Personality: Retro-futurist operator console
- Product type: Internal revenue operations tool
- Reference mode: `Precision & Density` from `interface-design`, adapted for creator funnel workflows
- Visual promise: Feels like a real console an operator runs all day, not a pitch deck or AI mockup

## Design Rules

- One dominant workspace. The active lead and current workflow always own the center of the screen.
- Borders over blobs. Use edge highlights and panel seams instead of stacked shadow cards.
- Color must mean something.
- Dense, readable typography. No decorative serif hero text.
- Every panel needs a job. If a panel does not help an operator decide or act, remove it.
- No page scrolling on desktop. Internal panes may scroll.

## Layout

- Global frame: fixed-height desktop console
- Left rail: queue and lead selection
- Center stage: active workflow, transcript, payloads, notes
- Right rail: relays, audit, automation, metrics
- Header: command strip plus key system telemetry

## Typography

- Display: narrow grotesk/sans, uppercase when needed
- Body: clean sans
- Data, labels, timestamps: mono
- Headline sizes are restrained; hierarchy comes from contrast and spacing, not giant type

## Spacing

- Base scale: 4, 8, 12, 16, 24, 32
- Button height: 36px
- Rail/header padding: 16px
- Stage panel padding: 20px
- Radius scale: 10px outer, 8px inner

## Color Semantics

- Canvas: blue-black
- Queue / active routing: cyan
- Healthy / delivered / ready: green
- Revenue / tests / priority: amber
- Recovery / alerts / high risk: red
- Meta / automation intelligence: magenta
- Muted information: slate

## Surface Strategy

- Base depth uses subtle tonal shifts, not large shadows
- Main panels get a top edge highlight in their semantic color
- Interactive blocks use slightly brighter surface values than passive blocks
- Avoid isolated floating cards unless they contain a direct action or record

## Motion

- Use restrained transitions only for hover, active selection, and status changes
- No decorative motion unless it clarifies state

## Anti-Patterns

- No giant serif headline hero
- No pill spam
- No random gradients as the main visual idea
- No equal-weight dark cards filling the viewport
- No long scroll deck on desktop
