"""Portable build inputs must not weaken the upstream lock or inherit account state."""
from __future__ import annotations

import hashlib
import importlib.util
import os
from pathlib import Path
import sys

import pytest

SPEC = importlib.util.spec_from_file_location(
    "dopi_builder", Path(__file__).resolve().parents[2] / "distribution/dopi/build_runtime.py")
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


@pytest.mark.parametrize("include_size", [True, False])
def test_wheelhouse_accepts_only_exact_upstream_artifacts(tmp_path, include_size):
    wheelhouse = tmp_path / "wheels"
    wheelhouse.mkdir()
    wheel = wheelhouse / "example-1.0-py3-none-any.whl"
    wheel.write_bytes(b"locked artifact")
    digest = hashlib.sha256(wheel.read_bytes()).hexdigest()
    size = f", size = {wheel.stat().st_size}" if include_size else ""
    lock = tmp_path / "uv.lock"
    lock.write_text(
        '[[package]]\nname = "example"\nversion = "1.0"\n'
        f'wheels = [{{url = "https://files.pythonhosted.org/{wheel.name}", '
        f'hash = "sha256:{digest}"{size}}}]\n')
    builder.verify_wheelhouse(wheelhouse, lock)
    wheel.write_bytes(b"altered artifact")
    with pytest.raises(ValueError, match="verification failed"):
        builder.verify_wheelhouse(wheelhouse, lock)
    wheel.unlink()
    (wheelhouse / "unlocked-2.0-py3-none-any.whl").write_bytes(b"unknown")
    with pytest.raises(ValueError, match="unlocked artifact"):
        builder.verify_wheelhouse(wheelhouse, lock)


@pytest.mark.parametrize("value", ["0", "33", "4 --index-url", "四", "", "1.5"])
def test_build_rejects_non_numeric_or_unbounded_concurrency(tmp_path, monkeypatch, value):
    monkeypatch.setenv("UV_CONCURRENT_DOWNLOADS", value)
    with pytest.raises(ValueError, match="integer from 1 to 32"):
        builder.prepare_environment(tmp_path / "work", tmp_path / "out")


def test_build_isolates_account_state_and_keeps_bounded_transport(tmp_path, monkeypatch):
    monkeypatch.setenv("UV_CONCURRENT_DOWNLOADS", "2")
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "live-home"))
    monkeypatch.setenv("PROVIDER_API_KEY", "do-not-forward")
    monkeypatch.setenv("DOPI_SESSION_TOKEN", "do-not-forward")
    monkeypatch.setenv("PYTHONPATH", str(tmp_path / "host-packages"))
    monkeypatch.setattr(sys, "path", list(sys.path))
    monkeypatch.setattr(sys, "dont_write_bytecode", sys.dont_write_bytecode)
    # prepare_environment intentionally replaces this build process's environment.
    monkeypatch.setattr(os, "environ", os.environ.copy())
    builder.prepare_environment(tmp_path / "work", tmp_path / "out")
    assert os.environ["UV_CONCURRENT_DOWNLOADS"] == "2"
    assert Path(os.environ["HERMES_HOME"]) == tmp_path / "work/home/.hermes"
    assert not {"PROVIDER_API_KEY", "DOPI_SESSION_TOKEN", "PYTHONPATH"} & os.environ.keys()
