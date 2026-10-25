import { expect, test } from "@playwright/test";

const today = "2026-10-25";
const config = { today, timezone: "Europe/Warsaw", version: "1.0.0" };

async function installApiRoutes(page, { failFirstConfig = false } = {}) {
  let failConfig = failFirstConfig;
  let savedNote = "Server note";
  let writes = 0;
  let interruptNextWrite = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/config") {
      if (failConfig) { failConfig = false; await route.abort(); return; }
      await route.fulfill({ json: config });
      return;
    }
    if (path === `/api/days/${today}`) {
      await route.fulfill({ json: { date: today, sections: [], dailyNote: savedNote, photoCount: 0 } });
      return;
    }
    if (path === `/api/days/${today}/note` && request.method() === "PUT") {
      writes += 1;
      savedNote = request.postDataJSON().body;
      if (interruptNextWrite) { interruptNextWrite = false; await route.abort(); return; }
      await route.fulfill({ json: { date: today, dailyNote: savedNote } });
      return;
    }
    await route.fulfill({ json: [] });
  });
  return {
    failConfig() { failConfig = true; },
    restoreConfig() { failConfig = false; },
    interruptWrite() { interruptNextWrite = true; },
    get writes() { return writes; },
  };
}

test("recovers from startup and live disconnection without losing a draft or sending a write", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const api = await installApiRoutes(page, { failFirstConfig: true });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("button", { name: "Choose a day" })).toBeVisible();

  await page.getByRole("button", { name: "Open daily note" }).click();
  const note = page.getByRole("textbox", { name: "Note" });
  await note.fill("Unsaved text stays in this tab");
  api.failConfig();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".connection-banner")).toContainText("Rostam is disconnected");
  await expect(note).toBeDisabled();
  await expect(note).toHaveValue("Unsaved text stays in this tab");

  api.restoreConfig();
  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.locator(".connection-banner")).toHaveCount(0);
  await expect(note).toBeEnabled();
  await expect(note).toHaveValue("Unsaved text stays in this tab");
  expect(api.writes).toBe(0);
  await context.close();
});

test("reconciles an interrupted save by reload and never replays it", async ({ browser }) => {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  const api = await installApiRoutes(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Choose a day" })).toBeVisible();
  await page.getByRole("button", { name: "Open daily note" }).click();
  const note = page.getByRole("textbox", { name: "Note" });
  await note.fill("Saved before response was interrupted");
  api.interruptWrite();
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.locator(".connection-banner")).toContainText("A save result is uncertain");
  await expect(page.getByRole("button", { name: "Reload to reconcile" })).toBeVisible();
  await expect(note).toBeDisabled();
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  expect(await page.evaluate(() => Object.values(localStorage).join(" "))).not.toContain("Saved before response was interrupted");

  await page.getByRole("button", { name: "Check connection" }).click();
  await expect(page.locator(".connection-banner")).toContainText("reload and reconcile");
  expect(api.writes).toBe(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reload to reconcile" }).click();
  await expect(page.getByRole("button", { name: "Choose a day" })).toBeVisible();
  await page.getByRole("button", { name: "Open daily note" }).click();
  await expect(page.getByRole("textbox", { name: "Note" })).toHaveValue("Saved before response was interrupted");
  expect(api.writes).toBe(1);
  await context.close();
});
