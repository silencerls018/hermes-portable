# DOPI portable Hermes runtime

This branch builds a pinned Hermes runtime for DOPI. It contains no DOPI application source,
user profiles, credentials, activation data or publisher keys. Upstream Hermes remains the
owner of dependency management, the contained payload format and relative Windows launchers.

## Current release target: Hermes 0.23.1 for V7

The Windows x64 target is `hermes-0.23.1-dopi.1-win-x64`, based on upstream commit
`3b421578588243f920886e6fe79a6faa87ea026e`. The matching client build is 0.19.14.
Acceptance and publication are still pending. V8 and custom licensed runtime
distributions are outside this release's scope.

The earlier [0.23.0 candidate](../release/records/hermes-0.23.0-dopi.1-win-x64.md)
was cancelled and its draft deleted before promotion. It is not an installable release.
The historical builder below still pins 0.22.5; it is not a one-command reproduction
of later releases. Their exact upstream source, frozen dependency inputs, patches and
integration materials are distributed as version-specific source attachments.

## Historical 0.22.5 builder

The retained builder uses an existing host Python 3.14 and Git (build-machine requirements only):

```powershell
git fetch --depth=1 https://github.com/NousResearch/hermes-agent.git bf0203a794a07aac3ff764972ab9087baa4e4f4e
python distribution/dopi/build_runtime.py --out C:/build/dopi-runtime --work C:/build/dopi-work
```

The distribution repository can retain the upstream source as a snapshot rather than its
complete history. The explicit fetch above supplies the immutable upstream Git object used
by `git archive`; the build never archives an unrelated parent repository or a moving branch.

The build defaults to four concurrent dependency downloads (override
`UV_CONCURRENT_DOWNLOADS` with an integer from 1 to 32). A one-setting extension to the
checkout's PM transport allowlist preserves this setting through PM workers. It does not
change dependency selection, index credentials or TLS validation. The runtime starts from
the exact upstream commit and excludes this build-only transport patch.

One reviewed compatibility patch moves the existing sealed-bundle check before the
Windows CLI publication branch and disables implicit bytecode writes in sealed worker launches.
Without these fixes, first-home boot bootstrap writes source launchers and isolated worker
processes rewrite Python caches inside the immutable payload. Service identity checks match
the generated worker arguments exactly, and build-time compilation preserves the interpreter
tree. Source installs retain their publication and bytecode behavior.
The patch is shipped under `build-info/patches`; `dopi-build.json` records its SHA-256 and
upstream base commit. The install stamp marks the adapted source as dirty; `manifest.ref`
identifies the upstream baseline, while the signed file inventory covers the actual patched bytes.

For unreliable build-machine networks, `--wheelhouse C:/build/verified-wheels` accepts
official wheel files downloaded separately. Every file must match an exact filename and
SHA-256 in the pinned upstream `uv.lock`, plus its recorded size when present;
unknown or modified files fail the build.
The builder uses upstream PM's frozen requirements export and offline, sealed requirements
environment builder, including the lock's dependency overrides and final dependency check.
This is a build input, not a copied developer environment or a runtime download dependency.

The output is a complete immutable core payload with an upstream `manifest.json`. Consumers
read `runtime.storePython`, `runtime.repoDir`, `runtime.sitePackages` and `runtime.commands`.
Use the generated `bin/hermes.exe` launcher for Hermes CLI commands. For host-owned Python
helpers, invoke `runtime.storePython` with `-I -B -X utf8`, then the absolute path to
`runtime.pythonBootstrap`, then the original `-m module`, `-c code`, or script arguments.
The bootstrap reuses the generated official launcher initializer, including `.pth` handling;
a copied venv redirector is not a portable interpreter.
Clear inherited `PYTHONHOME`/`PYTHONPATH` before starting the process.
Set `PYTHONDONTWRITEBYTECODE=1` for every runtime process and worker launcher;
the generic Python helper additionally uses `-B` because isolated mode ignores Python environment settings.

The initial component selection includes the core, MCP and messaging requirements plus
Python, uv, Node, npm, Git, ripgrep and the upstream-required FFmpeg.
Browser, ComputerUse and local-model runtimes remain optional upstream PM components.
The FFmpeg binary retains its GPL notices and corresponding-source distribution obligations;
functional acceptance alone does not authorize publishing an incomplete source offer.
DOPI's existing media runtime remains separate. An offline dependency-rebuild cache
is deliberately not shipped; the prepared core starts without dependency downloads, while
installing additional components still requires networking. DOPI's account/model networking
requirements are independent of core runtime preparation.

Release assembly must add the matching prebuilt DOPI Hermes interface and produce the signed
release descriptor. Do not treat `manifest.json` or a colocated hash file as a trust anchor.
Build and test in isolated homes; the payload never contains a maintainer's live Hermes home.
Runtime updates are externally owned by DOPI and must replace a verified version directory.
Keep all upstream and third-party license notices with the distribution.
