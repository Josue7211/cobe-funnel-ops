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

This system is not a flashy consumer app. It is an internal console that keeps funnel state, recovery actions, and tracking evidence in one place for the team running creator offers.
