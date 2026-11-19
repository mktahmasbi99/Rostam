import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4173", browserName: "chromium", serviceWorkers: "allow" },
  webServer: [4173, 4174].map((port) => ({
    command: `node e2e/fixture-server.mjs ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  })),
});
