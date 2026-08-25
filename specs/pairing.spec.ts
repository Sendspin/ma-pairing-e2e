import { waitForPlayerRegistered } from "../fixtures/api.js";
import * as human from "../fixtures/human.js";
import { seededStart } from "../fixtures/seed.js";
import { Speaker } from "../fixtures/speaker.js";
import { expect, test } from "../fixtures/test.js";

const SPEAKER_NAME = "Living Room Speaker";

test("pairing: dynamic PIN via the player picker", async ({ context, maServer }) => {
  // Setup happens before the page, and with it the recording, starts.
  const token = await seededStart(maServer, context);
  await human.installCursor(context);
  const speaker = new Speaker(maServer.sendspinBaseUrl, SPEAKER_NAME);
  await speaker.connect();
  await waitForPlayerRegistered(maServer.baseUrl, token, SPEAKER_NAME);
  // Let the speaker settle in before the recording starts.
  await human.settle(10_000);

  const page = await context.newPage();
  await page.goto(maServer.baseUrl);
  // The collapsed picker trigger carries aria-expanded; an open panel adds a
  // second "Select player: ..." button, so match on the expanded state.
  const pickerButton = page.getByRole("button", { name: /Select player/, expanded: false });
  await expect(pickerButton).toBeVisible({ timeout: 30_000 });
  await human.centerCursor(page);

  // The app's initial player fetch excludes protocol players, so it only
  // learns about the unpaired speaker from a player event. Bounce the
  // speaker's connection to emit one now that the page is subscribed.
  await speaker.reconnect();
  await waitForPlayerRegistered(maServer.baseUrl, token, SPEAKER_NAME);
  await page.waitForTimeout(1_000);

  // The picker lists players awaiting setup; clicking one launches its
  // setup flow.
  await human.click(page, pickerButton);
  // An unpaired player's card action is labelled for configuring, not
  // selecting, and says so in its accessible name.
  const speakerAction = page.getByRole("button", {
    name: new RegExp(`^Configure player: ${SPEAKER_NAME}`),
  });
  await expect(speakerAction).toBeVisible({ timeout: 15_000 });
  await expect(speakerAction).toHaveAccessibleName(/Setup required/);
  await human.pause(page, 1_200);
  await human.click(page, speakerAction);

  const dialog = page.getByRole("dialog", { name: "Set up player" });
  await expect(dialog).toBeVisible();
  await human.pause(page, 1_200);

  // The method-selection step is skipped by the server when the device
  // advertises only one usable method, so wait for either it or the PIN form.
  const methodButton = dialog.getByRole("button", { name: /^PIN\b/ });
  const pinField = dialog.getByLabel("PIN", { exact: true });
  await expect(methodButton.or(pinField).first()).toBeVisible({ timeout: 30_000 });
  if (await methodButton.isVisible()) {
    // A device that can pair by PIN does not offer its pairing token.
    await expect(dialog.getByRole("button", { name: /Pairing token/ })).toHaveCount(0);
    // Picking an option submits the step, so there is no separate Next click.
    await human.click(page, methodButton);
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

  // Finishing setup selects the freshly paired player, with no extra step.
  await expect(
    page.getByRole("button", {
      name: new RegExp(`^Select player: ${SPEAKER_NAME}`),
      expanded: false,
    }),
  ).toBeVisible({ timeout: 15_000 });
  await human.pause(page, 2_500);

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
