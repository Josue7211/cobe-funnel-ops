---
phase: 04-daily-revenue-command-center
plan: 02
subsystem: ui
tags: [react, attribution, meta-capi, ghl, connectors]
requires:
  - phase: 04-daily-revenue-command-center
    provides: daily revenue summary surface
provides:
  - connector health visibility for Stripe-adjacent automation
  - source-mix reporting for the live queue snapshot
  - a readable daily connector health view for Meta CAPI, GHL, and related relays
affects: [metrics, reporting, connectors]
tech-stack:
  added: []
  patterns: [source mix, connector health, replayable actions]
key-files:
  created: []
  modified: [src/App.tsx, src/App.css]
key-decisions:
  - "Surface the source mix and connector health together so attribution and delivery can be checked in the same pass."
  - "Use the live report snapshot rather than a fake chart or a second reporting store."
patterns-established:
  - "The dashboard can answer 'where did this come from' and 'is the delivery path healthy' in one place."
requirements-completed: [REV-02, ATTR-01]
duration: 18 min
completed: 2026-04-05
---

# Phase 04 Plan 02: Attribution and event-health summary

## Accomplishments
- Added source-mix rows from the live report snapshot so the dashboard shows where the queue is coming from.
- Added connector-health rows with status and ping actions so the operator can inspect relay health from the same revenue view.

## Verification
- `npm run build` — passed
- `npm run test:http` — passed

