import { expect, test } from "@playwright/test";

test.use({ hasTouch: true, serviceWorkers: "block" });

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
      await expect(items).toHaveCount(4);
      await expect(items.first().getByText("Supplement", { exact: true })).toBeVisible();
      const iconBoxes = await items.locator(".day-add-menu-icon > svg").evaluateAll((icons) =>
        icons.map((icon) => icon.getBoundingClientRect().x),
      );
      expect(Math.max(...iconBoxes) - Math.min(...iconBoxes)).toBeLessThanOrEqual(1);
      for (const item of await items.all()) {
        const itemBackground = await item.evaluate((element) => getComputedStyle(element).backgroundColor);
        expect(itemBackground).toMatch(/^rgb\(/);
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
  await expect(page.getByRole("menuitem", { name: "Supplement", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /Start workout/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /Add activity/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(menu).toBeHidden();
});

for (const width of [320, 393]) {
  test(`day add menu sits above sets and leaves the last card clear at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ colorScheme: "dark" });
    const date = "2026-10-25";
    const exercise = {
      id: 1, name: "Deadlifts (Resistance Bands)", equipment: "resistance_band",
      measurementType: "repetitions", hasHistory: false, allowBodyweight: true,
    };
    const sets = Array.from({ length: 24 }, (_, index) => ({
      id: index + 1, exerciseId: exercise.id, date, time: "20:07",
      equipment: exercise.equipment, repetitions: 15, resistanceKind: "external", weightKg: "48",
    }));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/config") return route.fulfill({ json: { today: date, timezone: "Europe/Warsaw", version: "1" } });
      if (path === `/api/days/${date}`) return route.fulfill({ json: { date, sections: [{ exercise, sets, total: 360 }] } });
      if (path === "/api/sets/24" && route.request().method() === "PATCH") {
        const { repetitions } = route.request().postDataJSON();
        sets.at(-1).repetitions = repetitions;
        return route.fulfill({ json: sets.at(-1) });
      }
      return route.fulfill({ json: [] });
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const lastSet = page.getByRole("checkbox", { name: "Saved set 24; uncheck to edit", exact: true });
    await expect(lastSet).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.getByRole("button", { name: "Add to day" }).tap();
    const menu = page.getByRole("menu", { name: "Add to day" });
    const activity = menu.getByRole("menuitem", { name: /Add activity/ });
    await expect.poll(() => activity.evaluate((item) => {
      const { x, y, width, height } = item.getBoundingClientRect();
      const [top, ...underneath] = document.elementsFromPoint(x + width / 2, y + height / 2);
      return item.contains(top) && underneath.some((element) => element.closest(".set-row"));
    })).toBe(true);
    await activity.tap({ trial: true });

    const beforeScroll = await page.evaluate(() => window.scrollY);
    await page.mouse.move(8, 380);
    await page.mouse.wheel(0, 250);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll);
    await page.touchscreen.tap(8, 380);
    await expect(menu).toBeVisible();

    await page.getByRole("button", { name: "Close add menu" }).tap();
    await expect(menu).toBeHidden();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const card = await page.locator(".exercise-card").boundingBox();
    const circle = await page.getByRole("button", { name: "Add to day" }).boundingBox();
    const navigation = await page.getByRole("navigation", { name: "Primary navigation" }).boundingBox();
    expect(card.y + card.height).toBeLessThanOrEqual(circle.y - 11);
    expect(circle.y + circle.height).toBeLessThan(navigation.y);
    await lastSet.tap();
    await page.getByRole("spinbutton", { name: "Reps", exact: true }).fill("16");
    await page.getByRole("checkbox", { name: "Save set", exact: true }).tap();
    await expect(lastSet).toBeChecked();
    await expect(page.locator(".set-row").last()).toContainText("16");
  });
}
