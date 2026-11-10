# Portable runtime releases

This directory packages the immutable output of `distribution/dopi/build_runtime.py`.
It does not package a maintainer's Python environment, Hermes home, DOPI project,
account, API key, or signing key. Upstream Hermes and dependency notices remain in
the runtime. The DOPI application source is maintained separately.

## Current release record

The only current target is `hermes-0.23.1-dopi.1-win-x64`, matching V7 client 0.19.14.
It is still under acceptance testing. The earlier
[0.23.0 candidate](records/hermes-0.23.0-dopi.1-win-x64.md) was cancelled and its draft
deleted; no public channel was promoted to it. Preparing or uploading a draft does not
promote the runtime channel or the separate DOPI client installer channel.

The historical 0.22.5 builder and 0.22.7 license material remain in this repository.
Version-specific source attachments and release records identify later assembly inputs;
do not infer a released payload's upstream version from the retained builder defaults.

## Release procedure

Release order:

1. Build the pinned runtime with the official Hermes PM and assembly interfaces.
2. Add the matching, prebuilt desktop assets and their `oxlyc-build.json` stamp.
3. Test the complete payload in a fresh Windows installation, including the
   gateway, management API, MCP, Python helpers, relocation and repeated shutdown.
4. Create a tar.gz with `pack_runtime.py`. The output must be outside the payload.
5. Sign its release envelope with `sign-release.cjs CONFIG.json`. Keep the config
   and Ed25519 private key outside Git. The configuration contains the exact
   archive URL, release ID and sequence, minimum DOPI version, upstream version
   and SHA, and relative runtime paths.
6. Publish the archive and signed envelope together under an immutable release
   tag. Never replace a release's bytes in place. Download them anonymously and
   verify both the signature and the archive digest before promoting the channel.

The release envelope contains the archive digest and size, extracted-file
inventory, runtime paths and version compatibility. The signing public key is
pinned by the DOPI application; a key delivered beside the download is not trusted.
The payload signature is separate from Windows Authenticode signing.

User state lives outside the runtime. An update is extracted to a new version
directory and tested before it replaces the active selection. Retain the previous
supported runtime until the new one has passed startup acceptance. Optional tools
are acquired through the official PM and stored outside the immutable payload.

`node --test distribution/release/sign-release.test.cjs` checks signing, content
binding and rejection of unsafe paths, mismatched UI builds and private state.
These checks do not replace fresh-Windows runtime acceptance.
