import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 393, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });

async function setup(page, { failDelete = false, count = 2 } = {}) {
  const exercise = { id: 1, name: "Push-ups", measurementType: "repetitions", equipment: null, allowBodyweight: true, hasHistory: false, exerciseNote: null, imageKey: null };
  const state = { deletions: 0, failDelete, sets: Array.from({ length: count }, (_, index) => ({ id: index + 1, exerciseId: 1, time: "14:43", repetitions: 12, resistanceKind: "bodyweight", weightKg: null })) };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return route.fulfill({ json: { today: "2026-10-27", timezone: "Europe/Warsaw", version: "1" } });
    if (path === "/api/days/2026-10-27") return route.fulfill({ json: { date: "2026-10-27", sections: [{ exercise, sets: state.sets, total: state.sets.length * 12 }], activities: [] } });
    if (path === "/api/exercises/1/prefill") return route.fulfill({ json: { source: "previous", repetitions: 12, resistanceKind: "bodyweight", weightKg: null } });
    if (route.request().method() === "DELETE") {
      state.deletions++;
      if (state.failDelete) return route.fulfill({ status: 503, json: { detail: "Deletion failed; please refresh" } });
      state.sets = state.sets.filter((set) => set.id !== Number(path.split("/").at(-1)));
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  await expect(page.locator(".set-row")).toHaveCount(count);
  return state;
}

async function drag(page, content, dx, dy = 0, release = true) {
  await content.scrollIntoViewIfNeeded();
  const box = await content.boundingBox();
  // Start in row padding, away from inputs, checkboxes, and menus.
  const x = box.x + box.width - 3;
  const y = box.y + 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  if (release) await page.mouse.up();
}

test("a partial swipe reveals Delete; tapping it deletes only that saved set", async ({ page }) => {
  const state = await setup(page);
  const row = page.locator(".set-swipe").filter({ has: page.locator(".set-row") }).first();
  await drag(page, row.locator(".set-swipe-content"), -90);
  expect(state.deletions).toBe(0);
  await expect(row.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator(".set-row")).toHaveCount(1);
  expect(state.deletions).toBe(1);
});

test("a full swipe deletes on release and preserves a failed deletion", async ({ page }) => {
  const state = await setup(page, { failDelete: true });
  const content = page.locator(".set-swipe-content").first();
  await drag(page, content, -260, 0, false);
  expect(state.deletions).toBe(0);
  await page.mouse.up();
  await expect(page.getByRole("alert")).toContainText("Deletion failed");
  await expect(page.locator(".set-row")).toHaveCount(2);
  await expect(content).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  state.failDelete = false;
  await drag(page, content, -260);
  await expect(page.locator(".set-row")).toHaveCount(1);
  expect(state.deletions).toBe(2);
});

test("cancellation and vertical intent never delete; edits cancel and new drafts swipe away", async ({ page }) => {
  const state = await setup(page);
  const content = page.locator(".set-swipe-content").first();
  await drag(page, content, -260, 0, false);
  await content.dispatchEvent("pointercancel", { pointerId: 1 });
  await page.mouse.up();
  await expect(content).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await drag(page, content, -8, 90);
  expect(state.deletions).toBe(0);
  await page.getByRole("checkbox", { name: "Saved set 1; uncheck to edit", exact: true }).click();
  await page.getByLabel("Reps", { exact: true }).fill("99");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".set-row").first()).toContainText("12");
  await page.getByRole("button", { name: "Add set", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Save set", exact: true })).not.toBeChecked();
  const draft = page.locator(".set-swipe").filter({ has: page.locator(".set-draft") });
  await drag(page, draft.locator(".set-swipe-content"), -260);
  await expect(page.locator(".set-draft")).toHaveCount(0);
  expect(state.deletions).toBe(0);
});

test("swiping an editing row deletes its saved record; dragging an input does not", async ({ page }) => {
  const state = await setup(page);
  await page.getByRole("checkbox", { name: "Saved set 1; uncheck to edit", exact: true }).click();
  const input = page.getByLabel("Reps", { exact: true });
  await input.fill("12345");
  await expect(input).toHaveValue("12345");
  const box = await input.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 250, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(state.deletions).toBe(0);
  const draft = page.locator(".set-swipe").filter({ has: page.locator(".set-draft") });
  await drag(page, draft.locator(".set-swipe-content"), -260);
  await expect(page.locator(".set-row")).toHaveCount(1);
  await expect(page.locator(".set-draft")).toHaveCount(0);
  expect(state.deletions).toBe(1);
});

test("native vertical touch scrolling keeps set rows intact", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP touch injection is Chromium-specific; pointer intent is covered in both engines.");
  const state = await setup(page, { count: 20 });
  const row = page.locator(".set-swipe-content").nth(3);
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + 5;
  const before = await page.evaluate(() => scrollY);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 15 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  expect(state.deletions).toBe(0);
  await expect(page.locator(".set-row")).toHaveCount(20);
});

test("native horizontal touch deletes only after releasing the full swipe", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP touch injection is Chromium-specific.");
  const state = await setup(page);
  const content = page.locator(".set-swipe-content").first();
  await content.scrollIntoViewIfNeeded();
  const box = await content.boundingBox();
  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width * .6;
  const y = box.y + 3;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step++) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - step * 28, y }] });
  expect(state.deletions).toBe(0);
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
  await expect(page.locator(".set-row")).toHaveCount(1);
  expect(state.deletions).toBe(1);
});
