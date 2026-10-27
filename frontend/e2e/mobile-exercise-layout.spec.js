import { expect, test } from "@playwright/test";

// Reproduce the localized last-session date in the phone screenshots.
test.use({ locale: "pl-PL", serviceWorkers: "block" });

for (const measurementType of ["repetitions", "duration", "timed_repetitions"]) {
  test(`${measurementType} dates and set controls fit phone screens`, async ({ page }) => {
    const exercise = {
      id: 1, name: "Deadlifts (Resistance Bands)", baseName: "Deadlifts",
      measurementType, equipment: "resistance_band", allowBodyweight: true,
      imageKey: null, exerciseNote: "Yellow band = 25 kg\nGreen = 40\nBand under feet, ends on bar",
      hasHistory: true, archivedAt: null, customEquipment: null,
    };
    const set = {
      id: 1, exerciseId: 1, date: "2026-10-27", time: "10:11",
      repetitions: measurementType === "duration" ? null : 15,
      durationMinutes: measurementType === "duration" ? 12 : null,
      durationSeconds: measurementType === "duration" ? 30 : null,
      holdMinutes: measurementType === "timed_repetitions" ? 1 : null,
      holdSeconds: measurementType === "timed_repetitions" ? 30 : null,
      resistanceKind: "external", weightKg: "40", equipment: "resistance_band",
    };
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/config") return route.fulfill({ json: { today: "2026-10-27", timezone: "Europe/Warsaw", version: "1" } });
      if (path === "/api/days/2026-10-27") return route.fulfill({ json: { date: "2026-10-27", sections: [{ exercise, sets: [set], total: 15 }], activities: [] } });
      if (path === "/api/exercises/1/history") return route.fulfill({ json: { sessions: [{ date: "2026-10-11", sets: [set], total: 15 }], nextBeforeDate: null } });
      return route.fulfill({ json: [] });
    });
    await page.goto("/");
    await expect(page.locator(".previous-session")).toContainText("2026");
    await page.getByRole("button", { name: "Edit set 1", exact: true }).click();
    await expect(page.getByLabel("Time", { exact: true })).toHaveValue("10:11");

    for (const width of [320, 393, 430, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const fontSize of ["100%", "125%"]) {
        await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, fontSize);
        // Card clipping can hide overflow from page-level checks.
        const problems = await page.locator(".exercise-card").evaluate((card) => {
          const issues = [];
          const cardBox = card.getBoundingClientRect();
          const elements = [...card.querySelectorAll("h2, .previous-session, .history-button, .set-form-grid input, .set-form-grid .segmented, .draft-actions")];
          const boxes = elements.map((element) => ({ element, box: element.getBoundingClientRect() }));
          for (const { element, box } of boxes) {
            if (box.left < cardBox.left || box.right > cardBox.right) issues.push(`${element.tagName} outside card`);
            if (element.scrollWidth > element.clientWidth + 1) issues.push(`${element.tagName} content clipped`);
          }
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i].box;
              const b = boxes[j].box;
              if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push("Controls overlap");
            }
          }
          return issues;
        });
        expect(problems, `${width}px, text ${fontSize}`).toEqual([]);
      }
    }
    await page.setViewportSize({ width: 393, height: 1000 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.screenshot({ path: `/tmp/rostam-mobile-${measurementType}.png`, fullPage: true });
    await page.getByRole("button", { name: "Cancel set", exact: true }).click();
    await expect(page.locator(".set-row strong")).toBeVisible();
  });
}
