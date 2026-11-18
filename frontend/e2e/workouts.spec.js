import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startLedgerFixture } from "./ledger-fixture.mjs";

let ledger;
let origin;
test.use({ serviceWorkers: "block", screenshot: "only-on-failure" });
test.beforeAll(async () => {
  ledger = await startLedgerFixture(4187);
  origin = ledger.origin;
});
test.afterAll(async () => { await ledger?.close(); });
test.beforeEach(async ({ request }) => {
  const { items } = await (await request.get(`${origin}/api/workouts?limit=50`)).json();
  for (const item of items) await request.delete(`${origin}/api/workouts/${item.id}`, { data: { confirmation: "DELETE" } });
});

async function addExercise(page, name) {
  await page.getByRole("button", { name: "Add exercise", exact: true }).click();
  const picker = page.getByRole("dialog").last();
  await picker.locator("button.exercise-result").filter({ has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }) }).first().click();
  await expect(page.getByRole("checkbox", { name: "Save set" })).toBeVisible();
}
async function saveReps(page, reps) {
  const count = await page.getByRole("checkbox", { name: /Saved set/ }).count();
  await page.getByLabel("Reps", { exact: true }).fill(String(reps));
  await page.getByRole("checkbox", { name: "Save set" }).click();
  await expect(page.getByRole("checkbox", { name: /Saved set/ })).toHaveCount(count + 1);
  await expect(page.getByRole("checkbox", { name: /Saved set/ }).last()).toBeVisible();
  // Ensure refreshed data and the next form have arrived before further actions.
  await expect(page.getByRole("button", { name: "Finish workout" })).toBeEnabled();
}
async function cancelDraft(page) {
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  if (await cancel.count()) await cancel.click();
}

for (const width of [390, 1280]) {
  for (const theme of ["light", "dark"]) {
    test(`workout logging, recovery, and history at ${width}px in ${theme}`, async ({ page, request }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(origin);
      await page.getByRole("button", { name: "Add to day" }).click();
      await page.getByRole("menuitem", { name: /Start workout/ }).click();
      await expect(page.getByText("Workout in progress", { exact: true })).toBeVisible();
      await addExercise(page, "Push-ups");
      await saveReps(page, 10);
      await expect(page.getByLabel("Reps", { exact: true })).toHaveValue("10");
      await expect(page.getByRole("checkbox", { name: "Saved set 1; uncheck to edit" })).toBeVisible();
      await saveReps(page, 8);
      await cancelDraft(page);
      await addExercise(page, "Squats");
      await saveReps(page, 12);
      await cancelDraft(page);
      await page.getByRole("button", { name: "Move Squats earlier" }).click();
      await expect(page.getByRole("heading", { name: "1. Squats" })).toBeVisible();
      await page.getByRole("button", { name: "Edit workout details" }).click();
      await page.getByLabel("Workout name").fill("Gym session");
      await page.getByRole("button", { name: "Save workout", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Gym session", exact: true })).toBeVisible();
      await mkdir(resolve("../docs/verification/v2-workouts"), { recursive: true });
      await page.screenshot({ path: resolve(`../docs/verification/v2-workouts/workout-${width}-${theme}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Leave an unsaved set and verify explicit discard protection.
      await page.getByRole("button", { name: "Add set", exact: true }).first().click();
      await page.getByLabel("Reps", { exact: true }).fill("99");
      await page.getByRole("button", { name: "Close Gym session", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeVisible();
      await page.getByRole("button", { name: "Confirm", exact: true }).click();
      await page.reload();
      await page.getByRole("button", { name: /Gym session.*Resume/ }).click();
      await expect(page.getByText("2 exercises · 3 sets", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Finish workout", exact: true }).click();
      await expect(page.getByText("Recorded workout", { exact: true })).toBeVisible();
      const saved = page.getByRole("checkbox", { name: "Saved set 1; uncheck to edit" }).first();
      await saved.click();
      await page.getByLabel("Reps", { exact: true }).fill("13");
      await page.getByRole("checkbox", { name: "Save set" }).click();
      await expect(page.getByLabel("13 reps", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close Gym session", exact: true }).click();
      await page.getByRole("button", { name: "Choose a day" }).click();
      const { today } = await (await request.get(`${origin}/api/config`)).json();
      await expect(page.getByRole("button", { name: `${today}, activity recorded`, exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close calendar" }).click();
      const { items } = await (await request.get(`${origin}/api/workouts`)).json();
      const detail = await (await request.get(`${origin}/api/workouts/${items[0].id}`)).json();
      const history = await (await request.get(`${origin}/api/exercises/${detail.exercises[0].exercise.id}/history`)).json();
      expect(history.sessions[0].sets).toHaveLength(1);
      const day = await (await request.get(`${origin}/api/days/${today}`)).json();
      expect(day.sections).toHaveLength(0);
      expect(day.workouts[0].setCount).toBe(3);
      expect(ledger.output).not.toContain("Traceback");
    });
  }
}

test("backfilled workout preserves the live workout and supports confirmed removal", async ({ page, request }) => {
  const live = await (await request.post(`${origin}/api/workouts`, { data: { name: "Live gym" } })).json();
  await page.goto(origin);
  await page.getByRole("button", { name: "Previous day" }).click();
  await page.getByRole("button", { name: "Add to day" }).click();
  await expect(page.getByRole("menuitem", { name: /Start workout/ })).toHaveCount(1);
  await page.getByRole("menuitem", { name: /Start workout/ }).click();
  await page.getByLabel("Workout name").fill("Past gym");
  const start = await page.getByLabel("Workout start time").inputValue();
  await page.getByLabel("Workout end time").fill(`${start.slice(0, 10)}T12:00`);
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await expect(page.getByText("Recorded workout", { exact: true })).toBeVisible();
  expect((await (await request.get(`${origin}/api/workouts/active`)).json()).id).toBe(live.id);
  await expect(page.getByLabel("Workout elapsed time")).toHaveText(/\d{2}:\d{2}:\d{2}/);
  await addExercise(page, "Push-ups");
  await page.getByRole("button", { name: "Time", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Hour", exact: true }).press("ArrowUp");
  await page.getByRole("spinbutton", { name: "Hour", exact: true }).press("ArrowUp");
  await page.getByRole("button", { name: "Set time", exact: true }).click();
  await page.getByLabel("Reps", { exact: true }).fill("5");
  await page.getByRole("checkbox", { name: "Save set" }).click();
  await expect(page.getByLabel("5 reps", { exact: true })).toBeVisible();
  await cancelDraft(page);
  await page.getByRole("button", { name: "Remove Push-ups", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Remove exercise?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Your workout starts here")).toBeVisible();
  await page.getByRole("button", { name: "Discard workout", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No activity recorded" })).toBeVisible();
  expect((await (await request.get(`${origin}/api/workouts`)).json()).items.map((item) => item.id)).toEqual([live.id]);
});

test("a lost save response retries the same operation without creating another set", async ({ page, request }) => {
  await page.goto(origin);
  await page.getByRole("button", { name: "Add to day" }).click();
  await page.getByRole("menuitem", { name: /Start workout/ }).click();
  await addExercise(page, "Push-ups");
  const attempts = [];
  await page.route("**/api/workouts/*/exercises/*/sets", async (route) => {
    attempts.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (attempts.length === 1) return route.abort("connectionfailed");
    return route.fulfill({ response });
  });
  await page.getByLabel("Reps", { exact: true }).fill("17");
  await page.getByRole("checkbox", { name: "Save set" }).click();
  await expect(page.getByText("Pending workout sets (1)", { exact: true })).toHaveCount(1);
  await expect.poll(async () => (await (await request.get(`${origin}/api/workouts/active`)).json()).setCount).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByLabel("17 reps", { exact: true })).toBeVisible();
  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect((await (await request.get(`${origin}/api/workouts/active`)).json()).setCount).toBe(1);
});

test("a failed local save leaves the set form intact", async ({ page, request }) => {
  await page.goto(origin);
  await page.getByRole("button", { name: "Add to day" }).click();
  await page.getByRole("menuitem", { name: /Start workout/ }).click();
  await addExercise(page, "Push-ups");
  await page.evaluate(() => {
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === "pendingSets") throw new DOMException("Test disk quota failure", "QuotaExceededError");
      return add.apply(this, args);
    };
  });
  await page.getByLabel("Reps", { exact: true }).fill("17");
  await page.getByRole("checkbox", { name: "Save set" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not save this set on this device.");
  await expect(page.getByLabel("Reps", { exact: true })).toHaveValue("17");
  await expect(page.getByText("Saved on this device · Pending sync")).toHaveCount(0);
  expect((await (await request.get(`${origin}/api/workouts/active`)).json()).setCount).toBe(0);
});
