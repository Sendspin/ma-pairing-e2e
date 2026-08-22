import { seededStart } from "../fixtures/seed.js";
import { Speaker } from "../fixtures/speaker.js";
import { expect, test } from "../fixtures/test.js";

const SPEAKER_NAME = "Living Room Speaker";

test("pairing: dynamic PIN via the player picker", async ({ page, context, maServer }) => {
  await seededStart(maServer, context);
  await page.goto(maServer.baseUrl);
  // The collapsed picker trigger carries aria-expanded; an open panel adds a
  // second "Select player: ..." button, so match on the expanded state.
  const pickerButton = page.getByRole("button", { name: /Select player/, expanded: false });
  await expect(pickerButton).toBeVisible({ timeout: 30_000 });

  const speaker = new Speaker(maServer.sendspinBaseUrl, SPEAKER_NAME);
  await speaker.connect();

  // The picker lists players awaiting setup; clicking such a player launches
  // its setup flow. Server-side registration lags the client connect, so
  // reopen the picker until the speaker's card shows up.
  const speakerCard = page.locator("[data-player-id]").filter({ hasText: SPEAKER_NAME });
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(pickerButton).toBeVisible({ timeout: 3_000 });
    await pickerButton.click();
    await expect(speakerCard).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
  await expect(speakerCard).toContainText("Setup required");
  await speakerCard.locator("button.player-select-action").click();

  const dialog = page.getByRole("dialog", { name: "Set up player" });
  await expect(dialog).toBeVisible();

  // The method-selection step is skipped by the server when the device
  // advertises only one usable method, so wait for either it or the PIN form.
  const methodRadio = dialog.getByRole("radio", { name: /^(Dynamic )?PIN\b/ });
  const pinField = dialog.getByLabel("PIN", { exact: true });
  await expect(methodRadio.or(pinField).first()).toBeVisible({ timeout: 30_000 });
  if (await methodRadio.isVisible()) {
    await methodRadio.check();
    await dialog.getByRole("button", { name: "Next" }).click();
  }

  const pin = await speaker.waitForPin();
  await expect(pinField).toBeVisible({ timeout: 30_000 });
  await pinField.fill(pin);
  await dialog.getByRole("button", { name: "Next" }).click();

  await expect(dialog.getByText("All set!")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Done" }).click();

  // Proof layer 1: the paired speaker is now a selectable playback target.
  await pickerButton.click();
  await expect(speakerCard).toBeVisible({ timeout: 15_000 });
  await expect(speakerCard).not.toContainText("Setup required");
  await speakerCard.locator("button.player-select-action").click();
  await expect(
    page.getByRole("button", {
      name: new RegExp(`^Select player: ${SPEAKER_NAME}`),
      expanded: false,
    }),
  ).toBeVisible({ timeout: 15_000 });

  // Proof layer 2: the speaker itself confirms and holds a long-term PSK.
  await speaker.finalized;
  expect(speaker.pairingPsk).toBeTruthy();

  // Proof layer 3: a reconnect with the same identity/storage is admitted
  // as already paired, with no new pairing round.
  speaker.disconnect();
  const reconnected = new Speaker(maServer.sendspinBaseUrl, SPEAKER_NAME, speaker.storage);
  await reconnected.connect();
  await pickerButton.click();
  await expect(speakerCard).toBeVisible({ timeout: 15_000 });
  await expect(speakerCard).not.toContainText("Setup required");
  expect(reconnected.pairingEvents).toEqual([]);
  reconnected.disconnect();
});
