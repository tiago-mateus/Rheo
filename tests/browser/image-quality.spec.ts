import { test, expect } from "@playwright/test";

test("Full HD and maximum image fidelity are defaults in studio", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Resolução")).toHaveValue("1080");
  await expect(page.getByLabel("Priorizar qualidade máxima")).toBeChecked();
  await page.getByRole("button", { name: "Criar sala para OBS" }).click();
  const invite = await page.getByLabel("Convite da câmera").inputValue();
  expect(new URL(invite).searchParams.get("quality")).toBeNull();
  await expect(page.getByText("1920 × 1080 · 30 fps")).toBeVisible();
  expect(new URL(await page.getByLabel("Link para OBS").inputValue()).searchParams.get("latency")).toBeNull();
});

test("balanced camera invitations are explicit and reversible", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Somente LAN").check();
  await page.getByLabel("Priorizar qualidade máxima").uncheck();
  await page.getByRole("button", { name: "Criar sala para OBS" }).click();
  let invite = new URL(await page.getByLabel("Convite da câmera").inputValue());
  expect(invite.searchParams.get("lan")).toBe("1");
  expect(invite.searchParams.get("quality")).toBe("balanced");
  await page.getByLabel("Priorizar qualidade máxima").check();
  invite = new URL(await page.getByLabel("Convite da câmera").inputValue());
  expect(invite.searchParams.get("lan")).toBe("1");
  expect(invite.searchParams.has("quality")).toBe(false);
});

test("sender reports actual camera dimensions instead of only requested output", async ({ page }) => {
  await page.goto("/?camera=1");
  await page.getByRole("button", { name: "Criar transmissão" }).click();
  await page.getByRole("button", { name: "Preparar câmera" }).click();
  await expect(page.getByText("Captura real")).toBeVisible();
  await expect(page.locator(".telemetry dd").filter({ hasText: /\d+ × \d+/ }).first()).toBeVisible();
});
