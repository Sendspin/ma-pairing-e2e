import * as human from "../fixtures/human.js";
import { expect, test } from "../fixtures/test.js";

test("onboarding: create the admin account", async ({ context, maServer }) => {
  await human.installCursor(context);
  const page = await context.newPage();

  // A fresh server opens the setup wizard on its create-account step.
  await page.goto(maServer.baseUrl);
  const wizard = page.getByRole("dialog", { name: "Set up Music Assistant" });
  await expect(wizard.getByRole("heading", { name: "Create your account", level: 1 })).toBeVisible();
  await human.centerCursor(page);
  await human.pause(page, 1_200);

  await human.type(page, wizard.getByLabel("Username"), "admin");
  await human.type(page, wizard.getByLabel("Password", { exact: true }), "e2e-password-123");
  await human.type(page, wizard.getByLabel("Confirm password"), "e2e-password-123");
  await human.pause(page, 600);
  await human.click(page, wizard.getByRole("button", { name: "Create account" }));

  // The remaining steps all have usable defaults, so walk them as offered.
  for (const step of [
    "Choose how you want to use Music Assistant",
    "Add your music sources",
    "Add your players",
    "Add plugins",
    "Check your server settings",
  ]) {
    await expect(wizard.getByRole("heading", { name: step, level: 1 })).toBeVisible({
      timeout: 30_000,
    });
    await human.pause(page, 1_500);
    await human.click(page, wizard.getByRole("button", { name: "Next" }));
  }

  await expect(wizard.getByRole("heading", { name: "Add users", level: 1 })).toBeVisible();
  await human.pause(page, 1_500);
  await human.click(page, wizard.getByRole("button", { name: "Skip for now" }));

  await expect(wizard.getByRole("heading", { name: "Finish setup", level: 1 })).toBeVisible();
  await human.pause(page, 2_000);
  await human.click(page, wizard.getByRole("button", { name: "Finish", exact: true }));

  // Finishing hands over to the app, signed in as the new admin.
  await expect(wizard).toBeHidden();
  await expect(page.getByRole("link", { name: "Discover" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ma_access_token"))).toBeTruthy();
  await human.pause(page, 2_000);
  await page.close();
});
