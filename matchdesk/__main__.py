import argparse
import json
import threading
import time
import urllib.request
import webbrowser

import uvicorn


def main():
    parser = argparse.ArgumentParser(description="Start the local MatchDesk review workspace")
    parser.add_argument("--port", type=int, default=8503)
    parser.add_argument(
        "--open-browser",
        action="store_true",
        help="Open the workspace after the local server is healthy",
    )
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Choose a port from 1024 to 65535.")
    if args.open_browser:

        def open_when_ready():
            url = f"http://127.0.0.1:{args.port}"
            for _ in range(50):
                try:
                    with urllib.request.urlopen(url + "/health", timeout=1) as response:
                        if json.load(response).get("app") == "MatchDesk":
                            webbrowser.open(url)
                            return
                except (OSError, ValueError):
                    pass
                time.sleep(0.1)

        threading.Thread(target=open_when_ready, daemon=True).start()
    print(
        f"MatchDesk: http://127.0.0.1:{args.port} — local proposed-allocation review, no external posting."
    )
    uvicorn.run("matchdesk.server:app", host="127.0.0.1", port=args.port, access_log=False)


if __name__ == "__main__":
    main()
