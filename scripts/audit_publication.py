"""Read-only history audit. Findings never print matched secret contents."""

import json
import re
import subprocess
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath


def git(*args):
    return subprocess.check_output(["git", *args])


def main():
    root = Path(git("rev-parse", "--show-toplevel").decode().strip()).resolve()
    if root != Path(__file__).resolve().parents[1]:
        raise SystemExit("Run against this standalone MatchDesk repository only.")
    commits = git("rev-list", "--all").decode().splitlines()
    objects = {}
    findings = []
    for commit in commits:
        for entry in git("ls-tree", "-r", "-z", commit).split(b"\0"):
            if not entry:
                continue
            meta, filename = entry.split(b"\t", 1)
            _, kind, oid = meta.split()
            path = filename.decode("utf-8", errors="replace")
            parts = PurePosixPath(path).parts
            if any(
                part in {".agents", ".claude", "node_modules", ".venv", ".dist", "uploads"}
                or part == "learner-profile.md"
                or (part.startswith(".env") and part != ".env.example")
                for part in parts
            ):
                findings.append(
                    {"kind": "private_or_generated_path", "path": path, "commit": commit}
                )
            if kind != b"blob":
                findings.append({"kind": "external_object_requires_review", "path": path})
            else:
                objects.setdefault(oid.decode(), set()).add(path)
    patterns = {
        "private_key": rb"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
        "github_token": rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})",
        "openai_style_key": rb"sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}",
        "aws_access_key": rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
        "credential_url": rb"https?://[^\s/:]+:[^\s/@]+@",
    }
    for oid, paths in objects.items():
        content = git("cat-file", "blob", oid)
        for name, pattern in patterns.items():
            if re.search(pattern, content):
                findings.append({"kind": name, "paths": sorted(paths), "blob": oid})
    tracked = set(git("ls-files", "-z").decode().split("\0"))
    required = {
        "LICENSE",
        "README.md",
        "devpost/scope.md",
        "devpost/prd.md",
        "devpost/spec.md",
        "requirements-lock.txt",
    }
    report = {
        "checked_at_utc": datetime.now(UTC).isoformat(),
        "head": git("rev-parse", "HEAD").decode().strip(),
        "reachable_commits_checked": len(commits),
        "unique_source_blobs_checked": len(objects),
        "missing_required_tracked_files": sorted(required - tracked),
        "findings": findings,
        "remotes_configured": bool(git("remote").strip()),
        "working_tree_clean": not bool(git("status", "--porcelain").strip()),
        "limitations": "Heuristic pattern scan, not a guarantee of no secrets or private information. Human context/history review and explicit publication authorization remain necessary. No remote contacted or changed.",
    }
    output = root / ".dist" / "publication-audit.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if findings or required - tracked:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
