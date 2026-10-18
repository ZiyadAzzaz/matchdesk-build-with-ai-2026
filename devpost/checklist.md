---
doc: checklist
status: draft
execution: authorized-under-delegation
---
# Build checklist
Fast mode explicitly requested. User authorized implementation; personal review is not fabricated. Official workflow is carried forward with delegated implementation instead of redundant interview pauses.

## Slices
- [x] **1. Review real computed alternatives in a running desk**
  Becomes usable: Fictional payments show computed invoice groups through the local API and custom workspace.
  Why now: Expose the actual ambiguous-match kernel before polish.
  PRD ref: `prd.md > Matching`, `prd.md > Screens and Layout`
  Spec ref: `spec.md > Parsing and engine`, `spec.md > Review desk`
  Build: Isolated project, official skills, sample CSVs, exact parser/matching and working frontend.
  Verify (mechanical): CSV/money/candidate tests, API state, frontend syntax and HTTP startup.
  Learner check: Open 8503 and compare the 200 versus 75+125 alternatives.
  Commit: `Build visual payment and invoice review desk`
- [x] **2. Confirm, correct and export without conflicting decisions**
  Becomes usable: Evidence, explicit review, reservations, undo and matching exports work together.
  Why now: Demonstrates a complete decision loop rather than a matching calculator.
  PRD ref: `prd.md > Decisions and corrections`, `prd.md > Exports and privacy`
  Spec ref: `spec.md > Review state`, `spec.md > API`
  Build: Review acknowledgments, optimistic revisions, no double allocation, evidence and exports.
  Verify (mechanical): End-to-end API loop, reservation conflicts/undo, stale revision, isolation and export safety.
  Learner check: Apply sample evidence, confirm the pair and inspect the resulting report.
  Commit: `Add evidence-backed review decisions and exports`
- [x] **3. Import own files and deliver a reproducible project**
  Becomes usable: Preview/mapping/import, source tables, launcher and documented release.
  Why now: Proves input behavior beyond the curated demo.
  PRD ref: `prd.md > Imports`, `prd.md > Acceptance Criteria`
  Spec ref: `spec.md > API`, `spec.md > Failure Modes and Verification`
  Build: Atomic import, accessible source/preview dialogs, responsive refinement, tests and release docs.
  Verify (mechanical): Invalid/mapped/quoted CSVs; clean environment; release archive and source backup integrity.
  Learner check: Load an export and identify any confusing or unsupported step.
  Commit: `Finish import workflow and reproducible handoff`

- [x] **4. Explain the first payment and preview consequences**
  Becomes usable: Guided example, allocation diagram, source/evidence checks, read-only consequences and observed results.
  Why now: Participant could not understand the project and requested the proposed interaction improvements.
  PRD ref: `prd.md > Understand the first decision`, `prd.md > Compare consequences before confirmation`
  Spec ref: `spec.md > Review state`, `spec.md > Review desk`
  Build: Guide, real-rules scenario endpoint, comparison panel, linked affected payments and stale-response protection.
  Verify (mechanical): Preview equals actual consequences without writes; invalid/stale/isolated requests; complete guide; rapid switching and delayed responses.
  Learner check: Use Guide me through it, compare both groups, inspect the consequences and explain the decision in your own words.
  Commit: `Explain payment choices with a guided review and consequence preview`

## Participant feedback
The participant said they did not understand the project and did not consider it strong enough to win. They authorized interactive improvements and delegated mechanical testing. This is actionable comprehension feedback, not acceptance, a user study or a completed personal walkthrough.

## Hands-on Checkpoints
- [ ] Participant explores the first usable desk and supplies feedback
- [ ] Final exploration completed

## Final Review
- [ ] Requested revisions verified and participant confirms ready

## Code Tour and App Map
- [x] Reference app map generated and checked
- [ ] Personal learning activity/reflection completed or declined
No personal activity or task-completion outcome is inferred from automated tests.

## Revisions
- The original import interaction allowed a click while a replacement file was still being read. File reads and previews now carry revisions; changed inputs invalidate preview and confirmation, and stale read results cannot replace newer files.
- Unsaved evidence notes survive candidate selection, and confirmation stays disabled until edited evidence is saved.
- Connected-browser discovery returned no available browser. DOM interaction tests exercise the actual frontend against an isolated real API server; they do not inspect pixels, responsive layout or the native file chooser.
