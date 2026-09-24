import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: {
    command: "node --import tsx server/index.ts",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    env: { PORT: "3100" },
    timeout: 60000,
  },
  reporter: "list",
});
