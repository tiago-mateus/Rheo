import { test, expect } from "@playwright/test";

test("câmera vertical preserva imagem com barras ou preenche com corte e libera a captura", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/capture.ts";
    const { frameCamera } = await import(modulePath);
    const samples = [];
    for (const fit of ["contain", "cover"]) {
      const source = document.createElement("canvas");
      source.width = 90;
      source.height = 160;
      const context = source.getContext("2d")!;
      const raw = source.captureStream(30);
      const paint = setInterval(() => {
        context.fillStyle = "#ff0000";
        context.fillRect(0, 0, source.width, source.height);
        context.fillStyle = "#00ff00";
        context.fillRect(0, 0, source.width, 20);
      }, 30);
      const framed = await frameCamera(raw, { width: 640, height: 360, fit });
      const output = document.createElement("video");
      output.muted = true;
      output.srcObject = framed.stream;
      await output.play();
      await new Promise((r) => setTimeout(r, 150));
      const sample = document.createElement("canvas");
      sample.width = 640;
      sample.height = 360;
      const pixels = sample.getContext("2d")!;
      pixels.drawImage(output, 0, 0);
      samples.push({
        fit,
        width: output.videoWidth,
        height: output.videoHeight,
        corner: Array.from(pixels.getImageData(5, 5, 1, 1).data).slice(0, 3),
        middle: Array.from(pixels.getImageData(320, 180, 1, 1).data).slice(
          0,
          3,
        ),
      });
      source.width = 160;
      source.height = 90;
      await new Promise((r) => setTimeout(r, 150));
      samples.push({
        rotatedWidth: output.videoWidth,
        rotatedHeight: output.videoHeight,
      });
      framed.stop();
      clearInterval(paint);
      output.srcObject = null;
      samples.push({
        stopped: [...raw.getTracks(), ...framed.stream.getTracks()].every(
          (t) => t.readyState === "ended",
        ),
      });
    }
    return samples;
  });
  expect(result).toEqual([
    {
      fit: "contain",
      width: 640,
      height: 360,
      corner: [0, 0, 0],
      middle: [255, 0, 0],
    },
    { rotatedWidth: 640, rotatedHeight: 360 },
    { stopped: true },
    {
      fit: "cover",
      width: 640,
      height: 360,
      corner: [255, 0, 0],
      middle: [255, 0, 0],
    },
    { rotatedWidth: 640, rotatedHeight: 360 },
    { stopped: true },
  ]);
});

test("formatos predefinidos e personalizados cabem no celular", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Formato", { exact: true }).selectOption("portrait");
  await page.getByLabel("Resolução").selectOption("1080");
  await page.screenshot({
    path: "test-results/studio-setup-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Criar sala para OBS" }).click();
  await expect(page.getByText("1080 × 1920 · 30 fps")).toBeVisible();
  await page.screenshot({
    path: "test-results/studio-room-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("canvas acompanha quadros reais da câmera e para de desenhar ao encerrar", async ({
  page,
}) => {
  await page.goto("/");
  const counts = await page.evaluate(async () => {
    const modulePath = "/src/capture.ts";
    const { frameCamera } = await import(modulePath);
    const original = CanvasRenderingContext2D.prototype.drawImage;
    let draws = 0;
    CanvasRenderingContext2D.prototype.drawImage = function (
      this: CanvasRenderingContext2D,
      ...args: unknown[]
    ) {
      draws++;
      return original.apply(this, args as any);
    } as typeof original;
    const source = document.createElement("canvas");
    source.width = 320;
    source.height = 240;
    const ctx = source.getContext("2d")!;
    const raw = source.captureStream(10);
    const paint = setInterval(() => {
      ctx.fillStyle = "#f00";
      ctx.fillRect(0, 0, 320, 240);
    }, 100);
    try {
      const framed = await frameCamera(raw, {
        width: 640,
        height: 360,
        fit: "contain",
      });
      await new Promise((r) => setTimeout(r, 700));
      const active = draws;
      framed.stop();
      await new Promise((r) => setTimeout(r, 150));
      return { active, afterStop: draws };
    } finally {
      clearInterval(paint);
      CanvasRenderingContext2D.prototype.drawImage = original;
    }
  });
  expect(counts.active).toBeGreaterThanOrEqual(2);
  expect(counts.active).toBeLessThanOrEqual(14);
  expect(counts.afterStop).toBe(counts.active);
});
