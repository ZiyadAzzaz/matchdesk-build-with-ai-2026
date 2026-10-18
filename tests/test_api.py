from starlette.testclient import TestClient

from matchdesk.review import DATA, DEMO_MAPS
from matchdesk.server import create_app


def test_complete_review_flow_and_stale_mutation():
    with TestClient(create_app()) as client:
        state = client.get("/api/state").json()
        assert state["payments"][0]["count"] == 2
        result = client.post(
            "/api/evidence",
            json={
                "version": state["version"],
                "payment_id": "PAY-001",
                "note": state["sample_remittance"]["note"],
            },
        )
        assert result.status_code == 200
        version = result.json()["version"]
        approved = client.post(
            "/api/approve",
            json={
                "version": version,
                "payment_id": "PAY-001",
                "invoice_ids": ["INV-001", "INV-002"],
                "acknowledged": True,
            },
        )
        assert (
            approved.status_code == 200 and approved.json()["payments"][0]["status"] == "reviewed"
        )
        assert (
            client.post("/api/undo", json={"version": version, "payment_id": "PAY-001"}).status_code
            == 409
        )
        assert "reviewed_proposal" in client.get("/api/export.csv").text
        assert (
            client.get("/api/export.json").json()["history"][-1]["action"] == "allocation_reviewed"
        )
        undone = client.post(
            "/api/undo", json={"version": approved.json()["version"], "payment_id": "PAY-001"}
        )
        assert undone.json()["payments"][0]["status"] == "ambiguous"


def test_sessions_are_isolated_and_bad_import_is_atomic():
    app = create_app()
    with TestClient(app) as first, TestClient(app) as second:
        state = first.get("/api/state").json()
        first.post(
            "/api/approve",
            json={
                "version": state["version"],
                "payment_id": "PAY-001",
                "invoice_ids": ["INV-003"],
                "acknowledged": True,
            },
        )
        assert second.get("/api/state").json()["payments"][0]["status"] == "ambiguous"
        version = first.get("/api/state").json()["version"]
        failed = first.post(
            "/api/import",
            json={"version": version, "invoices": "bad", "payments": "bad", "mappings": DEMO_MAPS},
        )
        assert failed.status_code == 400
        assert first.get("/api/state").json()["payments"][0]["status"] == "reviewed"


def test_preview_import_origin_limits_and_static_files():
    with TestClient(create_app()) as client:
        files = {
            role: (DATA / f"{role}.csv").read_text(encoding="utf-8")
            for role in ("invoices", "payments")
        }
        preview = client.post("/api/preview", json=files)
        assert preview.status_code == 200 and preview.json()["invoices"]["records"] == 7
        state = client.get("/api/state").json()
        imported = client.post(
            "/api/import", json={**files, "version": state["version"], "mappings": DEMO_MAPS}
        )
        assert imported.status_code == 200 and not imported.json()["demo"]
        assert (
            client.post(
                "/api/demo", json={"version": 1}, headers={"origin": "https://example.invalid"}
            ).status_code
            == 403
        )
        assert (
            client.post(
                "/api/import",
                content=b"x" * 1_100_001,
                headers={"content-type": "application/json"},
            ).status_code
            == 413
        )
        assert client.get("/health").json()["status"] == "ok"
        assert client.get("/").status_code == 200
        assert "default-src 'self'" in client.get("/").headers["content-security-policy"]
