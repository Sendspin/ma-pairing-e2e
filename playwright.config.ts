import { defineConfig } from "@playwright/test";

const record = !!process.env.RECORD;

export default defineConfig({
  testDir: "specs",
  globalSetup: "./fixtures/global-setup.ts",
  workers: 1,
  // Headroom for a cold model cache, which can add minutes to the first boot.
  timeout: 420_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    locale: "en-US",
    viewport: { width: 1280, height: 720 },
    video: record ? "on" : "retain-on-failure",
    trace: "retain-on-failure",
  },
});
