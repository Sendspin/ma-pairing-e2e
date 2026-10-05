# ma-pairing-e2e

End-to-end coverage of the Music Assistant pairing flow that doubles as a
source of screen recordings.

Each spec drives a real browser against a real Music Assistant server, with a
real Sendspin client standing in for the speaker. Run it in test mode and it is
a regression test over the whole stack; run it in record mode and the same
steps become a video of the workflow, paced and cursored for a human viewer.

That combination is the point: the walkthrough in the documentation and the
test in CI can never drift apart, because they are the same script.

## Flows

| Flow | What it covers |
| --- | --- |
| Onboarding | First run: the setup wizard, from creating the admin account through to the app. |
| Pairing | Pairing a Sendspin speaker by pairing code, driven from the player picker. |

The speaker is not hardware. It is a headless [`@sendspin/sendspin-js`](https://www.npmjs.com/package/@sendspin/sendspin-js)
client running inside the harness, so the pairing code it receives over the
protocol gets typed into the UI exactly as a person would type it off a
device's screen.

## Requirements

- Docker: the server under test runs as the official container image
- Node >= 22 and pnpm

## Quick start

```bash
pnpm install
pnpm exec playwright install chromium
```

Test mode, fast, no video:

```bash
pnpm test
```

Record mode: human pacing, a visible cursor, videos written to `recordings/`:

```bash
pnpm record
```

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `MA_IMAGE` | `ghcr.io/music-assistant/server:beta` | Server image to run against |
| `RECORD` | unset | Any value enables record mode |

To run against a different release line:

```bash
MA_IMAGE=ghcr.io/music-assistant/server:nightly pnpm test
```

## How it works

Every spec boots its own server container with an empty data directory and
randomized host ports, then tears it down afterwards, so runs are isolated from
each other and from any Music Assistant you have running locally.

Only the onboarding spec walks the onboarding UI. Every other spec starts from
a **seeded start**: the harness creates the first admin over `POST /setup`,
marks onboarding complete and injects the returned token, so the recording
opens on the flow itself rather than on a login screen.

Two details worth knowing before you change a spec:

- The server only reports itself started once it has downloaded a
  beat-detection model, which is slow on a cold cache. Containers share a
  `ma-pairing-e2e-model-cache` volume for it, so the first boot on a fresh
  machine takes minutes and later ones take seconds.
- The frontend's initial player fetch excludes protocol players, so a Sendspin
  speaker that connected before the page loaded is invisible to the UI. The
  pairing spec reconnects the speaker once the page is subscribed to force the
  event that makes it appear.

## Container cleanup

Containers are labelled `ma-pairing-e2e=1`, and every run first removes any an
interrupted earlier run left behind (a killed runner never reaches teardown).
To clean up by hand:

```bash
pnpm clean
```

## Recording unreleased changes

To record a server checkout, and optionally a frontend checkout, bake them into
an image on top of a released one and point `MA_IMAGE` at the result:

```bash
node scripts/build-preview-image.mjs --server ../server --frontend ../frontend
MA_IMAGE=ma-pairing-e2e:preview pnpm record
```

Building an image rather than running the checkouts directly on your host keeps
the container's isolated network, so recordings never pick up the speakers on
your LAN.

## Adding a flow

Add a spec under `specs/`, using the fixtures in `fixtures/`:

- `test.ts` provides the `maServer` fixture (boot, teardown, logs on failure)
- `seed.ts` gives you the seeded start and an API token
- `speaker.ts` is the headless Sendspin client
- `human.ts` wraps clicks, typing and pauses so record mode looks human
- `api.ts` is a small WS API client for assertions the UI cannot make

Specs assert against current UI text and roles, which is deliberate: when a
flow changes upstream, the spec fails and the recording gets refreshed in the
same edit. Expect to update specs when the UI legitimately changes.

## CI

One workflow ([e2e.yml](.github/workflows/e2e.yml)):

- push and pull requests run the specs in test mode
- a nightly run does the same, but skips when the image digest has not changed
  since the last pass
- a manual dispatch takes an image and a `record` flag, and uploads the
  resulting videos as artifacts

## Licence

Apache 2.0, see [LICENSE](LICENSE).
