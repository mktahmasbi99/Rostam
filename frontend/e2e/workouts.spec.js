import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// Real API and SQLite, isolated from every user database and the PWA fixtures.
const origin = "http://127.0.0.1:4187";
let backend;
let directory;
let backendOutput = "";
test.use({ serviceWorkers: "block", screenshot: "only-on-failure" });
test.beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), "rostam-workout-e2e-"));
  backend = spawn(existsSync(resolve("../.venv/bin/python")) ? resolve("../.venv/bin/python") : "python3", ["-m", "uvicorn", "app.main:app", "--app-dir", resolve("../backend"), "--host", "127.0.0.1", "--port", "4187"], {
    env: { ...process.env, ROSTAM_DB: resolve(directory, "ledger.sqlite3"), TZ: "Europe/Warsaw" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  backend.stdout.on("data", (chunk) => { backendOutput += chunk; });
  backend.stderr.on("data", (chunk) => { backendOutput += chunk; });
  await expect.poll(async () => { try { return (await fetch(`${origin}/api/config`)).status; } catch { return 0; } }, { message: "Temporary workout backend must start", timeout: 15000 }).toBe(200);
});
test.afterAll(async () => {
  if (backend && backend.exitCode === null) { backend.kill("SIGTERM"); await new Promise((done) => backend.once("exit", done)); }
  if (directory) await rm(directory, { recursive: true, force: true });
});
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
      expect(backendOutput).not.toContain("Traceback");
    });
  }
}

test("backfilled workout, invalid times, and confirmed removal", async ({ page, request }) => {
  await page.goto(origin);
  await page.getByRole("button", { name: "Previous day" }).click();
  await page.getByRole("button", { name: "Add to day" }).click();
  await expect(page.getByRole("menuitem", { name: /Start workout/ })).toHaveCount(1);
  await page.getByRole("menuitem", { name: /Start workout/ }).click();
  await page.getByLabel("Workout name").fill("Past gym");
  await page.getByRole("button", { name: "Save workout", exact: true }).click();
  await addExercise(page, "Push-ups");
  await page.getByLabel("Time", { exact: true }).fill("11:00");
  await page.getByLabel("Reps", { exact: true }).fill("5");
  await page.getByRole("checkbox", { name: "Save set" }).click();
  await expect(page.getByRole("alert")).toContainText("within the workout");
  await page.getByLabel("Time", { exact: true }).fill("09:30");
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
  expect((await (await request.get(`${origin}/api/workouts`)).json()).items).toHaveLength(0);
});

test("connection loss retains unsaved set values without retrying", async ({ page, request }) => {
  await page.goto(origin);
  await page.getByRole("button", { name: "Add to day" }).click();
  await page.getByRole("menuitem", { name: /Start workout/ }).click();
  await addExercise(page, "Push-ups");
  let attempts = 0;
  await page.route("**/api/workouts/*/exercises/*/sets", (route) => { attempts++; return route.abort("connectionfailed"); });
  await page.getByLabel("Reps", { exact: true }).fill("17");
  await page.getByRole("checkbox", { name: "Save set" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("change may have reached Rostam");
  await expect(page.getByLabel("Reps", { exact: true })).toHaveValue("17");
  await expect(page.getByRole("checkbox", { name: "Save set" })).toBeDisabled();
  expect(attempts).toBe(1);
  const active = await (await request.get(`${origin}/api/workouts/active`)).json();
  expect(active.setCount).toBe(0);
});
