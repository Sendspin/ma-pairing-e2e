import { seededStart } from "../fixtures/seed.js";
import { Speaker } from "../fixtures/speaker.js";
import { expect, test } from "../fixtures/test.js";

const SPEAKER_NAME = "Living Room Speaker";

test("pairing: dynamic PIN", async ({ page, context, maServer }) => {
  await seededStart(maServer, context);
  // Until a first provider is added the app boots every admin session into
  // the settings overview with the onboarding card, so land there first and
  // then navigate (client-side) to the players page.
  await page.goto(maServer.baseUrl);
  await expect(page.getByRole("heading", { name: "Welcome to Music Assistant!" })).toBeVisible({
    timeout: 30_000,
  });
  const speaker = new Speaker(maServer.sendspinBaseUrl, SPEAKER_NAME);
  await speaker.connect();

  // The players page loads its list on mount and does not refresh on live
  // additions, and server-side registration lags the client connect, so
  // re-enter the page until the new player shows up.
  const unpairedRow = page.locator(".player-needs-setup").filter({ hasText: SPEAKER_NAME });
  await expect(async () => {
    await page.goto(`${maServer.baseUrl}/#/settings`);
    await page.goto(`${maServer.baseUrl}/#/settings/players`);
    await expect(unpairedRow).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 45_000 });
  await unpairedRow.getByRole("button", { name: "Start setup" }).click();

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

  // Proof layer 1: the UI no longer shows the player as needing setup.
  await expect(page.locator(".player-needs-setup").filter({ hasText: SPEAKER_NAME })).toHaveCount(
    0,
  );
  // Proof layer 2: the speaker itself confirms and holds a long-term PSK.
  await speaker.finalized;
  expect(speaker.pairingPsk).toBeTruthy();

  // Proof layer 3: a reconnect with the same identity/storage is admitted
  // as already paired, with no new pairing round.
  speaker.disconnect();
  const reconnected = new Speaker(maServer.sendspinBaseUrl, SPEAKER_NAME, speaker.storage);
  await reconnected.connect();
  await expect(page.getByText(SPEAKER_NAME).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".player-needs-setup").filter({ hasText: SPEAKER_NAME })).toHaveCount(
    0,
  );
  expect(reconnected.pairingEvents).toEqual([]);
  reconnected.disconnect();
});
