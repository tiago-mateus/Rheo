import { test, expect } from "@playwright/test";

test("operator can create and restore three separate camera rooms", async ({ page }) => {
  await page.goto("/multi");
  await expect(page.getByRole("heading", { name: "Suas câmeras, uma produção." })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Adicionar câmera" }).click();
    await expect(page.locator(".multi-card")).toHaveCount(i + 1);
  }
  const inputs = await page.locator(".multi-card input[readonly]").evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLInputElement).value)
  );
  expect(new Set(inputs)).toHaveProperty("size", 6);
  await page.reload();
  await expect(page.locator(".multi-card")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Adicionar câmera" })).toHaveCount(0);
});
