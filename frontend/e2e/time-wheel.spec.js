import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function openPicker(page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return route.fulfill({ json: { today: "2026-10-27", timezone: "Europe/Warsaw", version: "1.0.0" } });
    if (path === "/api/days/2026-10-27") return route.fulfill({ json: {
      date: "2026-10-27", sections: [], activities: [{ id: 1, activityId: 1, activityName: "BJJ", date: "2026-10-27", startedAt: "2026-10-27T12:30:00", endedAt: "2026-10-27T18:40:00", durationSeconds: 22200, note: "", createdAt: "" }],
    } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Edit time for BJJ", exact: true }).click();
  await page.getByRole("button", { name: "Start time", exact: true }).click();
}

async function swipe(page, speed) {
  const wheel = page.getByRole("spinbutton", { name: "Minute", exact: true });
  const box = await wheel.boundingBox();
  const session = await page.context().newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2 + 40;
  // Raw touch events also work in Linux's headless shell. Explicit event times
  // keep velocity independent of protocol latency and worker scheduling.
  const steps = 8;
  const interval = 80 / speed / steps;
  const startedAt = Date.now() / 1000;
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }], timestamp: startedAt });
  for (let step = 1; step <= steps; step++) {
    await page.waitForTimeout(interval * 1000);
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - step * 10 }], timestamp: startedAt + step * interval });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: startedAt + (steps + .5) * interval });
  await session.detach();
  await page.waitForTimeout(1500);
  return Number(await wheel.getAttribute("aria-valuenow"));
}

test("native touch momentum travels farther for a fast flick and settles on a row", async ({ page }) => {
  await openPicker(page);
  const slow = await swipe(page, 100);
  await page.getByRole("button", { name: "Set time", exact: true }).locator("..").getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Start time", exact: true }).click();
  const fast = await swipe(page, 2000);
  expect(slow).toBeGreaterThan(30);
  expect(fast).toBeGreaterThan(slow);
  const wheel = page.getByRole("spinbutton", { name: "Minute", exact: true });
  const alignment = await wheel.locator(".time-wheel-scroll").evaluate((element) => Math.abs(element.scrollTop - Number(element.parentElement.getAttribute("aria-valuenow")) * 36));
  expect(alignment).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "/tmp/rostam-time-picker-mobile.png" });
  await page.getByRole("button", { name: "Set time", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start time", exact: true })).toHaveText(`12:${String(fast).padStart(2, "0")}`);
});

test.describe("desktop controls", () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

  test("mouse wheel, dragging, tapping rows, and keyboard stay aligned", async ({ page }) => {
    await openPicker(page);
    const wheel = page.getByRole("spinbutton", { name: "Minute", exact: true });
    await wheel.hover();
    await page.mouse.wheel(0, 100);
    await expect(wheel).toHaveAttribute("aria-valuenow", "31");
    await wheel.locator(".time-wheel-option").filter({ hasText: /^33$/ }).click();
    await expect(wheel).toHaveAttribute("aria-valuenow", "33");
    const box = await wheel.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 36);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 36, { steps: 8 });
    await page.mouse.up();
    await expect(wheel).toHaveAttribute("aria-valuenow", "35");
    await wheel.press("End");
    await expect(wheel).toHaveAttribute("aria-valuenow", "59");
    await wheel.press("Home");
    await expect(wheel).toHaveAttribute("aria-valuenow", "0");
    await expect(wheel.locator(".time-wheel-scroll")).toHaveJSProperty("scrollTop", 0);
  });
});
