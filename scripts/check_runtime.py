import importlib.util
import sys

if __name__ == "__main__":
    raise SystemExit(
        0
        if sys.version_info >= (3, 11)
        and all(importlib.util.find_spec(name) for name in ("starlette", "uvicorn"))
        else 1
    )
