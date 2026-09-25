import { test, expect } from "@playwright/test";
test("sala somente LAN compartilha a restrição no convite e no OBS", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Somente LAN").check();
  await page.getByRole("button", { name: "Criar sala para OBS" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("lan"))
    .toBe("1");
  await expect(page.getByLabel("Convite da câmera")).toHaveValue(
    /\?lan=1#token=/,
  );
  await expect(page.getByLabel("Link para OBS")).toHaveValue(
    /\?lan=1&clean=1&latency=low#token=/,
  );
  await page.reload();
  await expect(page.getByLabel("Convite da câmera")).toHaveValue(
    /\?lan=1#token=/,
  );
});

test("operador convida câmera, confere prévia e entrega vídeo horizontal ao OBS", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.screenshot({
    path: "test-results/studio-setup-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Formato", { exact: true }).selectOption("custom");
  await page.getByLabel("Largura").fill("960");
  await page.getByLabel("Altura").fill("540");
  await page.getByRole("button", { name: "Criar sala para OBS" }).click();
  await expect(page).toHaveURL(/\/studio\//);
  await expect(
    page.getByRole("img", { name: "QR code do convite da câmera" }),
  ).toBeVisible();
  const invite = await page.getByLabel("Convite da câmera").inputValue();
  await page.getByLabel("Priorizar menor atraso").uncheck();
  expect(
    new URL(
      await page.getByLabel("Link para OBS", { exact: true }).inputValue(),
    ).searchParams.has("latency"),
  ).toBe(false);
  await page.getByLabel("Priorizar menor atraso").check();
  const obsLink = await page
    .getByLabel("Link para OBS", { exact: true })
    .inputValue();
  const cameraContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const camera = await cameraContext.newPage();
  try {
    await camera.goto(invite);
    await expect(
      camera.getByText("960 × 540", { exact: false }).first(),
    ).toBeVisible();
    await camera.getByRole("button", { name: "Preparar câmera" }).click();
    await expect(camera.locator("video")).toHaveJSProperty("videoWidth", 960, {
      timeout: 20000,
    });
    await expect(camera.locator("video")).toHaveJSProperty("videoHeight", 540);
    await camera
      .getByRole("button", { name: "Iniciar transmissão", exact: true })
      .click();
    await expect(
      page.getByText("Câmera conectada", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.locator("video, iframe")).toHaveCount(0);
    await page.getByRole("button", { name: "Conferir prévia" }).click();
    const preview = page.frameLocator("iframe");
    await expect(preview.locator("video")).toHaveJSProperty("readyState", 4, {
      timeout: 20000,
    });
    // The encoder may downscale under CPU/network pressure; framing must remain 16:9.
    expect(
      await preview
        .locator("video")
        .evaluate((v: HTMLVideoElement) => v.videoWidth / v.videoHeight),
    ).toBeCloseTo(16 / 9, 1);
    await page
      .getByRole("button", { name: "Liberar para o OBS", exact: true })
      .click();
    await expect(page.locator("iframe")).toHaveCount(0);
    const obs = await page.context().newPage();
    await obs.addInitScript(() => {
      const descriptor = Object.getOwnPropertyDescriptor(
        RTCRtpReceiver.prototype,
        "jitterBufferTarget",
      );
      Object.defineProperty(RTCRtpReceiver.prototype, "jitterBufferTarget", {
        configurable: true,
        get() {
          return descriptor?.get?.call(this) ?? null;
        },
        set(value: number) {
          (
            window as unknown as { rheoBufferTarget?: number }
          ).rheoBufferTarget = value;
          descriptor?.set?.call(this, value);
        },
      });
    });
    expect(new URL(obsLink).searchParams.get("latency")).toBe("low");
    await obs.goto(obsLink);
    await expect(obs.locator("video")).toHaveJSProperty("readyState", 4, {
      timeout: 20000,
    });
    await expect
      .poll(() =>
        obs.evaluate(
          () =>
            (window as unknown as { rheoBufferTarget?: number })
              .rheoBufferTarget,
        ),
      )
      .toBe(80);
    expect(
      await obs
        .locator("video")
        .evaluate((v: HTMLVideoElement) => v.videoWidth / v.videoHeight),
    ).toBeCloseTo(16 / 9, 1);
    await camera
      .getByRole("button", { name: "Parar câmera", exact: true })
      .click();
    await expect(
      page.getByText("Aguardando câmera", { exact: true }),
    ).toBeVisible();
    await camera.getByRole("button", { name: "Preparar câmera" }).click();
    await camera
      .getByRole("button", { name: "Iniciar transmissão", exact: true })
      .click();
    await expect(obs.locator("video")).toHaveJSProperty("readyState", 4, {
      timeout: 20000,
    });
    await page.reload();
    await expect(
      page.getByText("Receptor conectado", { exact: true }),
    ).toBeVisible();
    await expect(obs.locator("video")).toHaveJSProperty("readyState", 4);
    await expect(
      camera.getByText(
        "A sala continua aberta. Prepare a câmera para transmitir novamente.",
      ),
    ).toHaveCount(0);
    await page.screenshot({
      path: "test-results/studio-desktop.png",
      fullPage: true,
    });
    await camera.screenshot({
      path: "test-results/camera-mobile.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Encerrar sala" }).click();
    await expect(
      camera.getByText("Transmissão encerrada.", { exact: true }),
    ).toBeVisible();
  } finally {
    await cameraContext.close();
  }
});
