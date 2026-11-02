"""Sealed worker launches must not rewrite their signed runtime tree."""
import json
import subprocess
import sys

import pytest

from hermes_cli._launchers import runtime_command


@pytest.mark.parametrize("sealed", [True, False])
def test_worker_bytecode_policy(tmp_path, monkeypatch, sealed):
    repo = tmp_path / "payload" / "hermes-agent"
    repo.mkdir(parents=True)
    (repo / "hermes_bootstrap.py").write_text("", encoding="utf-8")
    (repo / "worker_probe.py").write_text("VALUE = 42\n", encoding="utf-8")
    if sealed:
        (repo / "install-stamp.json").write_text(
            json.dumps({"distribution": "desktop-app"}), encoding="utf-8")
    monkeypatch.delenv("PYTHONDONTWRITEBYTECODE", raising=False)
    command = runtime_command(
        repo, python=sys.executable, home=tmp_path / "home",
        code="import worker_probe; print(worker_probe.VALUE)")
    result = subprocess.run(command, cwd=tmp_path, capture_output=True,
                            text=True, timeout=30, check=False)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "42"
    assert bool(list(repo.rglob("*.pyc"))) is not sealed


@pytest.mark.parametrize("sealed", [True, False])
def test_service_identity_matches_its_worker_command(tmp_path, monkeypatch, sealed):
    from hermes_cli import gateway
    from hermes_cli.gateway_runtime_service_identity import _launch_module

    repo = tmp_path / "payload" / "hermes-agent"
    repo.mkdir(parents=True)
    if sealed:
        (repo / "install-stamp.json").write_text(
            json.dumps({"distribution": "desktop-app"}), encoding="utf-8")
    monkeypatch.setattr(gateway, "PROJECT_ROOT", repo)
    command = runtime_command(repo, ["gateway", "run"], python=sys.executable)
    assert _launch_module(command) == ("hermes_cli.main", ["gateway", "run"])
    tampered = command.copy()
    tampered[tampered.index("-c") + 1] += "; print('injected')"
    assert _launch_module(tampered) is None
