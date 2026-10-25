import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const evidence = resolve("../docs/verification/batch4-2026-10-25");

async function mockLedger(page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return route.fulfill({ json: { today: "2026-10-25", timezone: "Europe/Warsaw", version: "1.0.0" } });
    if (path === "/api/days/2026-10-25") return route.fulfill({ json: {
      date: "2026-10-25",
      sections: [
        { exercise: { id: 1, name: "Bundled artwork", baseName: "Bundled artwork", measurementType: "repetitions", equipment: null, customEquipment: null, allowBodyweight: true, imageKey: "push-up", exerciseNote: null, archivedAt: null, hasHistory: false }, displayOrder: 0, total: 12, sets: [] },
        { exercise: { id: 2, name: "Custom photo", baseName: "Custom photo", measurementType: "repetitions", equipment: null, customEquipment: null, allowBodyweight: true, imageKey: "custom:fixture", exerciseNote: null, archivedAt: null, hasHistory: false }, displayOrder: 1, total: 8, sets: [] },
      ],
    } });
    if (path.startsWith("/api/exercise-images/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#e32f52"/><circle cx="32" cy="32" r="18" fill="#28a8d0"/></svg>' });
    if (path.startsWith("/api/calendar/")) return route.fulfill({ json: { month: "2026-10", activeDates: ["2026-10-25"] } });
    return route.fulfill({ json: [] });
  });
}

test("calendar supports focus containment, Escape, and focus restoration", async ({ page }) => {
  await mockLedger(page);
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Choose a day" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Calendar" });
  await expect(dialog).toBeVisible();
  await mkdir(evidence, { recursive: true });
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    await page.screenshot({ path: resolve(evidence, `calendar-${colorScheme}-390.png`), fullPage: true });
  }
  await expect(dialog.getByRole("button", { name: "Close calendar" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Jump to Today" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close calendar" })).toBeFocused();
  await expect(page.locator("[data-rostam-app]")).toHaveAttribute("inert");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("renders responsive light and dark states with custom photo colors intact", async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await mockLedger(page);
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 360, 390, 430, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Custom photo" })).toBeVisible();
      await expect(page.getByText("Loading journal…")).toHaveCount(0);
      const imageFilters = await page.locator(".exercise-image img").evaluateAll((images) => images.map((image) => getComputedStyle(image).filter));
      expect(imageFilters[0]).toBe(colorScheme === "dark" ? "invert(1)" : "none");
      expect(imageFilters[1]).toBe("none");
      await expect(page.locator("body")).toHaveJSProperty("scrollWidth", await page.evaluate(() => document.documentElement.clientWidth));
      await page.screenshot({ path: resolve(evidence, `today-${colorScheme}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  const overflow = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, elements: [...document.querySelectorAll("*")].filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map((element) => ({ tag: element.tagName, className: typeof element.className === "string" ? element.className : "", right: Math.round(element.getBoundingClientRect().right), width: Math.round(element.getBoundingClientRect().width) })).slice(0, 20) }));
  console.info("200% text overflow", overflow);
  expect(overflow.width <= overflow.client).toBe(true);
  await page.screenshot({ path: resolve(evidence, "today-dark-320-text-200.png"), fullPage: true });
});
