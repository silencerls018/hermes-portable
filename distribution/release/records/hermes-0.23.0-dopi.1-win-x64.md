# Hermes 0.23.0 — withdrawn candidate

Cancelled on 2026-11-10 at the maintainer's request in favor of Hermes 0.23.1.
The GitHub draft and its three attachments were withdrawn. The CNB staged uploads were
never confirmed, and neither public runtime channel was promoted. The details below are
historical candidate evidence only; they are not a distributable release and do not count
as acceptance of 0.23.1. Release sequence 3 will not be reused.

## Identity and compatibility

| Field | Value |
| --- | --- |
| Release ID | `hermes-0.23.0-dopi.1-win-x64` |
| Hermes version | `0.23.0` |
| Official upstream commit | `2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19` |
| Platform | Windows x64 |
| Product scope | DOPI V7 only; V8/custom runtime and licensing policies remain separate |
| Minimum V7 client in signed envelope | `0.19.13` |
| Matching V7 client build | `0.19.14` |
| Release sequence | `3` |
| Publisher key ID | `9039e9cdda2e376e` |
| Extracted payload | 37,546 files; 1,619,835,289 bytes |

The Hermes backend and embedded desktop use the same upstream commit. The desktop adapter
accepts the 0.23 native group roster structure while retaining support for the previous
layout. Background session refresh preserves the active BOT/group navigation; that refresh
contract already existed in 0.22.7 and is an integration fix, not a new 0.23 protocol.

Accounts, projects, chats and custom roles remain outside the immutable runtime. Updating
the runtime does not replace the DOPI application installer or change the V8/custom product
identity.

## Version-specific attachments

These values were calculated from the finalized publication artifacts. Keep the original
bytes and signed envelope together; do not replace an immutable release's contents.

| Attachment | Bytes | SHA-256 |
| --- | ---: | --- |
| `Hermes-0.23.0-dopi.1-win-x64.tar.gz` | 606,422,743 | `ec0200d8e67634297a7e35611eefc4396c3bd83a6c5b5253c234bf88f383467d` |
| `release.json` | 8,036,113 | `227a843bff8a2d639f5c83482c3fc2ec01d221af7edf5e51e4aebc99c9165b70` |
| `hermes-0.23.0-dopi.1-build-source.tar.gz` | 505,796 | `2bd2203373772f8ff327a63c1832f01d45c242c18baf39f95db32a64809ba563` |

`release.json` is an Ed25519 envelope binding the runtime archive, complete extracted-file
inventory, compatibility floor and relative runtime paths. Consumers must verify it using
the publisher public key already pinned in the application. A colocated public key or hash
is not an independent trust anchor. This signature does not assert Windows Authenticode
signing of the runtime or the separately built V7 installer.

## Source and notices

The source attachment contains 49 files: reviewed desktop embedding/build inputs, the
patched upstream files, frozen `uv.lock`, payload build records, inventory and source
references. The official source is the [archive at the exact upstream commit](https://codeload.github.com/NousResearch/hermes-agent/zip/2bd378ed1b8d6bf2192cb26e0a55ff3091e6bd19),
with SHA-256 `5b90ef7fe2e7c0bc490ee7ae451937510ed35a25ed0b6ac4e1395300384cccbc`.
Its `UPSTREAM.json` explains reproduction and license boundaries. Build-record scripts
describe this assembly; their machine-local input paths must be configured when replayed
elsewhere. They contain no publisher private key or credential.

The retained repository builder is the historical 0.22.5 implementation; this release record
does not retarget that script or replace the preserved upstream snapshot. Use the exact
0.23 source and integration materials above for this release. Hermes retains its upstream
MIT license; the supplied DOPI integration retains its existing AGPL-3.0-only license.

Git and FFmpeg payload files are unchanged from the verified 0.22.7 base: 9,293 Git files
and 44 FFmpeg files. Their corresponding-source attachments remain available from the
[0.22.5 tool-source release](https://github.com/silencerls018/hermes-portable/releases/tag/hermes-0.22.5-dopi.1-win-x64),
and their hashes are repeated in this release's `inherited-tool-sources.json`:

| Corresponding-source attachment | Bytes | SHA-256 |
| --- | ---: | --- |
| `hermes-0.22.5-portablegit-sources.tar` | 847,768,064 | `5027d6f4863a31af9ebefbeca12b0f01ce16cc35cf9219b574f8633a6de7b50b` |
| `hermes-0.22.5-ffmpeg-sources.tar` | 1,267,914,752 | `fbe907f5eed0e68b68006123021ec090551b12f81a083aaea65cbe3a950ad4cb` |

The release audit found all 106 installed Python distributions in the frozen upstream
lock and retained the official override-aware dependency check. Plain pip-style checking
still reports the upstream `browser-harness` Pillow requirement against the lock's override;
that output must not be presented as an unqualified pip-check pass. The notice audit found
no missing notice material, and the privacy audit found no issues.

## Acceptance and promotion record

| Check | Status and evidence |
| --- | --- |
| Local payload identity and startup | Passed: version/SHA and complete inventory checked before and after isolated startup and management API use; no model call |
| Matching desktop integration | Passed: native group compatibility, background refresh regressions, mock capabilities/board/BOT UI and real group create/reopen/delete/restart/project isolation |
| Local V7 0.19.14 client | Packaging tests, full build and installer assembly passed; the client installer is not Authenticode signed |
| Clean Windows VM | Pending — add final result and evidence after the run completes |
| Installed-client Hermes stable/latest update | Pending — add the final production-store update result and preserved-data checks |
| Anonymous version downloads | Pending — verify envelope signature and all published attachment hashes after the draft is published |
| Public stable/latest runtime channel | Pending — record promotion only after acceptance and public-byte verification |
| Separate CNB V7 installer channel | Not changed by this runtime release; local 0.19.14 installer preparation is separate |

Before promoting the runtime channel, replace the pending rows with the actual results.
Retain the previous supported runtime for rollback and do not alter earlier release records
or corresponding-source attachments.
