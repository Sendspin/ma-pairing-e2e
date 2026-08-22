import { expect, test } from "../fixtures/test.js";

test("onboarding: create the admin account", async ({ page, maServer }) => {
  // A fresh server redirects every page to the create-admin setup page.
  await page.goto(maServer.baseUrl);
  await expect(page.getByRole("heading", { name: "Welcome!" })).toBeVisible();

  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password", { exact: true }).fill("e2e-password-123");
  await page.getByLabel("Confirm Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create Account" }).click();

  // Success redirects into the app, auto-authenticated, landing on the
  // settings page with the onboarding card for the new admin.
  await expect(page.getByRole("heading", { name: "Welcome to Music Assistant!" })).toBeVisible({
    timeout: 30_000,
  });
  expect(await page.evaluate(() => localStorage.getItem("ma_access_token"))).toBeTruthy();
});
