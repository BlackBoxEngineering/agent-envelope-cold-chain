import { expect, test } from "@playwright/test";

test("rejects the 50C attack and preserves decision evidence", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "AgentEnvelope Cold Chain" })).toBeVisible();
  await page.getByRole("button", { name: "Start system" }).click();
  await expect(page.getByText("Refrigeration active")).toBeVisible();
  await page.getByRole("button", { name: /50°C attack/i }).click();

  await expect(page.getByRole("heading", { name: "Denied" })).toBeVisible();
  await expect(page.getByText("Command isolated")).toBeVisible();
  await expect(page.locator(".execution-state")).toContainText("Not attempted");
  await expect(page.getByText("authority.not_found", { exact: true })).toBeVisible();
  await expect(page.locator(".decision-id strong")).toHaveText(/AE-[A-F0-9]{8}/);
});

test("separates correct knowledge from control authority", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start system" }).click();
  await page.getByRole("button", { name: /Correct, no authority/i }).click();
  await expect(page.getByRole("heading", { name: "Denied" })).toBeVisible();
  await expect(page.getByText("authority.operation_denied", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /Authorised recovery/i }).click();
  await expect(page.getByRole("heading", { name: "Allowed" })).toBeVisible();
  await expect(page.getByText("Completed in simulator")).toBeVisible();
  await expect(page.locator(".temperature-stack > strong")).toHaveText(/^4\.0°C$/);
});

test("runs continuously and automatically completes an authorised fault recovery", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Start system" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Compressor fault/i }).click();
  await expect(page.getByText("Verifying command")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Authorising recovery" })).toBeVisible({ timeout: 4000 });
  await expect(page.locator(".timeline-heading > strong")).toHaveText("2 entries", { timeout: 5000 });
  await expect(page.locator(".temperature-stack > strong")).toHaveText(/^4\.0°C$/);
  await expect(page.locator(".timeline-panel li")).toHaveCount(2);
});

test("remains usable on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Refrigeration control boundary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start system" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
