# Architecture

## Summary

The app is a single repo with a React frontend and a small SQLite-backed Express API. The shared domain model keeps the operator surface coherent instead of splitting state across disconnected mocks.

This keeps the demo coherent:

1. DM conversations generate lead state
2. lead state drives booking and recovery state
3. webhook validation and live test runs write to SQLite
4. the dashboard reads the SQL snapshot instead of stale hardcoded stats

## Modules

### DM Sprint Funnel

- inbox-style conversation view
- intent score
- lead tags
- checkout handoff
- automation result summary

### No-Show Recovery

- booking state
- owner routing
- no-show tagging
- recovery actions

### Revenue Dashboard

- daily KPIs
- funnel conversion metrics
- event log
- Meta CAPI-ready naming table

### Rule Lab

- editable automation rules
- per-rule test status
- operator-visible outcomes

### Connector Lab

- relay cards for Zapier/Make/GHL/Stripe/Slack/Sheets
- connector status and run counts

### Operator Audit

- searchable execution trail
- webhook, rule, connector, and note events

### Live Test Runs

- SQL-backed scenario runs
- payload validation and relay routing
- connector status updates from live test execution

## Shared entities

- `Lead`
- `Conversation`
- `Booking`
- `AutomationRule`
- `EventLogItem`
- `RevenueMetric`
- `CapiEvent`
- `LiveTestRun`

## Why this shape

This system is not a flashy consumer app. It is an internal console that keeps funnel state, recovery actions, tracking evidence, and live test runs in one place for the team running creator offers.
