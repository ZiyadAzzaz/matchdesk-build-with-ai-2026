---
doc: spec
status: draft
execution: authorized-under-delegation
---
# Technical blueprint

## How This Works, In Plain Language
The browser shows a custom review desk. A small Python server reads the two CSVs into memory and computes invoice combinations using exact cents. Every confirmation is checked again against the current invoice reservations. The screen and exports come from the same session data. Nothing is posted to a bank or accounting system.

## Stack and Where It Runs
Python 3.11, [Starlette](https://www.starlette.io/) 1.8.0 and [Uvicorn](https://www.uvicorn.org/) 0.54.0; standard dataclasses/csv/decimal; custom HTML/CSS/JavaScript without a build step. This agent-chosen stack allows more control of the experience than the previous stock forms. Start `python -m matchdesk` from this folder; open http://127.0.0.1:8503. No API keys or runtime network dependencies. Local only by default.

## Components
### Parsing and engine
Implements PRD > Imports / Matching. Strict UTF-8 CSV and explicit column maps; atomic dataset validation; integer cents; exhausted bounded subset search; source provenance. No silent row loss or customer fuzzy matching.
### Review state
Implements PRD > Decisions and corrections. Per-session dataset, revision, decisions, notes, customer scopes and append-only events in memory. Revision required on mutations; all confirmations checked server-side. Undo releases reservations. No persistent database. Random HttpOnly SameSite session cookie, expiry and session cap. Local-origin checks on mutation requests; resource limits. Not a public hostile-upload financial service.
`Review.preview_impact` deep-copies the session, uses the same `approve` method, and returns differences in other payments' candidate counts/statuses. It does not mutate the original session. Limits, scope and reservation rules apply to previews too.
### API
GET /api/state; POST /api/demo; POST /api/preview and /api/import (CSV strings + explicit maps); POST /api/scope, /api/evidence, /api/approve, /api/undo; GET /api/export.json and /api/export.csv; GET /health. JSON mutations limited in size; errors return actionable JSON without logging upload bodies. Static source never contains user data. No third-party endpoints.
POST /api/impact accepts the current version, payment ID and invoice IDs; returns a preview-only result with affected payments. It checks the revision and returns 409 on stale state, without writing a decision or advancing the version.
### Review desk
Implements PRD > Screens and Layout. `static/index.html`, `styles.css`, `app.js`: native controls/dialogs, payment filters/search, allocation cards, inspector, import preview/mapping, source-table dialog, report downloads. DOM textContent for input values. Responsive grid and reduced-motion support. API errors retain visible prior data and enable retry.
`renderGuide` derives opt-in guide steps from actual review state. `renderChoice` draws the selected allocation and requests an impact preview, guarded by request sequence, selected IDs and version. `mutation` compares before/after state to display actual consequences. Stale-state recovery clears selection, acknowledgments and note drafts before rendering refreshed data. No new runtime dependency.

## Data Model
Invoice(id, customer, currency, cents, source row); Payment(id, imported customer, currency, cents, reference, source row). Session holds selected customer scopes, evidence notes, approved invoice-ID groups, monotonically increasing revision and audit events. Dataset fingerprints identify imported bytes. Review state resets on dataset replacement or reset; replacing data with reviewed decisions requires explicit dialog confirmation.

## File Structure
```
matchdesk/engine.py     # CSV and exact matching
matchdesk/review.py     # session decisions and exports
matchdesk/server.py     # local HTTP boundary
matchdesk/__main__.py   # startup
matchdesk/static/       # complete custom frontend
matchdesk/data/         # fictional CSVs/remittance
tests/                 # money/import/decision/API regressions
devpost/               # honest planning/review records
scripts/               # verification and release helpers
```

## Failure Modes and Verification
Ambiguous/no-match -> visible unresolved alternatives. >16 eligible invoices -> review limit, never unique. Bad imports -> atomic rejection. Reused invoice/stale version -> conflict response and refresh. Wrong customer -> explicit scope selection, never guessed. Process restart -> memory cleared and demo reloaded. Tests: real CSV examples, exact decimals, reservation/undo/concurrency, session isolation and export provenance. Frontend syntax and API workflow checked; visual browser review only when a supported connected browser is available.

## Decisions and Open Issues
Participant authorized the concept, separate backups and implementation. PRD/spec specifics are delegated agent choices, not personal approvals. No new personal learning goal or technical uncertainty was supplied. Existing products overlap; interface benefit and demand require real feedback. Official Skill Pack personal checkpoints and final submission writing remain unfinished. No publication or external messaging authorized.
