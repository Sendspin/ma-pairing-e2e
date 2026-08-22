# 1. Server under test is the official Docker image

Date: 2026-08-22

## Status

Accepted

## Context

Each spec needs a fresh, disposable Music Assistant server. The server is not
published on PyPI; it ships as GitHub release tags (installable via
`pip install git+...@tag`) and as the official container image
`ghcr.io/music-assistant/server` with `stable`, `beta` and `nightly` channel tags.

Candidates considered:

1. A `uv`-managed venv with the server installed from a pinned git tag.
2. The official Docker image, channel-tagged.
3. A local server checkout.

## Decision

Specs run against the official Docker image, default channel `beta`
(overridable via `MA_IMAGE`). The fixture starts a fresh container per spec
with randomized host ports and no volume, so state is ephemeral and a locally
running Music Assistant instance is never disturbed.

## Consequences

- The harness tests the artifact users actually run, including the bundled
  frontend and ffmpeg, and needs no Python toolchain at all.
- Channel tags track releases without manual pin bumps; CI gates its scheduled
  runs on the image digest changing.
- Docker becomes a hard local requirement.
- The hardcoded Sendspin port (8927) stops being a collision concern because
  container ports map to ephemeral host ports.
- Testing unreleased server changes requires building a local image or adding
  a local-checkout mode later; that is deliberately out of scope for now.
