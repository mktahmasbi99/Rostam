import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Use an isolated real FastAPI/SQLite server: the missing choice must not be hidden by API mocks.
const liveTest = test.extend({
  liveApi: async ({ request }, use) => {
    const directory = await mkdtemp(join(tmpdir(), "rostam-rotation-test-"));
    const localPython = resolve("../.venv/bin/python");
    const child = spawn(existsSync(localPython) ? localPython : "python3", ["-c", 'import socket, uvicorn; sock = socket.socket(); sock.bind(("127.0.0.1", 0)); print(sock.getsockname()[1], flush=True); from app.main import app; uvicorn.Server(uvicorn.Config(app, log_level="error")).run(sockets=[sock])'], {
      env: { ...process.env, PYTHONPATH: resolve("../backend"), ROSTAM_DB: join(directory, "test.sqlite3"), TZ: "Europe/Warsaw" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stderr.on("data", (data) => { logs += data; });
    try {
      const port = await new Promise((resolvePort, reject) => {
        let output = "";
        child.stdout.on("data", (data) => {
          output += data;
          if (/^\d+\n/.test(output)) resolvePort(Number(output.split("\n")[0]));
        });
        child.once("error", reject);
        child.once("exit", () => reject(new Error(`Test API exited: ${logs}`)));
      });
      const url = `http://127.0.0.1:${port}`;
      await expect.poll(async () => {
        try { return (await request.get(`${url}/api/config`)).ok(); } catch { return false; }
      }).toBe(true);
      await use(url);
    } finally {
      const stopped = new Promise((resolveStop) => child.once("exit", resolveStop));
      if (child.exitCode === null) { child.kill("SIGTERM"); await stopped; }
      await rm(directory, { recursive: true, force: true });
    }
  },
});

liveTest.use({ serviceWorkers: "block", actionTimeout: 5000 });
for (const choice of ["Just record it", "Add to rotation"]) {
  liveTest(`${choice} saves outside-rotation exercises against the real backend`, async ({ page, request, liveApi }) => {
    const exercises = await (await request.get(`${liveApi}/api/exercises`)).json();
    const member = exercises.find((item) => item.measurementType === "repetitions" && !item.equipment);
    const newcomer = await (await request.post(`${liveApi}/api/exercises`, { data: { baseName: "Checkbox regression", measurementType: "repetitions", equipment: null, allowBodyweight: true } })).json();
    const rotation = await (await request.post(`${liveApi}/api/rotations`, { data: { name: "Regression rotation" } })).json();
    await request.put(`${liveApi}/api/rotations/${rotation.id}/members`, { data: { exerciseIds: [member.id] } });
    await request.post(`${liveApi}/api/rotations/${rotation.id}/activate`, { data: { firstExerciseId: member.id } });
    const { today } = await (await request.get(`${liveApi}/api/config`)).json();
    const missingChoice = await request.post(`${liveApi}/api/days/${today}/exercises/${newcomer.id}/sets`, { data: { repetitions: 8, resistanceKind: "bodyweight" } });
    expect(missingChoice.ok()).toBe(false);
    expect(await missingChoice.text()).toContain("Choose Add to rotation");
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      await route.fulfill({ response: await route.fetch({ url: `${liveApi}${url.pathname}${url.search}` }) });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Add to day", exact: true }).click();
    await page.getByRole("menuitem", { name: /Add exercise/ }).click();
    await page.getByRole("button", { name: "Go to exercise library", exact: true }).click();
    await page.getByPlaceholder("Search exercises", { exact: true }).fill("Checkbox regression");
    await page.getByRole("button", { name: /Checkbox regression/ }).click();
    await page.getByRole("button", { name: choice, exact: true }).click();
    await expect(page.getByText("No sets recorded")).toBeVisible();
    await page.getByLabel("Reps", { exact: true }).fill("8");
    await page.getByRole("checkbox", { name: "Save set", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Saved set 1; uncheck to edit" })).toBeChecked();
    await expect(page.getByRole("alert")).toHaveCount(0);
    const day = await (await request.get(`${liveApi}/api/days/${today}`)).json();
    expect(day.sections.find((section) => section.exercise.id === newcomer.id).sets).toHaveLength(1);
    const rotations = await (await request.get(`${liveApi}/api/rotations`)).json();
    expect(rotations[0].members.some((item) => item.exercise.id === newcomer.id)).toBe(choice === "Add to rotation");
  });
}

liveTest("a selected exercise survives refresh and supports partial and full left swipes", async ({ page, request, liveApi }) => {
  const { today } = await (await request.get(`${liveApi}/api/config`)).json();
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const exercises = await (await request.get(`${liveApi}/api/exercises`)).json();
  const exercise = exercises.find((item) => item.name === "Push-ups");
  for (const [time, repetitions] of [["12:00", 12], ["13:00", 8]]) {
    const result = await request.post(`${liveApi}/api/days/${yesterday}/exercises/${exercise.id}/sets`, {
      data: { time, repetitions, resistanceKind: "bodyweight" },
    });
    expect(result.ok()).toBe(true);
  }
  await page.setViewportSize({ width: 393, height: 844 });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: `${liveApi}${url.pathname}${url.search}` }) });
  });
  await page.goto("/");

  async function addExercise() {
    await page.getByRole("button", { name: "Add to day", exact: true }).click();
    await page.getByRole("menuitem", { name: /Add exercise/ }).click();
    await page.getByRole("button", { name: /Push-ups/ }).first().click();
    await expect(page.getByRole("checkbox", { name: "Save set", exact: true })).toBeVisible();
  }

  const card = page.locator(".exercise-card-swipe");
  const header = card.locator(".exercise-card-header");
  async function swipe(dx) {
    const box = await header.boundingBox();
    const x = box.x + box.width - 5;
    const y = box.y + 7;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 8 });
    await page.mouse.up();
  }

  await addExercise();
  await page.reload();
  await expect(card.getByText(/Last session · .* · 20 reps total · Last set: 8 reps, BW/)).toBeVisible();
  await expect(card.getByRole("button", { name: "Add set", exact: true })).toBeVisible();
  await swipe(-90);
  await expect(card).toHaveCount(1);
  await card.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0);

  await addExercise();
  await swipe(-260);
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("No activity recorded")).toBeVisible();
  expect((await (await request.get(`${liveApi}/api/days/${yesterday}`)).json()).sections[0].sets).toHaveLength(2);
});
