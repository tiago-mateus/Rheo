import { test, expect } from "@playwright/test";

test("matching camera dimensions preserve the original stream", async ({ page }) => {
  await page.goto("/?camera=1");
  const result = await page.evaluate(async () => {
    const { frameCamera } = await import("../../src/capture");
    const raw = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const { width, height } = raw.getVideoTracks()[0].getSettings();
    if (!width || !height) throw new Error("Camera did not report its dimensions");
    const capture = await frameCamera(raw, { width, height, fit: "contain" });
    const identical = capture.stream === raw;
    capture.stop();
    return { identical, stopped: raw.getTracks().every((track) => track.readyState === "ended") };
  });
  expect(result).toEqual({ identical: true, stopped: true });
});

test("different target dimensions still use the framing canvas", async ({ page }) => {
  await page.goto("/?camera=1");
  const result = await page.evaluate(async () => {
    const { frameCamera } = await import("../../src/capture");
    const raw = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const settings = raw.getVideoTracks()[0].getSettings();
    const width = settings.width === 320 ? 640 : 320;
    const height = settings.height === 240 ? 480 : 240;
    const capture = await frameCamera(raw, { width, height, fit: "cover" });
    const separateStream = capture.stream !== raw;
    const output = capture.stream.getVideoTracks()[0].getSettings();
    capture.stop();
    return {
      separateStream,
      width: output.width,
      height: output.height,
      stopped: raw.getTracks().every((track) => track.readyState === "ended"),
    };
  });
  expect(result).toEqual({ separateStream: true, width: expect.any(Number), height: expect.any(Number), stopped: true });
});
