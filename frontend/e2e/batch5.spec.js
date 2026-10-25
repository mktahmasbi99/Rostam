import { expect, test } from "@playwright/test";

const day = "2026-10-25";
const oldDay = "2026-10-24";
const measurement = (id, date, weightKg = null, waistCm = null) => ({ id, date, measurementType: weightKg ? "weight" : "waist", weightKg, waistCm, createdAt: `${date}T10:00:00Z`, updatedAt: `${date}T10:00:00Z` });

async function installArchiveApi(page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/api/config") return route.fulfill({ json: { today: day, timezone: "Europe/Warsaw", version: "1.0.0" } });
    if (path === "/api/profile") return route.fulfill({ json: { heightCm: null, dateOfBirth: null, age: null } });
    if (path === "/api/notes") return route.fulfill({ json: url.searchParams.has("beforeDate") ? { items: [{ date: oldDay, body: "Older daily note", createdAt: "", updatedAt: "" }], nextBeforeDate: null } : { items: [{ date: day, body: "Recent daily note", createdAt: "", updatedAt: "" }], nextBeforeDate: oldDay } });
    if (path === "/api/activity-notes") return route.fulfill({ json: url.searchParams.has("beforeStartedAt") ? { items: [], nextBeforeStartedAt: null, nextBeforeId: null } : { items: [{ id: 1, activityId: 1, activityName: "Drills", date: day, startedAt: `${day}T10:00:00+02:00`, endedAt: null, durationSeconds: null, note: "Recent activity note", createdAt: "" }], nextBeforeStartedAt: `${oldDay}T10:00:00+02:00`, nextBeforeId: 2 } });
    if (path === "/api/photos") return route.fulfill({ json: url.searchParams.has("beforeDate") ? { items: [{ date: oldDay, photos: [] }], nextBeforeDate: null } : { items: [{ date: day, photos: [{ id: 5, date: day, displayOrder: 1, width: 1, height: 1, createdAt: "", thumbnailUrl: "/api/photos/5/thumbnail", url: "/api/photos/5" }] }], nextBeforeDate: oldDay } });
    if (path === "/api/photos/5/thumbnail") return route.fulfill({ status: 200, contentType: "image/jpeg", body: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/AI//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AI//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AI//2Q==", "base64") });
    if (path === "/api/body-measurements") return route.fulfill({ json: url.searchParams.has("beforeDate") ? { items: [measurement(2, oldDay, "81", null)], nextBeforeDate: null, nextBeforeId: null } : { items: [measurement(1, day, "80", null)], nextBeforeDate: oldDay, nextBeforeId: 2 } });
    if (path === "/api/body-measurements/trends") return route.fulfill({ json: { latest: { weight: { date: day, value: "80" }, waist: null }, trends: { weight: [{ date: oldDay, value: "81" }, { date: day, value: "80" }], waist: [] } } });
    return route.fulfill({ json: [] });
  });
}

test("archive pages load older photos, notes, and measurements only when requested", async ({ page }) => {
  await installArchiveApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByText("Recent daily note")).toBeVisible();
  await page.getByRole("button", { name: "Load older daily notes" }).click();
  await expect(page.getByText("Older daily note")).toBeVisible();
  await page.getByRole("button", { name: "Load older activity notes" }).click();
  await expect(page.getByText("Recent activity note")).toBeVisible();

  await page.getByRole("button", { name: "Photos" }).click();
  await expect(page.getByRole("img", { name: "Photo from 2026-10-25" })).toHaveAttribute("loading", "lazy");
  await page.getByRole("button", { name: "Load older photos" }).click();
  await expect(page.getByRole("button", { name: oldDay })).toBeVisible();

  await page.getByRole("button", { name: "Measurements" }).click();
  await expect(page.locator(".metric strong", { hasText: "80 kg" })).toBeVisible();
  await page.getByRole("button", { name: "Load older measurements" }).click();
  await expect(page.getByRole("button", { name: "Edit measurement from 2026-10-24" })).toBeVisible();
});
