# Verification evidence — 18 October 2026

This is an implemented local prototype. No visual inspection, customer study, adoption, public publication or award is inferred from automated checks.

## Actual completed checks

- Python suite: **29 passing tests**. Real CSV examples prove the 200-vs-75+125 ambiguity, one-candidate and unmatched cases. Tests cover exact decimals, mapping, BOM/quoted values, leading-zero identifiers, invalid money/rows, duplicates, customer/currency scope, search limits, reservations/undo, acknowledgments, stale revisions, expired-session writes, session isolation, atomic import, provenance and CSV formula-prefix handling. New scenario tests compare preview consequences with actual confirmation, verify no original state/history/revision changes, and reject invalid, reserved and stale previews with independent session isolation.
- The bounded search test uses 16 equal invoices and finds **12,870** valid groups while displaying only 30. This verifies that a display cap does not create a false uniqueness claim.
- Frontend suite: **10 passing DOM interaction tests**, executing the actual app JavaScript against a separate real Python HTTP server. Flows include loading computed alternatives, viewing/applying fictional evidence, selecting a group, acknowledging, confirming, reserving/undoing, inspecting history/source rows, selecting an unknown customer's scope, preserving unsaved notes, mapping/importing own CSVs, rejecting bad CSVs without replacing the workspace, invalidating old previews and rendering supplied markup as text. New tests complete the actual guided review, verify no automatic selection/confirmation, inspect calculations/evidence/consequences, navigate to affected payments, and preserve decisions when exiting. Deliberately delayed success and real stale-version error responses cannot overwrite a newer selection or erase an unsaved evidence note. CSS parses into rules. This does not render pixels or test viewport appearance/native file chooser/dialog focus.
- Independent clean Python 3.11 virtual environment created at `.dist/repro-env`, without system site packages. Installed from `requirements-lock.txt` + `requirements-dev.txt`; both suites pass using that interpreter. Runtime closure is only 7 distributions. `pip check`: no broken requirements. The separate Conda solve in `environment.yml` was not performed.
- JavaScript syntax: `node --check matchdesk/static/app.js` succeeds. Python formatting/lint succeed. Source formatting used Prettier for readable HTML/CSS/JavaScript.
- Windows launcher: `Start-MatchDesk.ps1 -Check` correctly selects the existing `zero-dev` interpreter and does not start a server/browser. Python server successfully starts on 127.0.0.1:8503; GET `/health` identifies MatchDesk. The optional automatic opening of the OS browser is implemented but not claimed as visually tested.
- The two previous projects were archived separately before the new build. ZIP integrity and per-file hash comparisons pass; see `backup-record.md`.

The framework emits one deprecation warning because Starlette's TestClient currently supports the installed `httpx` backend but recommends `httpx2`. This warning is not hidden; the actual tests pass.

## Commands used

```text
python -m pytest -q --tb=short                         -> 29 passed
python -m ruff check .                                -> all checks passed
node --check matchdesk/static/app.js                   -> success
npm test                                             -> 10 passed, 0 failed
.dist/repro-env/Scripts/python.exe -m pip check         -> no broken requirements
Start-MatchDesk.ps1 -Check                             -> runtime verified
```

For clean-environment frontend runs, `MATCHDESK_TEST_PYTHON` points to that environment's Python. Tests use their own ephemeral local server, separate from the user's demo session.

## Repairs discovered through verification

An import test exposed a timing issue: the preview button could remain clickable while replacement file bytes were still being read. File-read and preview revisions now invalidate stale work; confirmation disappears on file change. Evidence drafts survive candidate selection, and unsaved notes block confirmation until saved. Expired session cookies cannot silently apply a decision to a newly created sample workspace. Server mutations recheck everything rather than trusting the enabled state of a UI button.

## Open verification and participant work

### Desktop capture update — 19 October 2026

Windows Computer Use successfully controlled a real Chrome window. The fictional workflow was visually inspected and captured: computed alternatives, sample-note dialog/save, selecting the named pair, read-only consequences, acknowledgment, confirmation, PAY-005 becoming unmatched, recorded history and undo restoring availability. The scope and import dialogs and export options were inspected. Five genuine screenshots are in `docs/screenshots/`; no painted app state or real customer record is used. This updates the earlier browser-discovery limitation for these desktop states only. Narrow/mobile layout, native file-picker use, a fresh import in the graphical browser and comprehensive keyboard/accessibility behavior remain unverified by this capture session.

The participant supplied their own voice recording. A local H.264/AAC demo is edited from real full-screen Chrome footage, with readable caption space and an enlarged preview detail. The original recording is retained separately and ignored by Git. See `docs/demo-media.md` for the editing boundary and remaining publication step. A failed blank window-capture take was detected and excluded; the replacement desktop capture was checked with a short test before recording the workflow.

In the earlier 18 October session, supported connected-browser discovery returned no available browser, so no visual inspection was claimed at that time. The 19 October desktop capture above now supplies screenshots and core-workflow observations. Screen-reader assessment, native file chooser interaction and comprehensive native dialog focus behavior remain unverified. Responsive CSS and native labels/controls exist, but their presence is not a completed accessibility audit.

The participant asked the agent to handle testing instead of supplying first-use feedback; no personal task completion or acceptance of this build is recorded. Official personal reviews, learning wrap-up/reflection and participant-written final submission materials remain unfinished. The working name is provisional. No real financial dataset was used, no real invoice was marked paid and no bank/accounting endpoint was contacted. Public hostile-upload hosting, durability and multi-user production hardening are outside this local PoC.

## Source delivery

Source releases are made with `git archive`, excluding generated/private paths. `python -m scripts.audit_release <zip>` checks its actual sample CSV bytes, before/after decisions, reservations/undo, expected files and reference-map code anchors. A ZIP is a local handoff, not a public repository or a submitted entry. Competition readiness is tracked separately in `submission-readiness.md`.

## Final interaction hardening

Two additional interaction regressions verify focus remains on replacement selected controls and that typing during an in-flight evidence save preserves the newer unsaved draft. The initial new test run exposed test teardown before pending previews settled; the harness now awaits those responses and all ten interaction tests pass. These checks originally left visual behavior unobserved; the later desktop capture above narrows that gap for its specific states. Comprehensive native focus behavior remains unverified.

The documentation/help-dialog release check found the same cleanup timing issue in the customer-scope test: saving evidence launches another preview, but the test closed its simulated document before that response rendered. That test now waits for the current preview before disposal. The complete frontend suite was rerun successfully: 10 tests passed, no failures or asynchronous teardown errors. This repair changes test synchronization, not production matching behavior. Local links in the new explanation/attribution/evidence documents resolve.

Publication audit helper scans every reachable commit and unique source blob for private/generated paths and selected credential patterns, without printing matched values or contacting remotes. Its ignored JSON report records the actual HEAD and limitations. Source publication was subsequently explicitly authorized and completed. Public access, MIT license, required planning files and matching source commit were checked through unauthenticated GitHub API requests. See final-handoff.md for the current source URL and remaining work.

## Local media release checks — 19 October 2026

The edited MP4 is 112.333 seconds (under three minutes), 1920×1080 H.264 video with AAC voice audio. A complete decode finishes without reported errors. Chapter and transition frames were extracted and visually checked; the selection and affected-payment cuts were adjusted after review, and the preview detail was enlarged for readability. All 27 English caption cues are ordered, non-overlapping and inside the video. Measured final audio is approximately −16.09 LUFS integrated with −1.29 dBTP true peak; the voice retains its identity and pitch, with 0.96× tempo and 4.5 seconds of added quiet reading time. File/container checks and visual frame review do not substitute for the participant's final listening approval. No public upload or contest receipt is inferred from creating the local file.
