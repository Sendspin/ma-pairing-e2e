import { waitForPlayerRegistered } from "../fixtures/api.js";
import * as human from "../fixtures/human.js";
import { seededStart } from "../fixtures/seed.js";
import { Speaker } from "../fixtures/speaker.js";
import { expect, test } from "../fixtures/test.js";

const SPEAKER_NAME = "Living Room Speaker";

test("pairing: dynamic PIN via the player picker", async ({ context, maServer }) => {
  // All setup happens before the page (and with it the recording) starts:
  // seed the admin, connect the speaker, wait until the server registered it.
  const token = await seededStart(maServer, context);
  await human.installCursor(context);
  const speaker = new Speaker(maServer.sendspinBaseUrl, SPEAKER_NAME);
  await speaker.connect();
  await waitForPlayerRegistered(maServer.baseUrl, token, SPEAKER_NAME);

  const page = await context.newPage();
  await page.goto(maServer.baseUrl);
  // The collapsed picker trigger carries aria-expanded; an open panel adds a
  // second "Select player: ..." button, so match on the expanded state.
  const pickerButton = page.getByRole("button", { name: /Select player/, expanded: false });
  await expect(pickerButton).toBeVisible({ timeout: 30_000 });

  // The app's initial player fetch excludes protocol players, so it only
  // learns about the unpaired speaker from a player event. Bounce the
  // speaker's connection to emit one now that the page is subscribed.
  await speaker.reconnect();
  await waitForPlayerRegistered(maServer.baseUrl, token, SPEAKER_NAME);
  await page.waitForTimeout(1_000);
  await human.pause(page, 1_000);

  // The picker lists players awaiting setup; clicking one launches its
  // setup flow.
  await human.click(page, pickerButton);
  const speakerCard = page.locator("[data-player-id]").filter({ hasText: SPEAKER_NAME });
  await expect(speakerCard).toBeVisible({ timeout: 15_000 });
  await expect(speakerCard).toContainText("Setup required");
  await human.pause(page, 1_200);
  await human.click(page, speakerCard.locator("button.player-select-action"));

  const dialog = page.getByRole("dialog", { name: "Set up player" });
  await expect(dialog).toBeVisible();
  await human.pause(page, 1_200);

  // The method-selection step is skipped by the server when the device
  // advertises only one usable method, so wait for either it or the PIN form.
  const methodRadio = dialog.getByRole("radio", { name: /^(Dynamic )?PIN\b/ });
  const pinField = dialog.getByLabel("PIN", { exact: true });
  await expect(methodRadio.or(pinField).first()).toBeVisible({ timeout: 30_000 });
  if (await methodRadio.isVisible()) {
    await human.click(page, methodRadio);
    await human.pause(page, 800);
    await human.click(page, dialog.getByRole("button", { name: "Next" }));
  }

  // The PIN shows on the speaker; the operator copies it into the dialog.
  const pin = await speaker.waitForPin();
  await expect(pinField).toBeVisible({ timeout: 30_000 });
  await human.pause(page, 1_000);
  await human.type(page, pinField, pin);
  await human.pause(page, 600);
  await human.click(page, dialog.getByRole("button", { name: "Next" }));

  await expect(dialog.getByText("All set!")).toBeVisible({ timeout: 30_000 });
  await human.pause(page, 1_500);
  await human.click(page, dialog.getByRole("button", { name: "Done" }));

  // The paired speaker is now a selectable playback target.
  await human.pause(page, 1_000);
  await human.click(page, pickerButton);
  await expect(speakerCard).toBeVisible({ timeout: 15_000 });
  await expect(speakerCard).not.toContainText("Setup required");
  await human.pause(page, 1_200);
  await human.click(page, speakerCard.locator("button.player-select-action"));
  await expect(
    page.getByRole("button", {
      name: new RegExp(`^Select player: ${SPEAKER_NAME}`),
      expanded: false,
    }),
  ).toBeVisible({ timeout: 15_000 });
  await human.pause(page, 2_000);

  // End of the recorded flow; the remaining checks are API/client-side.
  await page.close();

  // The speaker itself confirms the pairing and holds a long-term PSK.
  await speaker.finalized;
  expect(speaker.pairingPsk).toBeTruthy();

  // A reconnect with the same identity/storage is admitted as already
  // paired: no new pairing round, and the player comes back available.
  speaker.disconnect();
  const reconnected = new Speaker(maServer.sendspinBaseUrl, SPEAKER_NAME, speaker.storage);
  await reconnected.connect();
  await waitForPlayerRegistered(
    maServer.baseUrl,
    token,
    SPEAKER_NAME,
    (p) => p.needs_setup === false && p.available === true,
  );
  expect(reconnected.pairingEvents).toEqual([]);
  reconnected.disconnect();
});
