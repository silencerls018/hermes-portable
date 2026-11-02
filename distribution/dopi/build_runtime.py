"""Build DOPI's portable Hermes core using the upstream PM and payload APIs.

This selects components; upstream owns dependency resolution, relocation and launchers.
Build output and state must be outside the checkout and are never read from a live profile.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import tomllib
from urllib.parse import unquote, urlparse

SOURCE = Path(__file__).resolve().parents[2]
UPSTREAM = "bf0203a794a07aac3ff764972ab9087baa4e4f4e"
VERSION = "0.22.5"
TOOLS = ("python", "uv", "node", "npm", "git", "ripgrep", "ffmpeg")
OPTIONAL_TOOLS = ("agent-browser", "chromium", "cua-driver", "llamacpp-cpu")
EXTRAS = ("mcp", "messaging")
PAYLOAD_PATCHES = ("windows-sealed-launchers.patch",)


def prepare_environment(work: Path, out: Path) -> Path:
    concurrency = os.environ.get("UV_CONCURRENT_DOWNLOADS", "4")
    if not concurrency.isascii() or not concurrency.isdecimal() or not 1 <= int(concurrency) <= 32:
        raise ValueError("UV_CONCURRENT_DOWNLOADS must be an integer from 1 to 32")
    for name in tuple(os.environ):
        if name.startswith(("HERMES_", "OXLYC_", "DOPI_", "PYTHON")) or name.endswith(
                ("_API_KEY", "_TOKEN", "_PASSWORD", "_SECRET")):
            os.environ.pop(name, None)
    home = work / "home"
    home.mkdir(parents=True, exist_ok=True)
    cache = work / "uv-cache"
    os.environ.update({
        "HOME": str(home), "USERPROFILE": str(home),
        "APPDATA": str(home / "AppData/Roaming"),
        "LOCALAPPDATA": str(home / "AppData/Local"),
        "HERMES_HOME": str(home / ".hermes"),
        "HERMES_RUNTIME_DIR": str(out / "tools"),
        "HERMES_PYTHON_SRC_ROOT": str(SOURCE),
        "UV_CACHE_DIR": str(cache), "PYTHONNOUSERSITE": "1",
        "UV_CONCURRENT_DOWNLOADS": str(int(concurrency)),
        "PYTHONDONTWRITEBYTECODE": "1",
        "XDG_CACHE_HOME": str(work / "cache"),
        "XDG_CONFIG_HOME": str(work / "config"),
    })
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(SOURCE))
    return cache


def verify_wheelhouse(wheelhouse: Path, lock: Path) -> None:
    """Only immutable artifacts named and hashed by the upstream lock may enter PM."""
    allowed: dict[str, tuple[str, int | None]] = {}
    for package in tomllib.loads(lock.read_text(encoding="utf-8"))["package"]:
        for wheel in package.get("wheels", []):
            name = unquote(Path(urlparse(wheel["url"]).path).name)
            identity = (wheel["hash"], wheel.get("size"))
            if name in allowed and allowed[name] != identity:
                raise ValueError("Ambiguous locked wheel filename: " + name)
            allowed[name] = identity
    wheels = list(wheelhouse.iterdir())
    if not wheels:
        raise ValueError("Wheelhouse is empty")
    for wheel in wheels:
        if not wheel.is_file() or wheel.is_symlink() or wheel.name not in allowed:
            raise ValueError("Wheelhouse contains an unlocked artifact: " + wheel.name)
        expected_hash, expected_size = allowed[wheel.name]
        with wheel.open("rb") as stream:
            actual = "sha256:" + hashlib.file_digest(stream, "sha256").hexdigest()
        if actual != expected_hash or (expected_size is not None and wheel.stat().st_size != expected_size):
            raise ValueError("Locked wheel verification failed: " + wheel.name)


def build_dependencies(out: Path, python: Path, cache: Path,
                       wheelhouse: Path | None = None) -> None:
    from pm import build_environment, build_requirements_environment, export_requirements

    repo, venv = out / "hermes-agent", out / "venv"
    # prepare_environment rebound this process to a build-only home and removed account secrets.
    if wheelhouse is None:
        build_environment(source=repo, python=python, out=venv, cache=cache,
                          env=dict(os.environ), extras=EXTRAS, frozen=True,
                          sealed=True, explicit=True, timeout=7200)
        return
    verify_wheelhouse(wheelhouse, repo / "uv.lock")
    with tempfile.TemporaryDirectory(prefix="dopi-locked-export-") as temporary:
        requirements = Path(temporary) / "requirements.txt"
        export_requirements(repo, requirements, extras=EXTRAS, python=python,
                            cache=cache, env=dict(os.environ), explicit=True)
        build_requirements_environment(
            requirements.read_text(encoding="utf-8").splitlines(), out=venv,
            python=python, cache=cache, env=dict(os.environ), wheelhouse=wheelhouse,
            offline=True, sealed=True, explicit=True, lock=repo / "uv.lock")


def apply_payload_patches(repo: Path) -> None:
    """Apply only the reviewed compatibility patches to the exact upstream snapshot."""
    for name in PAYLOAD_PATCHES:
        patch = Path(__file__).with_name("patches") / name
        subprocess.run(["git", "apply", "--no-index", "--check", str(patch)],
                       cwd=repo, check=True, timeout=30)
        subprocess.run(["git", "apply", "--no-index", str(patch)],
                       cwd=repo, check=True, timeout=30)


def build(out: Path, work: Path, web: Path | None, wheelhouse: Path | None = None) -> dict:
    if out.exists() and any(out.iterdir()):
        raise ValueError("Output must be empty. Use a new output for each build.")
    if out.is_relative_to(SOURCE) or work.is_relative_to(SOURCE):
        raise ValueError("Keep build outputs and state outside the source checkout.")
    revision = subprocess.check_output(
        ["git", "rev-parse", "--verify", UPSTREAM + "^{commit}"],
        cwd=SOURCE, text=True, timeout=30).strip()
    cache = prepare_environment(work, out)
    from pm import prepare_tools
    from pm.lock import Facts
    from pm.registry import get_package
    from pm.store import current_target
    from scripts.bundles.native import prune_staged_store, stage_pm_runtime
    from scripts.bundles.payload import INERT_SNAPSHOT_DIRS, snapshot

    target = current_target()
    if target != "win32-x64":
        raise ValueError("This initial release is built and validated on Windows x64 only.")
    out.mkdir(parents=True, exist_ok=True)
    repo, store = out / "hermes-agent", out / "tools"
    print("Snapshotting pinned upstream source", flush=True)
    snapshot(SOURCE, revision, repo, exclude=INERT_SNAPSHOT_DIRS)
    apply_payload_patches(repo)
    print("Preparing pinned tools: " + ", ".join(TOOLS), flush=True)
    prepare_tools(TOOLS, out=store, target=target, cache=cache)
    prune_staged_store(store, list(TOOLS))
    facts = Facts(store / "facts.json")
    python_fact = facts.get("python")
    python = get_package("python").binary(store / python_fact["entry"], target)
    if python is None:
        raise RuntimeError("PM did not stage its interpreter")
    print("Preparing independent PM runtime", flush=True)
    stage_pm_runtime(out, python, repo, cache=cache)
    print("Preparing locked application dependencies", flush=True)
    build_dependencies(out, python, cache, wheelhouse)
    return finish_payload(out, web)


def finish_payload(out: Path, web: Path | None = None) -> dict:
    from pm.features import write_features
    from pm.lock import Facts
    from pm.packages import Venv
    from pm.registry import get_package, walk
    from pm.store import current_target
    from scripts.build.agent import assemble
    from scripts.build.inputs import AgentInputs, RESOURCE_ENV, dependency_site
    from scripts.bundles.payload import record_tools
    from scripts.write_install_stamp import write_stamp

    target = current_target()
    repo, store, venv = out / "hermes-agent", out / "tools", out / "venv"
    facts = Facts(store / "facts.json")
    python_fact = facts.get("python")
    python = get_package("python").binary(store / python_fact["entry"], target)
    revision = UPSTREAM
    write_features(list(EXTRAS), out)
    facts.record_state("venv", Venv(repo).expected_stamp(list(EXTRAS), plugin_dirs=[]), list(EXTRAS))
    entries = {package.name: fact["entry"] for package in walk(TOOLS)
               if (fact := facts.get(package.name)) and "entry" in fact}
    record_tools(out, SOURCE / "pm/lock.json", target, entries)
    stamp = repo / "install-stamp.json"
    write_stamp(stamp, commit=revision, branch="codex/hermes-portable", dirty=bool(PAYLOAD_PATCHES),
                base_version=VERSION, display_version=VERSION, distance=0,
                source="dopi-portable", distribution="desktop-app", update_mechanism="external")
    inputs = AgentInputs(
        project=repo / "pyproject.toml", code=repo, repo="hermes-agent",
        placement="contained", target=target, python=python,
        site_packages=dependency_site(venv, python_fact["version"], target),
        environment=venv, tools=store, pm_runtime=out / "pm-runtime", ref=revision,
        stamp=stamp, features=out / "enabled-features.json",
        resources={name: repo / name for name in RESOURCE_ENV},
        frontends={"web": web} if web else {},
    )
    print("Assembling official portable launcher and manifest", flush=True)
    manifest = assemble(inputs, out)
    from scripts.build.launchers import render_wrapper
    support = out / "runtime"
    support.mkdir(exist_ok=True)
    (support / "official_launcher_init.py").write_text(
        render_wrapper("hermes_cli.main:main", "../" + manifest["runtime"]["repoDir"],
                       "../" + manifest["runtime"]["sitePackages"]), encoding="utf-8")
    shutil.copy2(Path(__file__).with_name("runtime_bootstrap.py"), support / "python.py")
    manifest["runtime"]["pythonBootstrap"] = "runtime/python.py"
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    from scripts.bundles.bytecode import bake_bytecode
    print("Baking the official read-only bytecode cache", flush=True)
    bake_bytecode(out, python)
    patches = []
    for name in PAYLOAD_PATCHES:
        original = Path(__file__).with_name("patches") / name
        target_patch = out / "build-info" / "patches" / name
        target_patch.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, target_patch)
        patches.append({"path": target_patch.relative_to(out).as_posix(),
                        "sourcePath": original.relative_to(SOURCE).as_posix(),
                        "sha256": hashlib.sha256(original.read_bytes()).hexdigest(),
                        "baseCommit": UPSTREAM})
    selection = {"schema": 1, "upstreamCommit": revision, "hermesVersion": VERSION,
                 "tools": list(TOOLS), "extras": list(EXTRAS),
                 "optionalTools": list(OPTIONAL_TOOLS),
                 "optionalDownloads": True, "applicationOwner": "DOPI",
                 "offlineDependencyRebuildCache": False, "payloadPatches": patches}
    (out / "dopi-build.json").write_text(json.dumps(selection, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"out": str(out), "runtime": manifest["runtime"]}), flush=True)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--work", type=Path, required=True)
    parser.add_argument("--web", type=Path)
    parser.add_argument("--wheelhouse", type=Path)
    args = parser.parse_args()
    build(args.out.resolve(), args.work.resolve(), args.web.resolve() if args.web else None,
          args.wheelhouse.resolve() if args.wheelhouse else None)


if __name__ == "__main__":
    main()
