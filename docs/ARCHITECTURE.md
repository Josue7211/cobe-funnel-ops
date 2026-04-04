# Architecture

## Summary

The app is a single frontend repo with one shared domain model and three operator-facing modules.

This keeps the demo coherent:

1. DM conversations generate lead state
2. lead state drives booking and recovery state
3. both feed the dashboard and event log

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

## Shared entities

- `Lead`
- `Conversation`
- `Booking`
- `AutomationRule`
- `EventLogItem`
- `RevenueMetric`
- `CapiEvent`

## Why this shape

The job is not asking for a flashy consumer app. It is asking for systems that make creators money and make the internal team faster. A single operator console is the strongest way to show that.
