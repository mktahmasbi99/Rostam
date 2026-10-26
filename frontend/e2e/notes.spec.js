import { expect, test } from "@playwright/test";

test("notes are grouped, readable, editable, and deletable on narrow and wide screens", async ({ page }) => {
  let activityNote = "Practice guard retention";
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/config") return route.fulfill({ json: { today: "2026-10-26", timezone: "Europe/Warsaw", version: "1.0.0" } });
    if (url.pathname === "/api/days/2026-10-26") return route.fulfill({ json: { date: "2026-10-26", sections: [], activities: [] } });
    if (url.pathname === "/api/notes") return route.fulfill({ json: { items: [{ date: "2026-10-25", body: "A daily reflection", createdAt: "", updatedAt: "" }], nextBeforeDate: null } });
    if (url.pathname === "/api/activity-note-groups") return route.fulfill({ json: activityNote ? [{ activityId: 1, activityName: "BJJ - Nogi", noteCount: 1, latestStartedAt: "2026-10-24T16:00:00Z" }] : [] });
    if (url.pathname === "/api/activity-notes") return route.fulfill({ json: { items: [{ id: 1, activityId: 1, activityName: "BJJ - Nogi", date: "2026-10-24", startedAt: "2026-10-24T16:00:00Z", endedAt: "2026-10-24T17:00:00Z", durationSeconds: 3600, note: activityNote, createdAt: "" }], nextBeforeStartedAt: null, nextBeforeId: null } });
    if (url.pathname === "/api/activity-entries/1/note" && route.request().method() === "PUT") {
      activityNote = (await route.request().postDataJSON()).note;
      return route.fulfill({ json: { id: 1, activityId: 1, activityName: "BJJ - Nogi", date: "2026-10-24", startedAt: "2026-10-24T16:00:00Z", endedAt: "2026-10-24T17:00:00Z", durationSeconds: 3600, note: activityNote, createdAt: "" } });
    }
    if (url.pathname === "/api/activities") return route.fulfill({ json: [] });
    return route.fulfill({ json: {} });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByRole("button", { name: /A daily reflection/ })).toBeVisible();
  await page.getByRole("button", { name: /BJJ - Nogi/ }).click();
  await page.getByRole("button", { name: /Practice guard retention/ }).click();
  await expect(page.getByRole("heading", { name: "BJJ - Nogi" })).toBeVisible();
  await expect(page.locator(".notes-reader time")).toContainText("2026");

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 850 });
    await page.emulateMedia({ colorScheme: width === 390 ? "light" : "dark" });
    await expect(page.getByRole("button", { name: "Edit note" })).toBeVisible();
  }
  await page.getByRole("button", { name: "Edit note" }).click();
  await page.getByRole("textbox", { name: "Note" }).fill("Updated after practice");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Practice guard retention")).toBeVisible();
  await page.getByRole("button", { name: "Edit note" }).click();
  await page.getByRole("textbox", { name: "Note" }).fill("Updated after practice");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Updated after practice")).toBeVisible();
  await page.getByRole("button", { name: "Note options" }).click();
  await page.getByRole("menuitem", { name: "Delete note" }).click();
  await expect(page.getByRole("dialog", { name: "Delete note?" })).toBeVisible();
  await page.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(page.getByText("No activity notes yet.")).toBeVisible();
});
