"""Execute DOPI-owned Python calls with the official contained runtime setup.

Invoke with the manifest store interpreter and -I -B -X utf8. The host must verify
the payload before launching this file. No host site-packages are imported.
"""
from __future__ import annotations

import importlib
from pathlib import Path
import runpy
import sys


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    setup = runpy.run_path(str(root / "runtime" / "official_launcher_init.py"))
    setup["configure"](str(root / "bin"))
    importlib.import_module("hermes_bootstrap")
    args = sys.argv[1:]
    if not args:
        raise SystemExit("Expected -m MODULE, -c CODE or a Python script")
    if args[0] == "-m":
        if len(args) < 2:
            raise SystemExit("-m requires a module")
        sys.argv = args[1:]
        runpy.run_module(args[1], run_name="__main__", alter_sys=True)
    elif args[0] == "-c":
        if len(args) < 2:
            raise SystemExit("-c requires code")
        sys.argv = ["-c", *args[2:]]
        exec(compile(args[1], "<string>", "exec"), {"__name__": "__main__", "__builtins__": __builtins__})
    elif args[0].startswith("-"):
        raise SystemExit("Unsupported Python invocation")
    else:
        sys.argv = args
        runpy.run_path(args[0], run_name="__main__")


if __name__ == "__main__":
    main()
