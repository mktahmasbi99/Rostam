import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

test.beforeEach(async ({ page }) => {
  await page.request.post("/__test/switch?version=1");
});

test.afterEach(async ({ page }) => {
  await page.request.post("/__test/switch?version=1");
});

async function mockApi(page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/config") return route.fulfill({ json: { today: "2026-10-25", timezone: "Europe/Warsaw", version: "1.0.0" } });
    if (path === "/api/days/2026-10-25") return route.fulfill({ json: { date: "2026-10-25", sections: [] } });
    if (path === "/api/exercises") return route.fulfill({ json: [] });
    return route.fulfill({ json: [] });
  });
}

async function waitForWaitingWorker(page) {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!registration.waiting) await registration.update();
  });
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting !== null)).toBe(true);
  await expect(page.getByRole("button", { name: "Restart to update" })).toBeVisible();
}

test("defers secondary page chunks and keeps the shell available", async ({ page }) => {
  const requests = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose a day" })).toContainText("Today");
  expect(requests.some((path) => /ExercisesPage-.*\.js$/.test(path))).toBe(false);
  await page.getByRole("button", { name: "Exercises" }).click();
  await expect(page.getByRole("heading", { name: "Exercises" })).toBeVisible();
  expect(requests.some((path) => /ExercisesPage-.*\.js$/.test(path))).toBe(true);
});

test("offers a guarded reload after a deferred import fails", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  let attempts = 0;
  await mockApi(page);
  await page.route(/\/assets\/ExercisesPage-.*\.js$/, async (route) => {
    attempts += 1;
    if (attempts === 1) await route.abort();
    else await route.continue();
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose a day" })).toContainText("Today");
  await page.getByRole("button", { name: "Exercises" }).click();
  await expect(page.getByRole("alert").getByText("This part of Rostam could not load.")).toBeVisible();
  await page.getByRole("button", { name: "Reload to try again" }).click();
  await expect(page.getByRole("button", { name: "Choose a day" })).toContainText("Today");
  await page.getByRole("button", { name: "Exercises" }).click();
  await expect(page.getByRole("heading", { name: "Exercises" })).toBeVisible();
  expect(attempts).toBe(2);
  await context.close();
});

test("installs the small shell without an update loop and caches no API or private media", async ({ page }) => {
  const documents = [];
  const transfers = [];
  page.on("request", (request) => { if (request.isNavigationRequest()) documents.push(request.url()); });
  page.on("requestfinished", async (request) => {
    const size = await request.sizes();
    transfers.push({ path: new URL(request.url()).pathname, bytes: size.responseBodySize + size.responseHeadersSize });
  });
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose a day" })).toContainText("Today");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  expect(documents).toHaveLength(1);
  console.info("Cold install transfer bytes", transfers.reduce((sum, item) => sum + item.bytes, 0), transfers);
  const secondTab = await page.context().newPage();
  await mockApi(secondTab);
  await secondTab.goto("/");
  await expect(secondTab.getByRole("button", { name: "Choose a day" })).toContainText("Today");
  const cacheReport = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = [];
    for (const name of names) for (const request of await (await caches.open(name)).keys()) urls.push(new URL(request.url).pathname);
    return { names, urls };
  });
  expect(cacheReport.urls.some((url) => url.startsWith("/api/") || url.startsWith("/api/exercise-images/"))).toBe(false);
  expect(cacheReport.urls.some((url) => url.startsWith("/exercise-assets/"))).toBe(false);
  expect(cacheReport.names.some((name) => name.includes("rostam-public-artwork"))).toBe(true);
  const artworkUrls = cacheReport.urls.filter((url) => url.startsWith("/assets/background-") || url.startsWith("/assets/logo-"));
  expect(artworkUrls.length).toBeGreaterThan(0);
  expect(artworkUrls.length).toBeLessThanOrEqual(100);
  await secondTab.close();
});

test("waits for an explicit restart and updates every ready tab", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await mockApi(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose a day" })).toContainText("Today");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const secondTab = await context.newPage();
  await mockApi(secondTab);
  await secondTab.goto("/");
  await expect(secondTab.getByRole("button", { name: "Choose a day" })).toContainText("Today");
  await page.request.post("/__test/switch?version=2");
  await waitForWaitingWorker(page);
  await page.screenshot({ path: resolve("../docs/verification/batch2-2026-10-25/update-dark-phone.png"), fullPage: true });
  expect(await page.locator('meta[name="rostam-build"]').getAttribute("content")).not.toBe("production-fixture-build-2");
  await page.getByRole("button", { name: "Restart to update" }).click();
  await expect.poll(() => page.locator('meta[name="rostam-build"]').getAttribute("content"), { timeout: 10_000 }).toBe("production-fixture-build-2");
  await expect.poll(() => secondTab.locator('meta[name="rostam-build"]').getAttribute("content"), { timeout: 10_000 }).toBe("production-fixture-build-2");
  await expect(page.getByRole("button", { name: "Restart to update" })).toHaveCount(0);
  await secondTab.close();
});

test("a dirty other tab blocks activation and keeps its draft intact", async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await mockApi(page);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const dirtyTab = await context.newPage();
  await mockApi(dirtyTab);
  await dirtyTab.goto("/");
  await expect(dirtyTab.getByRole("button", { name: "Open daily note" })).toBeVisible();
  await dirtyTab.getByRole("button", { name: "Open daily note" }).click();
  await dirtyTab.getByRole("textbox", { name: "Note" }).fill("keep this draft");
  await page.request.post("/__test/switch?version=2");
  await waitForWaitingWorker(page);
  await page.getByRole("button", { name: "Restart to update" }).click();
  await expect(page.getByText("This tab has unsaved changes.")).toBeVisible();
  await page.screenshot({ path: resolve("../docs/verification/batch2-2026-10-25/blocked-dark-desktop.png"), fullPage: true });
  await expect(dirtyTab.getByRole("textbox", { name: "Note" })).toHaveValue("keep this draft");
  await expect(page.locator('meta[name="rostam-build"]')).not.toHaveAttribute("content", "production-fixture-build-2");
  await dirtyTab.close();
});

test("the requesting tab may cancel or confirm discarding its own draft", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole("button", { name: "Open daily note" }).click();
  await page.getByRole("textbox", { name: "Note" }).fill("requester draft");
  await page.request.post("/__test/switch?version=2");
  await waitForWaitingWorker(page);
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Restart to update" }).click();
  await expect(page.getByRole("textbox", { name: "Note" })).toHaveValue("requester draft");
  await expect(page.locator('meta[name="rostam-build"]')).not.toHaveAttribute("content", "production-fixture-build-2");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Restart to update" }).click();
  await expect.poll(() => page.locator('meta[name="rostam-build"]').getAttribute("content"), { timeout: 10_000 }).toBe("production-fixture-build-2");
  await expect(page.getByRole("dialog", { name: "Daily note" })).toHaveCount(0);
});

test("keeps restart disabled until a pending save has a server response", async ({ page }) => {
  await mockApi(page);
  let finishSave;
  let saveStarted;
  const saving = new Promise((resolve) => { saveStarted = resolve; });
  await page.route("**/api/days/2026-10-25/note", async (route) => {
    saveStarted();
    await new Promise((resolve) => { finishSave = resolve; });
    await route.fulfill({ json: { date: "2026-10-25", dailyNote: "saved" } });
  });
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.getByRole("button", { name: "Open daily note" }).click();
  await page.getByRole("textbox", { name: "Note" }).fill("save this");
  await page.request.post("/__test/switch?version=2");
  await waitForWaitingWorker(page);
  await page.getByRole("button", { name: "Save note" }).click();
  await saving;
  await expect(page.getByRole("button", { name: "Restart to update" })).toBeDisabled();
  finishSave();
  await expect(page.getByRole("button", { name: "Restart to update" })).toBeEnabled();
});

test("aborts a restart when a controlled tab cannot respond within five seconds", async ({ page, context }) => {
  await mockApi(page);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const unresponsiveTab = await context.newPage();
  await unresponsiveTab.addInitScript(() => {
    const original = ServiceWorkerContainer.prototype.addEventListener;
    ServiceWorkerContainer.prototype.addEventListener = function (type, ...args) {
      if (type !== "message") original.call(this, type, ...args);
    };
  });
  await mockApi(unresponsiveTab);
  await unresponsiveTab.goto("/");
  await expect(unresponsiveTab.getByRole("button", { name: "Choose a day" })).toContainText("Today");
  await page.request.post("/__test/switch?version=2");
  await waitForWaitingWorker(page);
  await page.getByRole("button", { name: "Restart to update" }).click();
  await expect(page.getByText("An open tab did not respond.")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('meta[name="rostam-build"]')).not.toHaveAttribute("content", "production-fixture-build-2");
  await unresponsiveTab.close();
});

test("coalesces simultaneous restart requests into one update", async ({ page, context }) => {
  await mockApi(page);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const secondTab = await context.newPage();
  await mockApi(secondTab);
  await secondTab.goto("/");
  await page.request.post("/__test/switch?version=2");
  await waitForWaitingWorker(page);
  await expect(secondTab.getByRole("button", { name: "Restart to update" })).toBeVisible();
  await Promise.all([
    page.getByRole("button", { name: "Restart to update" }).evaluate((button) => button.click()),
    secondTab.getByRole("button", { name: "Restart to update" }).evaluate((button) => button.click()),
  ]);
  await expect.poll(() => page.locator('meta[name="rostam-build"]').getAttribute("content"), { timeout: 10_000 }).toBe("production-fixture-build-2");
  await expect.poll(() => secondTab.locator('meta[name="rostam-build"]').getAttribute("content"), { timeout: 10_000 }).toBe("production-fixture-build-2");
});

test("captures loading and error states in light/dark phone/desktop layouts", async ({ browser }) => {
  test.setTimeout(120_000);
  const output = resolve("../docs/verification/batch2-2026-10-25");
  await mkdir(output, { recursive: true });
  for (const theme of ["light", "dark"]) {
    for (const [device, width, height] of [["phone", 390, 844], ["desktop", 1440, 1000]]) {
      for (const state of ["loading", "error"]) {
        const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, serviceWorkers: ["loading", "error"].includes(state) ? "block" : "allow" });
        const page = await context.newPage();
        await page.request.post("/__test/switch?version=1");
        await mockApi(page);
        await page.goto("/");
        await expect(page.getByRole("button", { name: "Choose a day" })).toContainText("Today");
        if (state === "loading") {
          let continueChunk;
          await page.route(/\/assets\/ExercisesPage-.*\.js$/, async (route) => {
            await new Promise((resolveRequest) => { continueChunk = resolveRequest; });
            await route.continue();
          });
          await page.getByRole("button", { name: "Exercises" }).click();
          await expect(page.getByRole("status").getByText("Loading page…")).toBeVisible();
          await page.screenshot({ path: resolve(output, `${state}-${theme}-${device}.png`), fullPage: true });
          continueChunk();
          await expect(page.getByRole("heading", { name: "Exercises" })).toBeVisible();
        } else if (state === "error") {
          await page.route(/\/assets\/ExercisesPage-.*\.js$/, (route) => route.abort());
          await page.getByRole("button", { name: "Exercises" }).click();
          await expect(page.getByRole("alert").getByText("This part of Rostam could not load.")).toBeVisible();
          await page.screenshot({ path: resolve(output, `${state}-${theme}-${device}.png`), fullPage: true });
        }
        await context.close();
      }
    }
  }
});
