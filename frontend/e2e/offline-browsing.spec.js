import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { startLedgerFixture } from "./ledger-fixture.mjs";

test("downloaded ledger browses offline and survives a failed refresh", async ({ context, page, request }) => {
  test.setTimeout(60_000);
  const ledger = await startLedgerFixture(4191);
  const { origin } = ledger;
  try {
    const { today } = await (await request.get(`${origin}/api/config`)).json();
    const previous = new Date(`${today}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    const earlier = previous.toISOString().slice(0, 10);
    const exercises = await (await request.get(`${origin}/api/exercises?query=Push-ups`)).json();
    const exercise = exercises.find((item) => item.name === "Push-ups");

    for (const day of [today, earlier]) {
      const set = await request.post(`${origin}/api/days/${day}/exercises/${exercise.id}/sets`, {
        data: { repetitions: 8, time: "00:00", resistanceKind: "bodyweight" },
      });
      expect(set.status()).toBe(201);
    }
    const workout = await (await request.post(`${origin}/api/workouts`, { data: { name: "Downloaded workout" } })).json();
    expect((await request.put(`${origin}/api/days/${earlier}/note`, { data: { body: "Note in the downloaded ledger" } })).ok()).toBe(true);
    expect((await request.post(`${origin}/api/days/${earlier}/photos`, {
      multipart: { files: { name: "offline.png", mimeType: "image/png", buffer: await readFile("public/favicon.png") } },
    })).status()).toBe(201);

    await page.goto(origin);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Download for offline use" }).click();
    await expect(page.getByText(/^Ready offline/)).toBeVisible({ timeout: 20000 });

    await page.evaluate(() => {
      Object.defineProperty(StorageManager.prototype, "estimate", {
        configurable: true, value: async () => ({ quota: 100, usage: 99 }),
      });
    });
    await page.getByRole("button", { name: "Refresh offline copy" }).click();
    await expect(page.getByText("There is not enough storage for the offline copy.")).toBeVisible();
    await expect(page.getByText(/^Ready offline/)).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();

    await page.evaluate(() => {
      const originalFetch = window.fetch;
      window.fetch = async (path, init) => {
        const response = await originalFetch(path, init);
        if (path !== "/api/offline/snapshot") return response;
        window.fetch = originalFetch;
        const body = (await response.text()).replace(/\["complete",true\]\n$/, "");
        return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
      };
    });
    await page.getByRole("button", { name: "Refresh offline copy" }).click();
    await expect(page.getByText("The offline ledger download was incomplete.")).toBeVisible();
    await expect(page.getByText(/^Ready offline/)).toBeVisible();

    ledger.setPaused(true);
    await page.close();
    const offline = await context.newPage();
    await offline.goto(origin);
    expect(await offline.evaluate(() => navigator.onLine)).toBe(true);
    await expect(offline.getByText(/^Viewing offline copy/)).toBeVisible({ timeout: 10000 });
    await expect(offline.getByRole("button", { name: "Add set", exact: true })).toBeDisabled();
    await expect(offline.getByText("Connect to Rostam to add sets from Today.")).toBeVisible();
    await offline.getByRole("button", { name: /Downloaded workout.*View/ }).click();
    await expect(offline.getByRole("dialog", { name: "Downloaded workout" })).toBeVisible();
    await offline.getByRole("button", { name: "Close Downloaded workout", exact: true }).click();
    await offline.getByRole("button", { name: "Choose a day" }).click();
    await expect(offline.getByRole("dialog")).toBeVisible();
    if (earlier.slice(0, 7) !== today.slice(0, 7)) await offline.getByRole("button", { name: "Previous month" }).click();
    await offline.getByRole("button", { name: `${earlier}, activity recorded` }).click();
    await expect(offline.getByLabel("8 reps", { exact: true })).toBeVisible();
    await offline.getByRole("button", { name: "History for Push-ups" }).click();
    await expect(offline.getByRole("dialog", { name: "Push-ups history" })).toBeVisible();
    await offline.getByRole("button", { name: "Close Push-ups history", exact: true }).click();
    await offline.getByRole("button", { name: "Exercises", exact: true }).click();
    await offline.getByRole("searchbox").fill("Push-ups");
    await expect(offline.getByRole("button", { name: "View Push-ups", exact: true })).toBeVisible();
    await offline.getByRole("button", { name: "Notes", exact: true }).click();
    await expect(offline.getByText("Note in the downloaded ledger")).toBeVisible();
    await offline.getByRole("button", { name: "Photos", exact: true }).click();
    const thumbnail = offline.getByRole("img", { name: `Photo from ${earlier}` });
    await expect.poll(() => thumbnail.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    await offline.getByRole("button", { name: `View full photo from ${earlier}` }).click();
    const full = offline.getByRole("dialog").getByRole("img", { name: `Photo from ${earlier}` });
    await expect.poll(() => full.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);

    await offline.getByRole("button", { name: `Close Photo from ${earlier}` }).click();
    ledger.setPaused(false);
    await offline.getByRole("button", { name: "Check connection" }).click();
    await offline.getByRole("button", { name: "Settings", exact: true }).click();
    await offline.getByRole("button", { name: "Refresh offline copy" }).click();
    await expect(offline.getByRole("button", { name: "Refresh offline copy" })).toBeEnabled();
    await expect(offline.getByText(/^Ready offline/)).toBeVisible();
    await offline.getByRole("button", { name: "Remove offline copy" }).click();
    await expect(offline.getByText(/^Ready offline/)).toHaveCount(0);
    await offline.getByRole("button", { name: "Download for offline use" }).click();
    await expect(offline.getByText(/^Ready offline/)).toBeVisible({ timeout: 20000 });
    await offline.getByRole("button", { name: "Today", exact: true }).click();

    const backup = await (await request.post(`${origin}/api/backups/on-demand`)).json();
    const restore = await request.post(`${origin}/api/backups/${encodeURIComponent(backup.id)}/restore`, { data: { confirmation: "RESTORE" } });
    expect(restore.ok()).toBe(true);
    expect((await request.get(`${origin}/api/workouts/${workout.id}`)).ok()).toBe(true);
    await offline.reload();
    await offline.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(offline.getByRole("button", { name: "Download for offline use" })).toBeEnabled();
    await expect(offline.getByText(/^Ready offline/)).toHaveCount(0);
  } finally {
    await ledger.close();
  }
});
