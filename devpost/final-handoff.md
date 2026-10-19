# MatchDesk handoff — updated 19 October 2026

The local build is functional; the competition entry is not yet submitted or fully verified. No award, customer validation or finished personal learning activity is claimed.

## Completed local work

- Guided fictional first payment with real user-controlled evidence, selection and confirmation.
- Visible calculation, customer/currency scope, source records and saved-note references.
- Real-rule, read-only consequence preview; actual consequences, affected-payment navigation and undo.
- Atomic CSV preview/mapping/import, source inspection and CSV/JSON exports.
- 31 backend tests and 11 frontend DOM interaction tests, including direct entry and empty-workspace flows. Frontend tests use the real local API; they do not render pixels or certify accessibility.
- Focus is restored to selected payment/allocation buttons after they are replaced. A newer evidence draft survives an older in-flight save and blocks confirmation until explicitly saved.
- Reproducible dependencies, launcher, license, planning documents and source archive checks.
- Actual desktop Chrome core journey inspected and captured on 19 October, with five screenshots for the public repository.
- Participant-supplied voice edited with real app footage into a 112.333-second, 1080p H.264/AAC demo with 27 English caption cues. Local delivery: `.dist/demo-delivery/MatchDesk-demo-Ziyad-Azzaz.mp4`. Ziyad approved the finished edit and reported uploading it: https://youtu.be/xOIa8LFVFh0 . Signed-out playback remains unverified.
- Read-only full reachable-history audit helper: `python -m scripts.audit_publication`. Its JSON report is saved under ignored `.dist/`; it prints no matched secret contents and contacts no remote. Heuristic scans supplement, not replace, context review.

## Remaining work and why

| Item | Status / dependency | Next concrete action |
|---|---|---|
| Actual browser appearance and keyboard/focus behavior | Core desktop Chrome workflow inspected and captured on 19 October; screenshots prepared | Narrow/mobile layout, native file chooser and comprehensive keyboard/focus behavior remain open |
| Useful audience evidence | No genuine freelancer/bookkeeper trial recorded | Follow `usability-check.md`, with permission and fictional data; record actual results |
| Personal planning review and learning reflection | Draft planning and personal checkpoint records remain honest | Participant reviews the choices and supplies their own reflection; do not invent sign-off |
| Public source repository | Completed with explicit authorization | https://github.com/ZiyadAzzaz/matchdesk-build-with-ai-2026 — public access, MIT license, required files and source commit checked without authentication |
| Uploaded working video | Participant approved the edit and supplied https://youtu.be/xOIa8LFVFh0 | Verify signed-out playback and Public visibility, then add the URL to Devpost |
| Devpost fields, eligibility and survey | No authenticated form reviewed or personal answers supplied | Participant completes their own required fields, including Skill Pack explanation and age confirmation; check eligibility truthfully |
| Submit and verify receipt | Not performed | Check repository/video links, required fields and submission status; target October 25 |

The actual cutoff is October 27 at 00:00 Cairo (midnight beginning that date), equivalent to October 26 at 17:00 EDT. Check current official rules/form before submitting. Public hosting is optional; a local working-app recording is acceptable. The source ZIP is not a substitute for a public repository.

GitHub CLI authentication was verified over the network for the active account without displaying its credential. A restricted-network status check initially reported failure; the network-enabled check succeeds. The participant then explicitly approved the public repository. Creation/push succeeded, and independent unauthenticated GitHub API checks verified access, license, required planning files, source commit and private-file exclusions. No login repair, outreach or Devpost submission was performed. Video upload was performed by the participant and reported on 19 October; its link is recorded above.

## Read in this order

1. `README.md` — open the app and understand the example.
2. `verification.md` — actual checks and limitations.
3. `usability-check.md` — proposed real-audience task, not completed research.
4. `recording-checklist.md` — technical capture actions and timing, not narration.
5. `submission-readiness.md` — remaining eligibility/publication/submission checks.

Official sources: [rules](https://learn-ai-basics.devpost.com/rules), [required-field update](https://learn-ai-basics.devpost.com/updates/46821-two-new-questions-on-the-submission-form), [event resources](https://learn-ai-basics.devpost.com/resources).

## Direct entry and current screenshots
Users can add invoices/payments without CSVs or start empty after explicit replacement confirmation. Existing decisions and imported-file hashes are preserved when adding records. Nine actual app images are published in docs/screenshots, including direct invoice entry, payment entry and the resulting manual payment candidate. See README.md for the no-CSV trial path. The video covers the core workflow before these new controls were added.
