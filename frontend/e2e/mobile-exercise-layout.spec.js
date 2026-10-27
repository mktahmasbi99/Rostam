import { expect, test } from "@playwright/test";

// Reproduce the localized last-session date in the phone screenshots.
test.use({ locale: "pl-PL", serviceWorkers: "block" });

for (const measurementType of ["repetitions", "duration", "timed_repetitions"]) {
  for (const weighted of [false, true]) {
    test(`${measurementType}, resistance ${weighted}: shared columns fit phone screens`, async ({ page }) => {
      const exercise = {
        id: 1, name: "Deadlifts (Resistance Bands)", baseName: "Deadlifts",
        measurementType, equipment: weighted ? "resistance_band" : null, allowBodyweight: true,
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
        resistanceKind: weighted ? "external" : "bodyweight", weightKg: weighted ? "40" : null, equipment: weighted ? "resistance_band" : null,
      };
      await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/config") return route.fulfill({ json: { today: "2026-10-27", timezone: "Europe/Warsaw", version: "1" } });
        if (path === "/api/days/2026-10-27") return route.fulfill({ json: { date: "2026-10-27", sections: [{ exercise, sets: [set, { ...set, id: 2, resistanceKind: "bodyweight", weightKg: null }], total: 30 }], activities: [] } });
        if (path === "/api/exercises/1/history") return route.fulfill({ json: { sessions: [{ date: "2026-10-11", sets: [set], total: 15 }], nextBeforeDate: null } });
        return route.fulfill({ json: [] });
      });
      await page.goto("/");
      await expect(page.locator(".previous-session")).toContainText("2026");
      await expect(page.locator(".set-row .set-actions-trigger")).toHaveCount(0);
      await page.getByRole("checkbox", { name: "Saved set 1; uncheck to edit", exact: true }).click();
      await expect(page.getByLabel("Time", { exact: true })).toHaveValue("10:11");

      for (const width of [320, 360, 393, 430, 768, 907, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const fontSize of ["100%", "125%"]) {
          await page.evaluate((size) => { document.documentElement.style.fontSize = size; }, fontSize);
          // Card clipping can hide overflow from page-level checks.
          const problems = await page.locator(".exercise-card").evaluate((card) => {
            const issues = [];
            const cardBox = card.getBoundingClientRect();
            const elements = [...card.querySelectorAll("h2, .previous-session, .history-button, .set-form-grid input:not([type=checkbox]), .set-form-grid .set-completion, .set-form-grid .set-actions-menu")];
            const boxes = elements.map((element) => ({ element, box: element.getBoundingClientRect() }));
            for (const { element, box } of boxes) {
              if (box.left < cardBox.left || box.right > cardBox.right) issues.push(`${element.tagName} outside card`);
              if (element.scrollWidth > element.clientWidth + 1) issues.push(`${element.tagName} ${element.getAttribute("aria-label")} content clipped (${element.scrollWidth}/${element.clientWidth})`);
            }
            for (let i = 0; i < boxes.length; i++) {
              for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i].box;
                const b = boxes[j].box;
                if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push("Controls overlap");
              }
            }
            const headerCells = [...card.querySelectorAll(".set-table-header > span:not(.visually-hidden)")];
            const inputs = [...card.querySelectorAll(".set-form-grid input:not([type=checkbox])")];
            const savedCells = [...card.querySelectorAll(".set-row > time, .set-row > strong")];
            for (let i = 0; i < inputs.length; i++) {
              const heading = headerCells[i].getBoundingClientRect();
              for (const cell of [inputs[i], savedCells[i]]) {
                const box = cell.getBoundingClientRect();
                if (Math.abs((box.left + box.width / 2) - (heading.left + heading.width / 2)) > 1) issues.push("Columns misaligned");
              }
            }
            const checkbox = card.querySelector(".set-form-grid .set-completion").getBoundingClientRect();
            const savedCheckbox = card.querySelector(".set-row .set-completion").getBoundingClientRect();
            if (Math.abs((checkbox.left + checkbox.width / 2) - (savedCheckbox.left + savedCheckbox.width / 2)) > 1) issues.push("Checkboxes misaligned");
            // With just time/reps, columns have ample room to be exactly evenly spaced.
            if (inputs.length === 2 && inputs[1].getAttribute("aria-label") === "Reps") {
              const centers = [...inputs.map((input) => { const box = input.getBoundingClientRect(); return box.left + box.width / 2; }), checkbox.left + checkbox.width / 2];
              if (Math.abs((centers[1] - centers[0]) - (centers[2] - centers[1])) > 1) issues.push("Controls not evenly spaced");
            }
            return issues;
          });
          expect(problems, `${width}px, text ${fontSize}`).toEqual([]);
        }
      }
      await page.setViewportSize({ width: 393, height: 1000 });
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await page.screenshot({ path: `/tmp/rostam-mobile-${measurementType}-${weighted}.png`, fullPage: true });
      await page.setViewportSize({ width: 907, height: 954 });
      await page.screenshot({ path: `/tmp/rostam-compact-${measurementType}-${weighted}-907.png`, fullPage: true });
      if (measurementType !== "duration") {
        const reps = page.getByLabel("Reps", { exact: true });
        await reps.fill("12345");
        await expect(reps).toHaveValue("12345");
        expect((await reps.boundingBox()).width).toBeLessThanOrEqual(40);
      }
      if (weighted) {
        const kg = page.getByLabel("kg", { exact: true });
        await kg.fill("1234.5");
        await expect(kg).toHaveValue("1234.5");
        expect((await kg.boundingBox()).width).toBeLessThanOrEqual(48);
      }
      await page.getByRole("button", { name: "Entry actions", exact: true }).click();
      await page.getByRole("menuitem", { name: "Discard changes", exact: true }).click();
      await expect(page.locator(".set-row")).toHaveCount(2);
      if (weighted) await expect(page.locator(".set-row").nth(1)).toContainText("BW");
      await page.getByRole("button", { name: "History for Deadlifts (Resistance Bands)", exact: true }).click();
      await expect(page.getByRole("dialog").locator(".set-table-header")).toHaveCount(1);
      await expect(page.getByRole("dialog").getByRole("button", { name: /Actions for set/ })).toHaveCount(0);
    });
  }
}

test("adds, retries, edits and deletes a timed-reps set with combined hold entry", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 900 });
  const exercise = { id: 1, name: "Weighted holds", measurementType: "timed_repetitions", equipment: "dumbbell", allowBodyweight: true, hasHistory: false, imageKey: null, exerciseNote: null };
  const prefill = { source: "previous", time: null, repetitions: 4, durationMinutes: null, durationSeconds: null, holdMinutes: 0, holdSeconds: 10, resistanceKind: "external", weightKg: "10" };
  let sets = [];
  let failSave = true;
  let lastPayload;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/config") return route.fulfill({ json: { today: "2026-10-27", timezone: "Europe/Warsaw", version: "1" } });
    if (path === "/api/days/2026-10-27") return route.fulfill({ json: { date: "2026-10-27", sections: [{ exercise, sets, total: sets.reduce((sum, set) => sum + set.repetitions, 0) }], activities: [] } });
    if (path === "/api/exercises/1/prefill") return route.fulfill({ json: prefill });
    if (method === "POST" || method === "PATCH") {
      lastPayload = route.request().postDataJSON();
      if (failSave) { failSave = false; return route.fulfill({ status: 503, json: { detail: "Please retry this save" } }); }
      sets = [{ ...lastPayload, id: 1, exerciseId: 1, time: "14:17" }];
      return route.fulfill({ json: sets[0] });
    }
    if (method === "DELETE") { sets = []; return route.fulfill({ status: 204 }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add set", exact: true }).click();
  const hold = page.getByLabel("Hold per repetition", { exact: true });
  await expect(hold).toHaveValue("0:10");
  await hold.fill("");
  await hold.pressSequentially("130");
  await expect(hold).toHaveValue("1:30");
  await page.getByLabel("kg", { exact: true }).fill("0");
  await page.getByRole("checkbox", { name: "Save set", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Please retry this save");
  await expect(hold).toHaveValue("1:30");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".set-row")).toHaveCount(1);
  expect(lastPayload).toMatchObject({ holdMinutes: 1, holdSeconds: 30, resistanceKind: "bodyweight", weightKg: null });
  await expect(page.locator(".set-row")).toContainText("BW");
  await page.getByRole("checkbox", { name: "Saved set 1; uncheck to edit", exact: true }).click();
  await expect(hold).toHaveValue("1:30");
  await page.getByLabel("kg", { exact: true }).fill("25");
  await page.getByRole("checkbox", { name: "Save set", exact: true }).click();
  await expect(page.locator(".set-row")).toHaveCount(1);
  expect(lastPayload).toMatchObject({ holdMinutes: 1, holdSeconds: 30, resistanceKind: "external", weightKg: "25" });
  await page.getByRole("checkbox", { name: "Saved set 1; uncheck to edit", exact: true }).click();
  await page.getByRole("button", { name: "Entry actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete set", exact: true }).click();
  await expect(page.locator(".set-row")).toHaveCount(0);
});
