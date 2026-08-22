# Context

Ubiquitous language for this repo. Recording-first end-to-end harness for Music
Assistant: it walks real user workflows in a real browser against a real server
and produces both regression signal and screen recordings.

## Glossary

- **Flow**: a user-facing Music Assistant workflow worth showing and guarding,
  e.g. onboarding, pairing a speaker. The unit of scope.
- **Spec**: the executable definition of one Flow. A single spec both asserts
  every step (test) and can produce a Recording of it.
- **Recording**: the video artifact a Spec produces when run in Record mode.
  Raw capture output, no post-processing or publication pipeline.
- **Test mode**: the default way to run a Spec. Fast, assertions only, no video.
- **Record mode**: running a Spec with video capture and human-followable pacing.
- **Server under test**: the Music Assistant instance a Spec runs against,
  booted fresh (empty state) for each Spec and torn down after.
- **Channel**: which release line the Server under test comes from
  (stable / beta / nightly). Default: beta.
- **Operator**: the human role the browser automation plays, the person
  clicking through the Music Assistant UI.
- **Speaker**: the Sendspin client device being paired. Played by the harness
  itself (headless client), not by real hardware.
- **Dynamic PIN pairing**: the pairing method where the Speaker presents a PIN
  and the Operator enters it in Music Assistant. The canonical pairing Flow.
- **Seeded start**: the state every non-onboarding Spec begins from: fresh
  Server under test with the first user created, onboarding marked complete,
  and the Operator already logged in. Only the onboarding Spec walks the
  onboarding UI itself.

## Scope decisions

- Milestone 1 Flows: onboarding, dynamic-PIN pairing. Other pairing methods
  (static PIN, token, unpaired grant) are later Flows.
- Recordings are dev-grade for now: no conversion, captioning, or publication
  target until one exists.
- This repo is standalone and stays standalone. There is no goal of porting
  Specs into the server or frontend repos.
