# ma-e2e-test

Recording-first end-to-end harness for [Music Assistant](https://music-assistant.io).
Each spec walks a real user workflow in a real browser against a real server and
doubles as a last-mile integration test: real bundled frontend, real WS API, real
Sendspin client. In record mode the same spec produces a screen recording of the
workflow.

See [CONTEXT.md](CONTEXT.md) for the vocabulary used throughout this repo.

## Flows

- **Onboarding**: first-run wizard, creating the admin user.
- **Dynamic-PIN pairing**: pairing a Sendspin speaker. The speaker is played by a
  headless `@sendspin/sendspin-js` client running inside the harness; the PIN it
  receives is typed into the UI like a real user would.

## Requirements

- Docker (the server under test runs as the official container image)
- Node >= 22 and pnpm

## Usage

```bash
pnpm install
pnpm exec playwright install chromium
```

Run the specs (test mode, no video):

```bash
pnpm test
```

Produce recordings (video + slowed pacing, output in `recordings/`):

```bash
pnpm record
```

## Configuration

| Env var    | Default                                | Meaning                       |
| ---------- | -------------------------------------- | ----------------------------- |
| `MA_IMAGE` | `ghcr.io/music-assistant/server:beta`  | Server image to test against  |
| `RECORD`   | unset                                  | Any value enables record mode |

Every spec boots a fresh server container with randomized host ports and tears it
down afterwards, so a locally running Music Assistant instance is not disturbed.

## CI

One workflow ([e2e.yml](.github/workflows/e2e.yml)):

- push/PR runs the specs in test mode against the `beta` channel
- a nightly cron does the same, but only when the `beta` image digest changed
  since the last successful scheduled run (stored in the `LAST_TESTED_DIGEST`
  repo variable)
- a manual dispatch with the `record` input produces the flow videos as
  workflow artifacts
