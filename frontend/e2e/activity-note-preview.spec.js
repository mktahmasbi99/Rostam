import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block", hasTouch: true });

for (const width of [390, 1280]) {
  test(`activity notes expand without losing text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const longNote = "Guard retention: keep elbows close and recover inside position.\n"
      + "Passing: control the hips before switching sides.\n"
      + "Escapes: frame, create space, and recover guard.\n"
      + "Rounds: focus on calm breathing and deliberate movement.\n"
      + "Final takeaway: " + "practice".repeat(40);
    const responsiveNote = "Practice guard retention and smooth transitions. Keep elbows close, recover inside position, and focus on calm breathing during each round.";
    const activities = [longNote, "Good session", responsiveNote].map((note, index) => ({
      id: index + 1, activityId: index + 1, activityName: ["Jujitsu", "Walking", "Drills"][index],
      date: "2026-10-31", startedAt: "2026-10-31T10:00:00+01:00", endedAt: "2026-10-31T11:00:00+01:00",
      durationSeconds: 3600, note, createdAt: "",
    }));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/config") return route.fulfill({ json: { today: "2026-10-31", timezone: "Europe/Warsaw", version: "1.0.0" } });
      if (path.startsWith("/api/days/")) return route.fulfill({ json: { date: path.split("/").at(-1), sections: [], activities } });
      return route.fulfill({ json: [] });
    });
    await page.goto("/");
    const note = page.getByRole("region", { name: "Activity note for Jujitsu" });
    const body = note.locator(".activity-note-body");
    const toggle = note.getByRole("button", { name: "Show more" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect.poll(() => body.evaluate((element) => Math.round(element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight)))).toBe(3);
    expect(await body.textContent()).toBe(longNote);
    const shortNote = page.getByRole("region", { name: "Activity note for Walking" });
    await expect(shortNote.getByText("Good session")).toBeVisible();
    await expect(shortNote.getByRole("button", { name: /Show/ })).toHaveCount(0);

    if (width === 390) await body.tap();
    else await body.click();
    await expect(note.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
    expect(await body.textContent()).toBe(longNote);
    expect(await body.evaluate((element) => element.clientHeight >= element.scrollHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await note.getByRole("button", { name: "Show less" }).focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Space");
    await expect(note.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");

    await note.getByRole("button", { name: "Edit activity note" }).click();
    await expect(page.getByRole("textbox", { name: "Activity note" })).toHaveValue(longNote);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(note.getByRole("button", { name: "Show less" })).toBeVisible();

    const responsive = page.getByRole("region", { name: "Activity note for Drills" });
    await page.setViewportSize({ width: 390, height: 850 });
    await expect(responsive.getByRole("button", { name: "Show more" })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 850 });
    await expect(responsive.getByRole("button", { name: "Show more" })).toHaveCount(0);
    await page.setViewportSize({ width, height: 850 });
    await page.screenshot({ path: `/tmp/rostam-activity-note-${width}.png`, fullPage: true });
    await page.reload();
    await expect(note.getByRole("button", { name: "Show more" })).toHaveAttribute("aria-expanded", "false");
  });
}
