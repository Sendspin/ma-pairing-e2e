import { defineConfig } from "@playwright/test";

const record = !!process.env.RECORD;

export default defineConfig({
  testDir: "specs",
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    locale: "en-US",
    viewport: { width: 1280, height: 720 },
    video: record ? "on" : "retain-on-failure",
    trace: "retain-on-failure",
  },
});
