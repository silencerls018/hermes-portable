# Hermes 0.23.1 — Windows x64

This is the only current V7 stable release target, paired with client 0.19.14.
The artifacts below are frozen. Clean-Windows and final public-client acceptance
are in progress; the public stable channel has not yet been promoted.

## Identity

| Field | Value |
| --- | --- |
| Release ID | `hermes-0.23.1-dopi.1-win-x64` |
| Official upstream commit | `3b421578588243f920886e6fe79a6faa87ea026e` |
| Official source ZIP SHA-256 | `c3e18ceab5f0c08f9aeb3fea9a0f9a18c93167aed816a451f1bab61a19d0ac21` |
| Platform | Windows x64 |
| Minimum and matching V7 client | `0.19.14` |
| Release sequence | `4` |
| Publisher key ID | `9039e9cdda2e376e` |
| Extracted payload | 38,421 files; 1,677,584,856 bytes |

Install the matching V7 client first. V8 and custom products retain their own
identities, authorization and controlled runtime policies.

## Upstream and integration changes

The [official release](https://github.com/NousResearch/hermes-agent/releases/tag/v0.23.1)
fixes the plugin catalog size limit that caused silent fallback to a bundled
catalog, and includes gateway group and shared connection changes. Not every
upstream feature is exposed in the DOPI interface.

The V7 adapter follows the native group roster and background `refreshInPlace`
contract, and uses upstream PM's pinned Node/pnpm and frozen workspace workflow.
Node 26 was already an upstream requirement. On Windows, dependency scripts run
in an owned physical short checkout to avoid the observed long-working-directory
process creation failure; only validated desktop output returns to the candidate.
Candidate reasoning generation and cleanup remain isolated from the active runtime.

The required pnpm 12.15.0 tool and its PM facts are retained in both the sealed
payload and source-built candidates. After frozen synchronization, actual Python
dependencies are checked against upstream's override-aware lock before publishing
official venv state. Candidate admission uses its own Python/bootstrap and requires
`pm.drift() == {}` with lazy installation disabled. Stable and official-latest
checks return no update when the installed upstream commit already matches.

## Frozen artifacts

| Attachment | Bytes | SHA-256 |
| --- | ---: | --- |
| `Hermes-0.23.1-dopi.1-win-x64.tar.gz` | 631,807,559 | `1ec3ecfbfb5a7f23123802f04c29c8783278d3cf6bdfe14d8ff01a9f682da8a6` |
| `release.json` | 8,218,229 | `b541be0be63559d03b440969481740fdcd69485f5636f85187b504005e543845` |
| `hermes-0.23.1-dopi.1-build-source.tar.gz` | 682,966 | `8c92fb3e1d001a05fb74cc1d18537e8f2491f7adaad1445335cab7dc4856c5a9` |

The signed envelope binds the archive, complete file inventory, exact upstream
commit, release sequence and minimum client. Verification uses the public key
already pinned in V7. The actual production extractor, isolated management API,
required-core check and full inventory before/after startup have passed locally.
All 105 Python distributions match the frozen selection. Raw pip-style checking
still reports the upstream browser-harness/Pillow override; the official
override-aware dependency check passes.

The 57-file source attachment contains the integration and overlay source,
reviewed launcher patch, exact upstream locks and source references, assembly
helpers, required-tool checks and supplemental notices. Hermes retains MIT and
the DOPI integration retains AGPL-3.0-only licensing. Build-record paths must be
configured for another machine. The pnpm packages include their notices; the
supplement covers all 22 package manifests, including BlueOak license links.

## Acceptance and scope

Final acceptance is scoped to Hermes 0.23.1: clean installation, original and
Chinese/deep paths under a normal Windows user, restart, and a production source
build of the same fixed commit. That production build passed with an original
dependency lifecycle directory length of 268 characters, complete dependency
admission, real management/gateway preflight and unchanged base inventory.
Packaged V7 must then install from the public
stable feed and preserve newly created role/session data after restart. Stable
and official-latest checks must return no update and keep the active slot.
No previous-version migration matrix is part of this release.

The actual V7 ASAR, extra resources, privacy, target media binaries and installer
feed metadata passed packaging checks. The installer is not Authenticode signed;
runtime Ed25519 integrity is a separate mechanism. No paid model calls or live
user project changes are part of acceptance. The separate private CNB client
installer feed is not published by this runtime release.

Git and FFmpeg corresponding-source attachments remain available in the
[tool-source release](https://github.com/silencerls018/hermes-portable/releases/tag/hermes-0.22.5-dopi.1-win-x64):

| Attachment | Bytes | SHA-256 |
| --- | ---: | --- |
| `hermes-0.22.5-portablegit-sources.tar` | 847,768,064 | `5027d6f4863a31af9ebefbeca12b0f01ce16cc35cf9219b574f8633a6de7b50b` |
| `hermes-0.22.5-ffmpeg-sources.tar` | 1,267,914,752 | `fbe907f5eed0e68b68006123021ec090551b12f81a083aaea65cbe3a950ad4cb` |
