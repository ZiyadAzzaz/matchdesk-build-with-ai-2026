"""Audit source ZIP integrity and run matching on the actual archived sample CSV bytes."""

import argparse
import json
import zipfile
from pathlib import Path, PurePosixPath

from matchdesk.engine import import_dataset
from matchdesk.review import DEMO_MAPS, Review


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    with zipfile.ZipFile(args.archive) as package:
        assert package.testzip() is None
        names = package.namelist()
        for name in names:
            parts = PurePosixPath(name).parts
            assert not any(
                part
                in {
                    ".git",
                    ".agents",
                    ".claude",
                    "agent",
                    ".dist",
                    ".venv",
                    "node_modules",
                    "__pycache__",
                    "uploads",
                }
                or part.startswith(".env")
                for part in parts
            ), name
            assert not name.endswith("learner-profile.md"), name
        for required in (
            "README.md",
            "LICENSE",
            "requirements-lock.txt",
            "Start-MatchDesk.cmd",
            "devpost/scope.md",
            "devpost/prd.md",
            "devpost/spec.md",
            "devpost/app-map.html",
            "matchdesk/static/index.html",
            "matchdesk/static/app.js",
            "matchdesk/static/styles.css",
        ):
            assert required in names, required
        dataset = import_dataset(
            package.read("matchdesk/data/invoices.csv").decode(),
            package.read("matchdesk/data/payments.csv").decode(),
            DEMO_MAPS,
            demo=True,
        )
        review = Review(dataset)
        assert review.state()["payments"][0]["count"] == 2
        note = json.loads(package.read("matchdesk/data/remittance.json"))
        review.set_note(note["payment_id"], note["note"])
        review.approve(note["payment_id"], note["invoice_ids"], True)
        assert review.state()["payments"][0]["status"] == "reviewed"
        assert review.state()["payments"][4]["status"] == "unmatched"
        review.undo(note["payment_id"])
        assert review.state()["payments"][0]["count"] == 2
        code_map = package.read("devpost/app-map.html").decode()
        assert "<script" not in code_map.lower()
        for path, anchors in (
            ("matchdesk/engine.py", ["def find_candidates("]),
            ("matchdesk/review.py", ["def approve(", "def export_json("]),
            ("matchdesk/static/app.js", ["function renderPayment(", "function mutation("]),
        ):
            source = package.read(path).decode()
            assert path in code_map
            assert all(anchor in source for anchor in anchors)
    print(
        f"Source ZIP verified: {sum(not n.endswith('/') for n in names)} files; archived data proves ambiguity, review, reservation and undo; private/generated paths excluded."
    )


if __name__ == "__main__":
    main()
