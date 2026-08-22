import { test as base } from "@playwright/test";
import { MaServer } from "./server.js";

interface Fixtures {
  maServer: MaServer;
}

export const test = base.extend<Fixtures>({
  maServer: async ({}, use, testInfo) => {
    const server = new MaServer();
    await server.start();
    try {
      await use(server);
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("server-logs", {
          body: await server.logs(),
          contentType: "text/plain",
        });
      }
      await server.stop();
    }
  },
});

export { expect } from "@playwright/test";
