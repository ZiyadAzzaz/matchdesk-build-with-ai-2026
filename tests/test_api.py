from starlette.testclient import TestClient

from matchdesk.review import DATA, DEMO_MAPS
from matchdesk.server import create_app


def test_manual_entries_preserve_reviews_provenance_and_reject_invalid_changes():
    app = create_app()
    with TestClient(app) as client, TestClient(app) as other:
        original = client.get("/api/state").json()
        reviewed = client.post(
            "/api/approve",
            json={
                "version": original["version"],
                "payment_id": "PAY-001",
                "invoice_ids": ["INV-001", "INV-002"],
                "acknowledged": True,
            },
        ).json()
        record = {"id": "OWN-1", "customer": "My Customer", "currency": "EGP", "amount": "125.50"}
        added = client.post(
            "/api/add",
            json={
                "version": reviewed["version"],
                "role": "invoices",
                "record": record,
            },
        )
        assert added.status_code == 200
        state = added.json()
        assert state["payments"][0]["decision"] == reviewed["payments"][0]["decision"]
        assert [r["id"] for r in state["invoices"] if r["reserved"]] == ["INV-001", "INV-002"]
        assert state["invoices"][-1]["origin"] == "manual"
        assert state["invoices"][-1]["source_row"] == 0
        assert state["sources"]["invoices"]["sha256"] == original["sources"]["invoices"]["sha256"]
        assert state["sources"]["invoices"]["manual_records"] == 1
        for bad in (
            record,
            {**record, "id": "NEW", "amount": "1.001"},
            {**record, "id": "NEW", "amount": "-1"},
        ):
            assert (
                client.post(
                    "/api/add",
                    json={"version": state["version"], "role": "invoices", "record": bad},
                ).status_code
                == 400
            )
            assert client.get("/api/state").json() == state
        assert (
            client.post(
                "/api/add",
                json={"version": original["version"], "role": "payments", "record": record},
            ).status_code
            == 409
        )
        payment = {**record, "id": "PAY-OWN", "reference": "OWN-1"}
        result = client.post(
            "/api/add", json={"version": state["version"], "role": "payments", "record": payment}
        ).json()
        assert result["payments"][-1]["candidates"][0]["invoice_ids"] == ["OWN-1"]
        exported = client.get("/api/export.json").json()
        assert exported["history"][-1]["record"]["origin"] == "manual"
        assert not any(r["id"] == "PAY-OWN" for r in other.get("/api/state").json()["payments"])


def test_empty_workspace_requires_confirmation_and_supports_manual_only_review():
    with TestClient(create_app()) as client:
        state = client.get("/api/state").json()
        assert client.post("/api/empty", json={"version": state["version"]}).status_code == 400
        assert client.get("/api/state").json() == state
        empty = client.post(
            "/api/empty", json={"version": state["version"], "acknowledged": True}
        ).json()
        assert empty["invoices"] == empty["payments"] == []
        assert empty["demo"] is False
        assert empty["sources"]["invoices"]["sha256"] is None
        record = {"id": "I", "customer": "Client", "currency": "USD", "amount": "10"}
        invoice = client.post(
            "/api/add", json={"version": empty["version"], "role": "invoices", "record": record}
        ).json()
        payment = client.post(
            "/api/add",
            json={
                "version": invoice["version"],
                "role": "payments",
                "record": {**record, "id": "P"},
            },
        ).json()
        approved = client.post(
            "/api/approve",
            json={
                "version": payment["version"],
                "payment_id": "P",
                "invoice_ids": ["I"],
                "acknowledged": True,
            },
        )
        assert approved.status_code == 200
        assert approved.json()["invoices"][0]["reserved"]
        assert (
            client.post(
                "/api/undo", json={"version": approved.json()["version"], "payment_id": "P"}
            ).json()["invoices"][0]["reserved"]
            is False
        )


def test_impact_preview_is_read_only_versioned_and_session_scoped():
    app = create_app()
    with TestClient(app) as first, TestClient(app) as second:
        before = first.get("/api/state").json()
        body = {
            "version": before["version"],
            "payment_id": "PAY-001",
            "invoice_ids": ["INV-001", "INV-002"],
        }
        preview = first.post("/api/impact", json=body)
        assert preview.status_code == 200 and preview.json()["preview_only"]
        assert first.get("/api/state").json() == before
        assert first.get("/api/export.json").json()["history"] == []
        assert first.post("/api/impact", json={**body, "version": -1}).status_code == 409
        assert (
            first.post("/api/impact", json={**body, "invoice_ids": ["INV-001"]}).status_code == 400
        )
        assert first.get("/api/impact").status_code == 405
        first.post("/api/approve", json={**body, "acknowledged": True})
        second.get("/api/state")
        assert second.post("/api/impact", json=body).status_code == 200


def test_expired_cookie_cannot_mutate_a_new_workspace():
    with TestClient(create_app()) as client:
        client.cookies.set("matchdesk_session", "an-expired-session")
        assert (
            client.post(
                "/api/approve",
                json={
                    "version": 0,
                    "payment_id": "PAY-001",
                    "invoice_ids": ["INV-003"],
                    "acknowledged": True,
                },
            ).status_code
            == 409
        )
        assert client.get("/api/state").json()["payments"][0]["status"] == "ambiguous"


def test_unknown_routes_and_method_mismatch_are_not_silent_success():
    with TestClient(create_app()) as client:
        assert client.get("/api/approve").status_code == 405
        assert client.post("/api/no-such-action", json={}).status_code == 405


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
