import * as human from "../fixtures/human.js";
import { expect, test } from "../fixtures/test.js";

test("onboarding: create the admin account", async ({ context, maServer }) => {
  await human.installCursor(context);
  const page = await context.newPage();

  // A fresh server redirects every page to the create-admin setup page.
  await page.goto(maServer.baseUrl);
  await expect(page.getByRole("heading", { name: "Welcome!" })).toBeVisible();
  await human.pause(page, 1_200);

  await human.type(page, page.getByLabel("Username"), "admin");
  await human.type(page, page.getByLabel("Password", { exact: true }), "e2e-password-123");
  await human.type(page, page.getByLabel("Confirm Password"), "e2e-password-123");
  await human.pause(page, 600);
  await human.click(page, page.getByRole("button", { name: "Create Account" }));

  // Success redirects into the app, auto-authenticated, landing on the
  // settings page with the onboarding card for the new admin.
  await expect(page.getByRole("heading", { name: "Welcome to Music Assistant!" })).toBeVisible({
    timeout: 30_000,
  });
  expect(await page.evaluate(() => localStorage.getItem("ma_access_token"))).toBeTruthy();
  await human.pause(page, 2_000);
  await page.close();
});
