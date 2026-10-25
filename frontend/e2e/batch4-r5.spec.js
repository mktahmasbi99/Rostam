import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const evidenceDir = resolve("../docs/verification/r5-2026-10-25");
const measurements = [{
  id: 1, date: "2026-10-24", weightKg: "123456789.123", waistCm: "102.5",
  measurementType: "weight", createdAt: "2026-10-24T12:00:00Z", updatedAt: "2026-10-24T12:00:00Z",
}];

test("measurement cards and edit form fit narrow screens and enlarged text", async ({ page }) => {
  await mkdir(evidenceDir, { recursive: true });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return route.fulfill({ json: { today: "2026-10-25", timezone: "Europe/Warsaw", version: "1.0.0" } });
    if (path === "/api/profile") return route.fulfill({ json: { heightCm: null, dateOfBirth: null, age: null } });
    if (path === "/api/body-measurements") return route.fulfill({ json: { items: measurements, nextBeforeDate: null, nextBeforeId: null } });
    if (path === "/api/body-measurements/trends") return route.fulfill({ json: { latest: { weight: { date: measurements[0].date, value: measurements[0].weightKg }, waist: { date: measurements[0].date, value: measurements[0].waistCm } }, trends: { weight: [{ date: measurements[0].date, value: measurements[0].weightKg }], waist: [{ date: measurements[0].date, value: measurements[0].waistCm }] } } });
    return route.fulfill({ json: [] });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Measurements" }).click();
  await expect(page.getByRole("heading", { name: "Measurements" })).toBeVisible();
  await expect(page.getByText("123456789.123 kg", { exact: true })).toBeVisible();

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 320 || width === 390) {
      await page.screenshot({ path: resolve(evidenceDir, `measurements-${width}-light.png`), fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: resolve(evidenceDir, "measurements-1440-dark.png"), fullPage: true });

  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.addStyleTag({ content: "html { font-size: 125% !important; }" });
  await page.screenshot({ path: resolve(evidenceDir, "measurements-320-large-text.png"), fullPage: true });
  await page.getByRole("button", { name: "Edit measurement from 2026-10-24" }).click();
  await expect(page.getByLabel("Date")).toBeVisible();
  await expect(page.getByLabel(/Weight/)).toBeVisible();
  await expect(page.getByLabel(/Waist/)).toBeVisible();
  await page.getByLabel(/Weight/).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel(/Waist/)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save" })).toBeFocused();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(evidenceDir, "measurement-edit-320-large-text.png"), fullPage: true });
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Edit measurement" })).toHaveCount(0);
});
