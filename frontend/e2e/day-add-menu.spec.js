import { expect, test } from "@playwright/test";

test("day add menu opens its existing pickers and stays visible on a narrow screen", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return route.fulfill({ json: { today: "2026-10-25", timezone: "Europe/Warsaw", version: "1.0.0" } });
    if (path === "/api/days/2026-10-25") return route.fulfill({ json: { date: "2026-10-25", sections: [], activities: [] } });
    if (path === "/api/activities") return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Add to day" });
  await expect(trigger).toBeVisible();
  for (const colorScheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await trigger.click();
      const menu = page.getByRole("menu", { name: "Add to day" });
      await expect(menu).toBeVisible();
      const menuBox = await menu.boundingBox();
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
      const items = menu.getByRole("menuitem");
      await expect(items).toHaveCount(3);
      for (const item of await items.all()) {
        const itemBackground = await item.evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(itemBackground).not.toBe("rgba(0, 0, 0, 0)");
      }
      const firstItemBox = await items.nth(0).boundingBox();
      const secondItemBox = await items.nth(1).boundingBox();
      expect(secondItemBox.y).toBeGreaterThan(firstItemBox.y + firstItemBox.height);
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
    }
  }
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ colorScheme: "light" });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Add to day" });
  await page.keyboard.press("Home");
  await expect(page.getByRole("menuitem", { name: /Start workout/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /Add activity/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(menu).toBeHidden();
});
