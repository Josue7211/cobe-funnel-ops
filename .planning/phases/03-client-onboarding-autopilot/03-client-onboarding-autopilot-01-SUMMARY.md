---
phase: 03-client-onboarding-autopilot
plan: 01
subsystem: ui
tags: [react, onboarding, proof, metrics]
requires:
  - phase: 02-ghl-call-routing-and-no-show-recovery
    provides: consult and payment-backed live runtime state
provides:
  - onboarding run records in the client snapshot state
  - a visible onboarding proof panel with folder, SOP, and invite URLs
  - a retry action that reuses the existing onboarding provision contract
affects: [metrics, operator-shell, onboarding]
tech-stack:
  added: []
  patterns: [snapshot-threaded onboarding runs, proof-panel operator surface]
key-files:
  created: []
  modified: [src/App.tsx, src/App.css, src/api.ts, src/types.ts]
key-decisions:
  - "Use the existing onboarding provision endpoint as the retry path."
  - "Surface onboarding proof directly in the metrics rail so it is visible during demos."
patterns-established:
  - "Onboarding proof is driven by live snapshot data instead of an isolated static widget."
  - "The operator can show folder, SOP, and invite links without leaving the console."
requirements-completed: [ONB-01]
duration: 21 min
completed: 2026-04-05
---

# Phase 03 Plan 01: Onboarding proof-surface summary

## Accomplishments
- Threaded onboarding runs through the client snapshot state so provisioning data survives bootstrap and refreshes.
- Added a dedicated onboarding proof panel to the metrics rail showing run status plus folder, SOP, and invite URLs.
- Added a retry control that reuses the current onboarding provisioning action for the active lead.

## Verification
- `npm run build` — passed

## Notes
- The onboarding proof panel now gives a real interview-demo path instead of only showing a metric count.
