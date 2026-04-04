# Loom Script

## Goal

Record a 2 to 3 minute walkthrough that sounds like an operator explaining a revenue-facing system, not a developer narrating a UI.

## Script

### Open

Hi, I am Josue. For this application I built a compact creator funnel ops demo based directly on your job post: a ManyChat-style DM sprint funnel, GHL-style call routing and no-show recovery, and a revenue dashboard with CAPI-ready server events.

### Scenario 1

First, this is the hot-lead DM path.

The lead comes in through Instagram DM asking for price. The system classifies intent, applies the right tags, and sends a Stripe checkout handoff. On the right you can see the lead profile, owner, tags, and next action. The event log captures every step so ops can debug and report on the funnel cleanly.

### Scenario 2

Second, this is the consult and no-show recovery path.

If a lead asks for a call, the system routes them to the right closer, starts reminders, and if they miss the call, flips them into a no-show recovery branch automatically. That is visible here in the recovery module. This is the kind of leakage I would want to close quickly because it directly affects revenue.

### Dashboard

At the bottom is the reporting layer. It shows influenced revenue, show rate, recovery rate, and CAPI-ready event naming for `Lead`, `Schedule`, and `Purchase`. I kept the integrations low-cost for the interview, but the logic is structured so it can map cleanly to Stripe, ManyChat, GHL, and Meta server events.

### Close

If I joined, the first week I would focus on tightening the DM funnel, standardizing no-show recovery, and standing up a daily revenue dashboard so the team can see exactly what is working and where revenue is leaking.
