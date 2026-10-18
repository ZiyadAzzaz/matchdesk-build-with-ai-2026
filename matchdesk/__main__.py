import argparse

import uvicorn


def main():
    parser = argparse.ArgumentParser(description="Start the local MatchDesk review workspace")
    parser.add_argument("--port", type=int, default=8503)
    args = parser.parse_args()
    print(
        f"MatchDesk: http://127.0.0.1:{args.port} — local proposed-allocation review, no external posting."
    )
    uvicorn.run("matchdesk.server:app", host="127.0.0.1", port=args.port, access_log=False)


if __name__ == "__main__":
    main()
