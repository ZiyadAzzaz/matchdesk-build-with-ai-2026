"""Loopback HTTP service. All review state is local process memory, scoped per browser."""

import json
import secrets
import threading
import time
from pathlib import Path

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, Response
from starlette.routing import Route

from matchdesk.engine import FIELDS, import_dataset, read_table
from matchdesk.review import DATA, Conflict, Review

STATIC = Path(__file__).parent / "static"
MAX_REQUEST = 1_100_000
TTL = 90 * 60
LOCK = threading.RLock()


def create_app():
    sessions = {}

    def get_review(request):
        now = time.monotonic()
        for key, (_, touched) in list(sessions.items()):
            if now - touched > TTL:
                sessions.pop(key, None)
        token = request.cookies.get("matchdesk_session", "")
        if token not in sessions:
            if len(sessions) >= 128:
                raise ValueError(
                    "Too many local workspaces. Restart the server to clear expired work."
                )
            token = secrets.token_urlsafe(32)
            sessions[token] = (Review(), now)
        review, _ = sessions[token]
        sessions[token] = (review, now)
        return token, review

    async def api(request: Request):
        host = request.url.hostname
        if host not in {"127.0.0.1", "localhost", "testserver"}:
            return JSONResponse({"error": "Use the local application address."}, status_code=403)
        action = request.path_params.get("action", "state")
        allowed = {"state", "export.json", "export.csv"} if request.method == "GET" else {"preview", "demo", "import", "scope", "evidence", "approve", "undo"}
        if action not in allowed:
            return JSONResponse({"error": "Unknown action or unsupported request method."}, status_code=405)
        try:
            body = {}
            if request.method == "POST":
                origin = request.headers.get("origin")
                if origin and origin != f"{request.url.scheme}://{request.url.netloc}":
                    return JSONResponse(
                        {"error": "Open the app at its local address before making changes."},
                        status_code=403,
                    )
                if request.headers.get("content-type", "").split(";")[0] != "application/json":
                    raise ValueError("Send JSON from the review workspace.")
                chunks = bytearray()
                async for chunk in request.stream():
                    if len(chunks) + len(chunk) > MAX_REQUEST:
                        return JSONResponse(
                            {"error": "Request is too large; use smaller CSV files."},
                            status_code=413,
                        )
                    chunks.extend(chunk)
                try:
                    body = json.loads(chunks)
                except (ValueError, UnicodeError) as exc:
                    raise ValueError("The request could not be read as JSON.") from exc
                if not isinstance(body, dict):
                    raise ValueError("The request must contain a JSON object.")
            with LOCK:
                token, review = get_review(request)
                action = request.path_params.get("action", "state")
                if action == "preview":
                    tables = {role: read_table(body.get(role), role) for role in FIELDS}
                    response = JSONResponse(
                        {
                            role: {
                                "headers": table.headers,
                                "rows": table.rows[:5],
                                "records": len(table.rows),
                                "sha256": table.sha256,
                            }
                            for role, table in tables.items()
                        }
                    )
                elif action == "export.json":
                    response = Response(
                        review.export_json(),
                        media_type="application/json",
                        headers={
                            "Content-Disposition": 'attachment; filename="matchdesk-review.json"'
                        },
                    )
                elif action == "export.csv":
                    response = Response(
                        review.export_csv(),
                        media_type="text/csv",
                        headers={
                            "Content-Disposition": 'attachment; filename="matchdesk-proposed-allocations.csv"'
                        },
                    )
                else:
                    if request.method == "POST":
                        review.check_version(body.get("version"))
                        if action == "demo":
                            from matchdesk.review import demo_dataset

                            review.replace(demo_dataset())
                        elif action == "import":
                            mapping = body.get("mappings")
                            if not isinstance(mapping, dict):
                                raise ValueError("Confirm both CSV column mappings.")
                            dataset = import_dataset(
                                body.get("invoices"), body.get("payments"), mapping
                            )
                            review.replace(dataset)
                        elif action == "scope":
                            review.set_scope(body.get("payment_id"), body.get("customer"))
                        elif action == "evidence":
                            review.set_note(body.get("payment_id"), body.get("note"))
                        elif action == "approve":
                            review.approve(
                                body.get("payment_id"),
                                body.get("invoice_ids"),
                                body.get("acknowledged"),
                            )
                        elif action == "undo":
                            review.undo(body.get("payment_id"))
                        else:
                            raise ValueError("Unknown workspace action.")
                    response = JSONResponse(review.state())
                response.set_cookie(
                    "matchdesk_session", token, httponly=True, samesite="strict", max_age=TTL
                )
                response.headers["Cache-Control"] = "no-store"
                response.headers["X-Content-Type-Options"] = "nosniff"
                return response
        except Conflict as exc:
            return JSONResponse({"error": str(exc), "refresh": True}, status_code=409)
        except (ValueError, TypeError, KeyError) as exc:
            message = (
                str(exc)
                if isinstance(exc, ValueError)
                else "Some fields are invalid. Check the file mappings and selected payment."
            )
            return JSONResponse({"error": message}, status_code=400)

    async def static(request):
        filename = request.path_params.get("filename", "index.html")
        if filename not in {"index.html", "styles.css", "app.js"}:
            return Response("Not found", status_code=404)
        response = FileResponse(STATIC / filename)
        response.headers["Cache-Control"] = "no-cache"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    async def sample(request):
        role = request.path_params["role"]
        if role not in {"invoices", "payments"}:
            return Response("Not found", status_code=404)
        return FileResponse(
            DATA / f"{role}.csv", media_type="text/csv", filename=f"sample-{role}.csv"
        )

    async def health(request):
        return JSONResponse({"status": "ok", "app": "MatchDesk"})

    return Starlette(
        routes=[
            Route("/health", health),
            Route("/", static),
            Route("/static/{filename}", static),
            Route("/samples/{role}.csv", sample),
            Route("/api/{action}", api, methods=["GET", "POST"]),
        ]
    )


app = create_app()
