# Hermes 0.23.1 — Windows x64 stable candidate

This is the only current V7 release target. The earlier 0.23.0 candidate was
withdrawn before public promotion. Its tests do not count as acceptance of this
release, and its signing sequence will not be reused.

## Identity

| Field | Value |
| --- | --- |
| Release ID | `hermes-0.23.1-dopi.1-win-x64` |
| Official upstream commit | `3b421578588243f920886e6fe79a6faa87ea026e` |
| Official source ZIP SHA-256 | `c3e18ceab5f0c08f9aeb3fea9a0f9a18c93167aed816a451f1bab61a19d0ac21` |
| Platform | Windows x64 |
| Minimum V7 client | `0.19.14` |
| Matching V7 client | `0.19.14` |
| Release sequence | `4` |
| Publisher key ID | `9039e9cdda2e376e` |
| Extracted payload | 37,979 files; 1,621,409,354 bytes |

The matching client contains the 0.23.1 gateway and the pnpm workspace update
adapter. The older 0.19.13 client has not been accepted with this runtime;
install 0.19.14 first. V8/custom products retain their separate identities and
controlled runtime policies.

## Upstream and integration changes

The [official release](https://github.com/NousResearch/hermes-agent/releases/tag/v0.23.1)
fixes the plugin catalog size limit that caused older versions to fall back to
their bundled catalog. It also includes gateway group and shared connection
changes. Not every upstream feature is exposed in the DOPI interface.

The DOPI integration accepts the new native group roster structure, implements
the existing background `refreshInPlace` contract without changing foreground
navigation, and uses upstream PM's pinned Node/pnpm tools and frozen workspace
dependencies. Node 26 was already required by the preceding upstream versions;
the relevant build migration is npm to pnpm, not a newly introduced Node floor.
The old npm build path remains supported. A candidate source build no longer
overwrites the active generated reasoning contract. Stable and official-latest
checks report no update when the active upstream commit already matches.

## Construction and verification

The real production source updater built this exact version from a verified
0.22.7 base, and passed matching gateway/management API preflight and full file
inventory checks. The original baseline remained unchanged. The stable payload
uses upstream's contained assembly and reviewed sealed Windows launcher patch.

All 105 installed Python distributions match the frozen upstream lock. The
official override-aware dependency check passes; raw pip-style checking still
reports the upstream browser-harness/Pillow override and is not an unqualified
pip-check pass. Candidate runtime files and mutable user data remain separate.

The V7 installer build and actual ASAR/resource/privacy/media audits passed.
It is not Windows Authenticode signed. Runtime Ed25519 signing is a separate
integrity mechanism and must not be described as Authenticode signing.

Final archive identities, clean-Windows results, source materials, anonymous
downloads and packaged-client update results will be recorded after their gates
complete. The public stable runtime channel remains 0.22.7 until promotion.
The separate private CNB client installer feed is not published by this runtime
release.

## Version-specific artifacts

| Attachment | Bytes | SHA-256 |
| --- | ---: | --- |
| `Hermes-0.23.1-dopi.1-win-x64.tar.gz` | 607,116,765 | `6f139ee48d59f06444d962fc4ae308cc7997a113fbd62affc542212d78a2baf4` |
| `release.json` | 8,118,693 | `c45f31376b12bed6acfbba87b0db28996b4337cfc5280c46d994d90bada435af` |
| `hermes-0.23.1-dopi.1-build-source.tar.gz` | 649,403 | `90290a848038ee02d5cbc913faa6447f4a479ce4a4d186732f919f540d844e40` |

The signed envelope binds the archive, full extracted file inventory, exact
upstream commit, sequence and minimum client. Verification uses the public key
already pinned in the application; a colocated public key is not a trust anchor.

The 53-file source attachment includes integration/overlay source, the reviewed
launcher patch, frozen upstream dependency and PM lock files, construction
records and exact upstream source references. Hermes retains MIT licensing and
the DOPI integration retains its existing AGPL-3.0-only licensing. Build-record
paths must be configured for another build machine.

All seven inherited tool directories match the verified 0.22.7 baseline byte
for byte. pnpm 12.15.0 is used during the build in isolated scratch and is not
added to the stable runtime payload. No dependency notice material is missing
from the inventory, and the payload and source-material privacy scans report
no issues. This is a notice-material inventory, not a comprehensive legal opinion.

Git and FFmpeg corresponding-source attachments remain available in the
[0.22.5 tool-source release](https://github.com/silencerls018/hermes-portable/releases/tag/hermes-0.22.5-dopi.1-win-x64):

| Attachment | Bytes | SHA-256 |
| --- | ---: | --- |
| `hermes-0.22.5-portablegit-sources.tar` | 847,768,064 | `5027d6f4863a31af9ebefbeca12b0f01ce16cc35cf9219b574f8633a6de7b50b` |
| `hermes-0.22.5-ffmpeg-sources.tar` | 1,267,914,752 | `fbe907f5eed0e68b68006123021ec090551b12f81a083aaea65cbe3a950ad4cb` |
