---
doc: prd
status: draft
execution: authorized-under-delegation
---
# MatchDesk product definition
Agent implementation choices under explicit participant direction. Source: scope.md > The Core Loop / The POC Boundary.

## The Core Journey
1. Open a complete fictional review workspace immediately; sample label is persistent.
2. Select an incoming payment. See its amount, original row and selected matching customer.
3. Compare exact candidate invoice groups. Multiple groups are labeled ambiguous, never chosen automatically. No candidates remain unresolved.
4. Read a sample remittance or add your own evidence note; select an allocation and acknowledge payer/remittance review before confirming.
5. See the payment marked Reviewed in this workspace. Other payments recompute without reserved invoices. Undo releases them and records the event.
6. Export a CSV of proposed allocations or a complete JSON review report.

## Screens and Layout
One custom browser workspace: dark navigation rail, header/actions, four computed summary tiles, payment queue, central allocation/evidence area and right-hand decision inspector. Table overlays show all source rows. Import dialog has two file pickers, header mapping dropdowns, previews and a commit action. No setup questionnaire or generic chat interface.

## Look and Feel
Warm white, ink navy and teal. Amounts align and have clear currency labels. Status uses text plus color. Large clickable rows/cards, responsive stacked panels, keyboard-native buttons, visible focus, correctly labeled dialogs and fields. Details are revealed on demand. No external fonts, trackers or network UI dependencies.

## Features and Behavior
### Imports
UTF-8/BOM CSV, comma separator, quoted fields supported. User previews exact header mappings before replacing session data. Required invoice fields: id/customer/currency/amount; payment fields: id/currency/amount, optional customer/reference. Errors include source row; no silently skipped malformed rows or partial import. Reject duplicate IDs, invalid/negative/overprecision amounts, unsupported currencies, oversized files/too many rows. Preserve original CSV SHA256 and row numbers. Imported text is rendered as text, never HTML.
### Matching
Exact integer cents. User-selected customer and exact currency restrict candidates; unknown customer must be assigned, not inferred. Exhaustively search at most 16 eligible invoices, retain candidate counts and mark capped results honestly. One arithmetic candidate is a suggestion, not a verified payment. Multiple candidates require a decision. Exact invoice references are evidence displayed to the reviewer, not an override of arithmetic or reservation checks.
### Understand the first decision
An opt-in inline guide explains the fictional 200 payment, defines invoice/remittance in plain language, leads to the real evidence dialog, and asks the user to select and acknowledge their own choice. It derives progress from actual saved evidence/selection/decision, never timer animations. Exit preserves all data; importing real files hides the fictional guide. Reviewed examples can be inspected without resetting them.
### Compare consequences before confirmation
Each selected allocation reveals a payment-to-invoices diagram, equation, exact customer/currency scope, saved-note reference count and original invoice CSV records. An automatic read-only scenario applies the actual approval rules to a copy and compares other payments' candidate counts/statuses. No reservation, history, revision or dataset changes occur. Late responses cannot replace a newer selection. Missing evidence and preview failures are explicit; no identity or certainty score is invented. After an actual confirmation, show observed changes with navigation to affected payments. Undo recomputes availability.
### Decisions and corrections
Selected payment/allocation buttons retain focus after re-rendering. If a reviewer edits evidence while an earlier save is pending, the newer draft remains visible and confirmation is blocked until that draft is explicitly saved.
Select a candidate and acknowledge review. Server revalidates current revision, amount, customer, currency and invoice availability. No invoice reused across reviewed payments. Evidence note and event history remain in session. Scope/evidence changes to reviewed payments require undo first. Stale simultaneous decisions fail with a refresh action. Confirmations affect this workspace only. Undo is recorded. No accounting system or bank is updated.
### Exports and privacy
CSV contains proposed allocations and reviewer notes with spreadsheet-formula prefixes neutralized. JSON preserves exact IDs, source hashes, original row references, decision history and limitations. Data lives only in app process memory until reset/session expiry/server restart. A hosted instance would receive uploads; do not call server processing browser-only. No automatic external uploads or AI inference. Downloads intentionally persist.

## Acceptance Criteria
Fictional 200 payment shows 200 versus 75+125 groups. Actual sample evidence names the pair. Confirmation reserves only selected invoice IDs. Undo restores them. Missing customer/unmatched/over-limit remain unresolved. Imports either succeed completely or leave existing data unchanged. Reset clears decisions. No action claims a real payment or an externally posted entry.

## Deferred and Non-Goals
No mobile-native app, accounts, live banking, bookkeeping advice, OCR, partial/fee/FX allocation, automated matching approvals or measured commercial impact. Genuine usability/viewport review and participant-authored final materials remain pending until actually completed.
