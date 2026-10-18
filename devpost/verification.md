# Verification evidence — 18 October 2026

This is an implemented local prototype. No visual inspection, customer study, adoption, public publication or award is inferred from automated checks.

## Actual completed checks

- Python suite: **26 passing tests**. Real CSV examples prove the 200-vs-75+125 ambiguity, one-candidate and unmatched cases. Tests cover exact decimals, mapping, BOM/quoted values, leading-zero identifiers, invalid money/rows, duplicates, customer/currency scope, search limits, reservations/undo, acknowledgments, stale revisions, expired-session writes, session isolation, atomic import, provenance and CSV formula-prefix handling.
- The bounded search test uses 16 equal invoices and finds **12,870** valid groups while displaying only 30. This verifies that a display cap does not create a false uniqueness claim.
- Frontend suite: **4 passing DOM interaction tests**, executing the actual app JavaScript against a separate real Python HTTP server. Flows include loading computed alternatives, viewing/applying fictional evidence, selecting a group, acknowledging, confirming, reserving/undoing, inspecting history/source rows, selecting an unknown customer's scope, preserving unsaved notes, mapping/importing own CSVs, rejecting bad CSVs without replacing the workspace, invalidating old previews and rendering supplied markup as text. CSS parses into rules. This does not render pixels or test viewport appearance/native file chooser/dialog focus.
- Independent clean Python 3.11 virtual environment created at `.dist/repro-env`, without system site packages. Installed from `requirements-lock.txt` + `requirements-dev.txt`; both suites pass using that interpreter. Runtime closure is only 7 distributions. `pip check`: no broken requirements. The separate Conda solve in `environment.yml` was not performed.
- JavaScript syntax: `node --check matchdesk/static/app.js` succeeds. Python formatting/lint succeed. Source formatting used Prettier for readable HTML/CSS/JavaScript.
- Windows launcher: `Start-MatchDesk.ps1 -Check` correctly selects the existing `zero-dev` interpreter and does not start a server/browser. Python server successfully starts on 127.0.0.1:8503; GET `/health` identifies MatchDesk. The optional automatic opening of the OS browser is implemented but not claimed as visually tested.
- The two previous projects were archived separately before the new build. ZIP integrity and per-file hash comparisons pass; see `backup-record.md`.

The framework emits one deprecation warning because Starlette's TestClient currently supports the installed `httpx` backend but recommends `httpx2`. This warning is not hidden; the actual tests pass.

## Commands used

```text
python -m pytest -q --tb=short                         -> 26 passed
python -m ruff check .                                -> all checks passed
node --check matchdesk/static/app.js                   -> success
npm test                                             -> 4 passed, 0 failed
.dist/repro-env/Scripts/python.exe -m pip check         -> no broken requirements
Start-MatchDesk.ps1 -Check                             -> runtime verified
```

For clean-environment frontend runs, `MATCHDESK_TEST_PYTHON` points to that environment's Python. Tests use their own ephemeral local server, separate from the user's demo session.

## Repairs discovered through verification

An import test exposed a timing issue: the preview button could remain clickable while replacement file bytes were still being read. File-read and preview revisions now invalidate stale work; confirmation disappears on file change. Evidence drafts survive candidate selection, and unsaved notes block confirmation until saved. Expired session cookies cannot silently apply a decision to a newly created sample workspace. Server mutations recheck everything rather than trusting the enabled state of a UI button.

## Open verification and participant work

The supported connected-browser discovery returned no available browser. No screenshot, desktop/mobile viewport inspection, screen-reader assessment, native file chooser interaction or native dialog focus behavior was observed. Responsive CSS and native labels/controls exist, but their presence is not a completed accessibility audit.

The participant asked the agent to handle testing instead of supplying first-use feedback; no personal task completion or acceptance of this build is recorded. Official personal reviews, learning wrap-up/reflection and participant-written final submission materials remain unfinished. The working name is provisional. No real financial dataset was used, no real invoice was marked paid and no bank/accounting endpoint was contacted. Public hostile-upload hosting, durability and multi-user production hardening are outside this local PoC.

## Source delivery

Source releases are made with `git archive`, excluding generated/private paths. `python -m scripts.audit_release <zip>` checks its actual sample CSV bytes, before/after decisions, reservations/undo, expected files and reference-map code anchors. A ZIP is a local handoff, not a public repository or a submitted entry. Competition readiness is tracked separately in `submission-readiness.md`.
