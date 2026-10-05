import type { BrowserContext } from "@playwright/test";
import { WsApi } from "./api.js";
import type { ServerUnderTest } from "./server.js";

export const ADMIN_USER = "admin";
export const ADMIN_PASSWORD = "e2e-password-123";

/**
 * Seeded start: create the first admin user via POST /setup, mark onboarding
 * complete so the setup wizard stays closed, and inject the returned token
 * (plus a deterministic English locale) so the first page load lands in the
 * app already logged in, with no login screen.
 * Returns the token for harness-side API calls.
 */
export async function seededStart(
  server: ServerUnderTest,
  context: BrowserContext,
): Promise<string> {
  const res = await fetch(`${server.baseUrl}/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: ADMIN_USER,
      password: ADMIN_PASSWORD,
      device_name: "ma-pairing-e2e",
    }),
  });
  if (!res.ok) {
    throw new Error(`POST /setup failed: ${res.status} ${await res.text()}`);
  }
  const { token } = (await res.json()) as { token: string };
  const api = await WsApi.connect(server.baseUrl, token);
  try {
    const done = await api.command("config/onboard_complete", {});
    if (done.error_code) {
      throw new Error(`config/onboard_complete failed: ${JSON.stringify(done)}`);
    }
  } finally {
    api.close();
  }
  await context.addInitScript((jwt: string) => {
    localStorage.setItem("ma_access_token", jwt);
    localStorage.setItem("frontend.settings.language", "en");
    localStorage.setItem("frontend.settings.migrated_to_user_prefs", "true");
  }, token);
  return token;
}
