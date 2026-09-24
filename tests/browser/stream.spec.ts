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
