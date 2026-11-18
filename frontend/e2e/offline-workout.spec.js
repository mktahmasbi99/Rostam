import { expect, test } from "@playwright/test";
import { startLedgerFixture } from "./ledger-fixture.mjs";

test("production PWA relaunches offline and syncs alongside an open browser", async ({ browser, context, page, request }) => {
  const ledger = await startLedgerFixture(4189);
  const other = await browser.newContext();
  try {
    const origin = ledger.origin;
    const workout = await (await request.post(`${origin}/api/workouts`, { data: { name: "Offline gym" } })).json();
    const exercises = await (await request.get(`${origin}/api/exercises?query=Push-ups`)).json();
    const active = await (await request.post(`${origin}/api/workouts/${workout.id}/exercises`, {
      data: { exerciseId: exercises.find((exercise) => exercise.name === "Push-ups").id },
    })).json();
    await page.goto(origin);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.getByRole("button", { name: /Offline gym.*Resume/ }).click();
    await page.getByRole("button", { name: "Add set", exact: true }).click();
    await page.getByLabel("Reps", { exact: true }).fill("13");
    await context.setOffline(true);
    await page.getByRole("checkbox", { name: "Save set" }).click();
    await expect(page.getByText("Saved on this device · Pending sync")).toHaveCount(1);

    await page.reload();
    await page.getByRole("button", { name: "Resume Offline gym offline" }).click();
    await expect(page.getByText("Saved on this device · Pending sync")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Add exercise", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Add set", exact: true }).click();
    await page.getByLabel("Reps", { exact: true }).fill("14");
    await page.getByRole("checkbox", { name: "Save set" }).click();
    await expect(page.getByText("Saved on this device · Pending sync")).toHaveCount(2);
    const queued = await page.evaluate(() => new Promise((resolve, reject) => {
      const db = indexedDB.open("rostam-workout");
      db.onsuccess = () => {
        const read = db.result.transaction("pendingSets").objectStore("pendingSets").getAll();
        read.onsuccess = () => { db.result.close(); resolve(read.result); };
        read.onerror = () => reject(read.error);
      };
      db.onerror = () => reject(db.error);
    }));

    const desktop = await other.newPage();
    await desktop.goto(origin);
    await desktop.getByRole("button", { name: /Offline gym.*Resume/ }).click();
    await desktop.getByRole("button", { name: "Add set", exact: true }).click();
    await desktop.getByLabel("Reps", { exact: true }).fill("18");
    await desktop.getByRole("checkbox", { name: "Save set" }).click();
    await expect(desktop.getByLabel("18 reps", { exact: true })).toBeVisible();
    expect((await (await request.get(`${origin}/api/workouts/${workout.id}`)).json()).setCount).toBe(1);

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByLabel("13 reps", { exact: true })).toBeVisible();
    await expect(page.getByLabel("14 reps", { exact: true })).toBeVisible();
    await expect(page.locator("[data-rostam-app]")).toHaveAttribute("inert");
    await expect(page.getByText("Saved on this device · Pending sync")).toHaveCount(0);
    await desktop.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(desktop.getByLabel("13 reps", { exact: true })).toBeVisible();
    await expect(desktop.getByLabel("14 reps", { exact: true })).toBeVisible();
    const detail = await (await request.get(`${origin}/api/workouts/${workout.id}`)).json();
    expect(detail.setCount).toBe(3);
    expect(detail.exercises[0].id).toBe(active.exercises[0].id);
    for (const set of queued) {
      const saved = detail.exercises[0].sets.find((item) => item.operationId === set.operationId);
      expect(new Date(saved.occurredAt).toISOString()).toBe(set.payload.occurredAt);
    }
  } finally {
    await other.close();
    await ledger.close();
  }
});
