import { test, expect } from "@playwright/test";
test("câmera transmite, receptor recarrega, modo OBS e captura encerra", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar transmissão" }).click();
  await page.getByRole("button", { name: "Preparar câmera" }).click();
  await expect(page.locator("video")).toHaveJSProperty("readyState", 4, {
    timeout: 20000,
  });
  await page
    .getByRole("button", { name: "Iniciar transmissão", exact: true })
    .click();
  const link = await page.getByLabel("Link de recepção").inputValue();
  const context = await browser.newContext();
  const receiver = await context.newPage();
  await receiver.goto(link);
  await expect(receiver.locator("video")).toHaveJSProperty("readyState", 4, {
    timeout: 20000,
  });
  await expect(receiver.getByText("Conectado", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Silenciar", exact: true }).click();
  await page.getByRole("button", { name: "Reconectar", exact: true }).click();
  await page
    .getByRole("button", { name: "Preparar câmera", exact: true })
    .click();
  await expect(page.locator("video")).toHaveJSProperty("readyState", 4, {
    timeout: 20000,
  });
  expect(
    await page
      .locator("video")
      .evaluate(
        (v: HTMLVideoElement) =>
          (v.srcObject as MediaStream).getAudioTracks()[0].enabled,
      ),
  ).toBe(false);
  await page
    .getByRole("button", { name: "Iniciar transmissão", exact: true })
    .click();
  await expect(receiver.locator("video")).toHaveJSProperty("readyState", 4, {
    timeout: 20000,
  });
  await receiver.reload();
  await expect(receiver.locator("video")).toHaveJSProperty("readyState", 4, {
    timeout: 20000,
  });
  await page.screenshot({
    path: "test-results/transmitter.png",
    fullPage: true,
  });
  await receiver.getByRole("button", { name: "Modo OBS" }).click();
  await expect(receiver.locator("body")).toHaveClass(/clean/);
  await expect(receiver.locator("video")).toHaveJSProperty("readyState", 4, {
    timeout: 20000,
  });
  await receiver.screenshot({ path: "test-results/receiver-obs.png" });
  await page.getByRole("button", { name: "Encerrar transmissão" }).click();
  await expect(
    page.getByText("Transmissão encerrada.", { exact: true }),
  ).toBeVisible();
  await expect(
    receiver.getByRole("heading", {
      name: "Transmissão encerrada.",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("video")
        .evaluate((v: HTMLVideoElement) => v.srcObject === null),
    )
    .toBe(true);
  await context.close();
});
test("interface mobile cabe na tela e link inválido é explicado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Criar transmissão" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.goto("/view/invalido#token=errado");
  await expect(page.getByRole("alert")).toContainText(/inválid|expir/i);
});

test("receptor HTTP na rede local conecta sem exigir contexto seguro", async ({
  page,
  request,
}) => {
  const { networkInterfaces } = await import("node:os");
  const address = Object.values(networkInterfaces())
    .flat()
    .find((a) => a?.family === "IPv4" && !a.internal)?.address;
  test.skip(!address, "Sem interface LAN neste ambiente");
  const response = await request.post("/api/sessions");
  const session = await response.json();
  await page.goto(
    "http://" +
      address +
      ":3100/view/" +
      session.id +
      "#token=" +
      session.viewToken,
  );
  await expect(
    page.getByText("Aguardando câmera", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("prévia continua funcionando se a listagem de dispositivos falhar", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.enumerateDevices = async () => {
      throw new DOMException("Device list unavailable", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Criar transmissão" }).click();
  await page.getByRole("button", { name: "Preparar câmera" }).click();
  await expect(
    page.getByRole("button", { name: "Iniciar transmissão", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.locator("video")).toHaveJSProperty("readyState", 4, {
    timeout: 20000,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("reprodução da prévia bloqueada oferece nova tentativa por toque", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLMediaElement.prototype.play;
    let blocked = false;
    HTMLMediaElement.prototype.play = function () {
      if (this.srcObject && !blocked) {
        blocked = true;
        return Promise.reject(
          new DOMException("Playback blocked", "NotAllowedError"),
        );
      }
      return original.call(this);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Criar transmissão" }).click();
  await page.getByRole("button", { name: "Preparar câmera" }).click();
  await page
    .getByRole("button", { name: "Mostrar prévia", exact: true })
    .click({ timeout: 20000 });
  await expect(page.locator("video")).toHaveJSProperty("readyState", 4, {
    timeout: 20000,
  });
  await expect(
    page.getByRole("button", { name: "Mostrar prévia", exact: true }),
  ).toHaveCount(0);
});

test("segundo receptor espera sem interromper o primeiro e recebe a vaga liberada", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar transmissão" }).click();
  await page.getByRole("button", { name: "Preparar câmera" }).click();
  await expect(
    page.getByRole("button", { name: "Iniciar transmissão", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("button", { name: "Iniciar transmissão", exact: true })
    .click();
  const link = await page.getByLabel("Link de recepção").inputValue();
  const firstContext = await browser.newContext();
  const first = await firstContext.newPage();
  const nextContext = await browser.newContext();
  const next = await nextContext.newPage();
  try {
    await first.goto(link);
    await expect(first.locator("video")).toHaveJSProperty("readyState", 4, {
      timeout: 20000,
    });
    await next.goto(link);
    await expect(next).toHaveURL(/\/status\/busy\/view\//);
    await expect(
      next.getByRole("heading", { name: "Este link já está em uso" }),
    ).toBeVisible();
    await expect(first.locator("video")).toHaveJSProperty("readyState", 4);
    await next.screenshot({
      path: "test-results/session-state.png",
      fullPage: true,
    });
    await next.reload();
    await expect(
      next.getByRole("heading", { name: "Este link já está em uso" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Liberar receptor", exact: true })
      .click();
    await expect(
      first.getByRole("heading", { name: "Recepção liberada" }),
    ).toBeVisible();
    await expect(next.locator("video")).toHaveJSProperty("readyState", 4, {
      timeout: 20000,
    });
    await expect(next).toHaveURL(/\/view\//);
    expect(new URL(next.url()).pathname.startsWith("/status/")).toBe(false);
    await next
      .getByRole("button", { name: "Liberar para o OBS", exact: true })
      .click();
    await expect(
      next.getByRole("heading", { name: "Recepção liberada" }),
    ).toBeVisible();
    await next.screenshot({
      path: "test-results/session-state.png",
      fullPage: true,
    });
    await next.reload();
    await expect(
      next.getByRole("heading", { name: "Recepção liberada" }),
    ).toBeVisible();
    const obs = await nextContext.newPage();
    const obsUrl = new URL(await next.getByLabel("Link para OBS").inputValue());
    expect(obsUrl.searchParams.get("clean")).toBe("1");
    await obs.goto(obsUrl.href);
    await expect(obs.locator("video")).toHaveJSProperty("readyState", 4, {
      timeout: 20000,
    });
    await expect(
      first.getByRole("heading", { name: "Recepção liberada" }),
    ).toBeVisible();
    await expect(
      next.getByRole("heading", { name: "Recepção liberada" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Encerrar transmissão", exact: true })
      .click();
  } finally {
    await firstContext.close();
    await nextContext.close();
  }
});
test("link expirado mostra saída clara e nunca ocupa nova sessão", async ({
  page,
}) => {
  await page.goto("/view/missing#token=invalid");
  await expect(page).toHaveURL(/\/status\/expired\/view\//);
  await expect(
    page.getByRole("heading", { name: "Este link não está mais disponível" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(/novo link/i);
  await expect(
    page.getByRole("link", { name: "Voltar ao início" }),
  ).toBeVisible();
});

test("segunda câmera é redirecionada e desliga sua própria captura", async ({
  browser,
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Criar transmissão" }).click();
  await page.getByRole("button", { name: "Preparar câmera" }).click();
  await page
    .getByRole("button", { name: "Iniciar transmissão", exact: true })
    .click({ timeout: 20000 });
  await expect(
    page.getByText("Aguardando receptor", { exact: true }),
  ).toBeVisible();
  const context = await browser.newContext();
  const duplicate = await context.newPage();
  try {
    await duplicate.goto(page.url());
    await duplicate.getByRole("button", { name: "Preparar câmera" }).click();
    await expect(
      duplicate.getByRole("button", {
        name: "Iniciar transmissão",
        exact: true,
      }),
    ).toBeVisible({ timeout: 20000 });
    await duplicate.evaluate(() => {
      (
        window as unknown as { capturedTracks: MediaStreamTrack[] }
      ).capturedTracks = (
        document.querySelector("video")!.srcObject as MediaStream
      ).getTracks();
    });
    await duplicate
      .getByRole("button", { name: "Iniciar transmissão", exact: true })
      .click();
    await expect(duplicate).toHaveURL(/\/status\/busy\/send\//);
    expect(
      await duplicate.evaluate(() =>
        (
          window as unknown as { capturedTracks: MediaStreamTrack[] }
        ).capturedTracks.every((track) => track.readyState === "ended"),
      ),
    ).toBe(true);
    await expect(page.locator("video")).toHaveJSProperty("readyState", 4);
    await page
      .getByRole("button", { name: "Encerrar transmissão", exact: true })
      .click();
  } finally {
    await context.close();
  }
});
