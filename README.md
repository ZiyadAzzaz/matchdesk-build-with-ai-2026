# MatchDesk — local payment review (working prototype)

Compare incoming payments with outstanding invoices, inspect multiple exact allocations, add evidence, and confirm a proposed match without updating any bank or accounting system. The interface is a custom HTML/CSS/JavaScript review desk with a small local Python API. AI assisted the build; runtime matching is deterministic. No API key, account or frontend build step is needed.

Public source: [ZiyadAzzaz/matchdesk-build-with-ai-2026](https://github.com/ZiyadAzzaz/matchdesk-build-with-ai-2026). See [release handoff](devpost/final-handoff.md) for completed checks and remaining demo/submission work.

## Open the app

In this workspace, **double-click `Start-MatchDesk.cmd`**. It discovers a local `.venv`, an active Conda environment or the existing `zero-dev` environment, verifies the required modules and opens **http://127.0.0.1:8503**. Keep the console window open while using it. `Start-MatchDesk.ps1 -Check` verifies the interpreter without starting a browser or server. Override selection with `MATCHDESK_PYTHON` if necessary.

Fresh setup, Python 3.11:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
.\.venv\Scripts\python.exe -m matchdesk --open-browser
```

Linux/macOS use `.venv/bin/python`. Existing workspace alternative:

```powershell
conda activate zero-dev
cd "E:\Azzaz CAI\Azzaz-Lab\zero-dev\matchdesk"
python -m matchdesk
```

Open http://127.0.0.1:8503. If that port is occupied: `python -m matchdesk --port 8504`. All servers bind to loopback. Optional Conda recipe: `conda env create -f environment.yml`, then `conda activate matchdesk`. Creating this second Conda environment is not required and was not independently tested.

## The example, end to end

All sample companies, invoices, payments and remittance notes are fictional.

New here? Click **Guide me through it**. The five-step guide explains the problem and takes you through the real controls. It never selects or confirms an allocation for you. You can exit without losing your decisions.

1. Select **PAY-001 · USD 200.00**. The server computes two valid arithmetic groups: **INV-003 (200)** or **INV-001 + INV-002 (75 + 125)**. Neither is chosen automatically.
2. Click **Read sample remittance**. The fictional note identifies INV-001 and INV-002. Click **Use this evidence note**.
3. Click the matching two-invoice card. Check **I checked the payer and remittance evidence**, then **Confirm proposed allocation**.
4. The payment becomes **Reviewed here**. The two invoices are reserved locally. PAY-005 (75.00) now has no available exact allocation; the same invoice cannot be used twice.
5. Open **Decision trail**, inspect original **Source files**, and **Export review** as CSV or JSON. **Undo this review** releases the invoices and records that action.
6. PAY-002 illustrates one arithmetic candidate, PAY-003 no exact match, and PAY-004 an unidentified customer. Select its matching customer explicitly; amount alone never identifies a payer.

"Reviewed here" means a person confirmed a proposed allocation in this session. It does not prove the payer's identity, authenticate remittance, mark a real invoice paid or post an accounting entry. Exact arithmetic is not transaction identity.

Before confirming, **Understand this choice** connects the payment to selected invoices, shows the equation and original CSV records, and distinguishes saved references from identity verification. Its **If you confirm this choice** preview uses the real allocation rules on a separate copy: choosing 75 + 125 leaves PAY-005 without an available exact group; choosing 200 does not. Try both cards. Previewing never reserves invoices, writes a decision or changes history. After a real confirmation, the result links to payments whose status or candidate count actually changed.

## Your own CSV exports

Click **Import CSVs** and choose two UTF-8, comma-separated files (BOM accepted). Template downloads are available there. Preview both, choose each column mapping, acknowledge replacing the current workspace and import. A failed import leaves existing decisions unchanged; no rows are silently skipped. Changing a file invalidates its old preview. Selecting files does not itself import or replace data.

| File | Required mapped columns | Optional columns |
|---|---|---|
| Outstanding invoices | ID, customer, currency, amount | — |
| Incoming payments | ID, currency, amount | Customer, reference |

IDs are strings, so leading zeros survive. Each file must have unique IDs. Amounts must be positive plain decimal strings with no thousands separators, exponent or more than two fractional digits. Required fields cannot have surrounding whitespace. Supported currencies: USD, EUR, GBP, EGP, CAD, AUD; they are never converted or added across currencies.

Limits: 256 KB/file; 30 columns; 200 invoice records; 60 payment records; 2,000 characters/field; 16 available invoices per selected customer/currency for exhaustive matching. Up to 30 candidate groups are displayed, with the full count retained. Over-limit searches require review rather than claiming uniqueness. CSV record numbers include the header and are not physical line numbers when fields contain quoted newlines. Remaining import details and source hashes are in JSON exports.

## Data handling and boundaries

The browser sends CSV text to the server running the app. In local use that is this computer. Records, notes, proposals and their trail live in process memory, scoped to a browser cookie; they are not written to an application database or sent to an external AI/bank service. Session data expires after 90 minutes without API activity and is lost on restart or replacement. It is not secure memory erasure. Downloads intentionally persist and include supplied customer/financial text; inspect them before sharing.

The local API checks mutations against the current revision, revalidates allocations server-side, blocks double use and rejects stale/expired sessions. This is not a public multi-user financial service. No accounting advice, refunds, fee inference, partial allocations, credit notes, FX, fuzzy payer guesses or automatic external writes. CSV exports neutralize formula-like text prefixes; JSON preserves exact supplied strings and structured provenance. CSV consumers may still automatically reinterpret identifiers—use the JSON report when exact string preservation matters.

## Reproduce the checks

Python:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m ruff check .
```

Frontend interaction tests require Node.js 22+ **for development only**:

```powershell
npm ci
$env:MATCHDESK_TEST_PYTHON = (Get-Command python).Source
npm test
```

Activate the intended Python environment first. The frontend tests launch their own isolated local Python process and supply real CSVs through DOM controls to the real API. They cover evidence, selection, acknowledgments, approvals, reservation, undo, import mappings, invalidated previews, unknown customers, draft-note preservation, HTML-safe rendering and CSS parsing. They do **not** paint the page, inspect responsive layout or drive the OS file chooser. Python tests cover exact money, search completeness, validation, imports, reservations, stale revisions, expired cookies, session isolation and exports. A framework deprecation warning about the `httpx` TestClient backend is recorded rather than hidden.

## Project and competition records

`matchdesk/engine.py` parses and matches; `review.py` owns proposed decisions and exports; `server.py` exposes the local API; `static/` contains the complete browser workspace. Planning records and [reference code map](devpost/app-map.html) are in `devpost/`. The [official Skill Pack](https://github.com/challengepost/learn-ai-basics) was installed in this isolated folder; `skills-lock.json` records its source hashes. Personal profile and local skill installations are excluded from releases. Draft planning status distinguishes delegated implementation from unreported personal review.

See [verification](devpost/verification.md), [recording actions](devpost/recording-checklist.md) and [submission readiness](devpost/submission-readiness.md). Existing tools overlap: this prototype makes no claim of being the first matcher, established market demand, measured savings, institutional approval or a high winning probability. The source repository is public with explicit authorization; no public video or contest submission has been completed. Participant feedback, final learning/review activities and participant-written submission materials remain necessary.
