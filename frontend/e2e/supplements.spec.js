import { devices, expect, test } from "@playwright/test";
import { startLedgerFixture } from "./ledger-fixture.mjs";

let ledger;
test.use({ ...devices["iPhone 14 Pro"], browserName: "chromium", serviceWorkers: "block" });
test.beforeAll(async () => { ledger = await startLedgerFixture(4188); });
test.afterAll(async () => { await ledger?.close(); });

test("create, log, note, and review a supplement at iPhone size", async ({ page, request }) => {
  const { today } = await (await request.get(`${ledger.origin}/api/config`)).json();
  await page.goto(ledger.origin);
  await expect(page.getByRole("button", { name: "Supplement library", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add to day" }).click();
  await page.getByRole("menuitem", { name: "Supplement", exact: true }).click();
  await page.getByRole("button", { name: "Add supplement" }).click();
  const form = page.getByRole("dialog", { name: "New supplement" });
  await form.getByLabel("Name", { exact: true }).fill("Magnesium powder");
  await form.getByLabel("Brand").fill("Example");
  await expect(form.getByLabel("Form", { exact: true })).toHaveCount(0);
  await expect(form.getByLabel("Rating")).toHaveCount(0);
  const unit = form.getByLabel("Intake unit", { exact: true });
  const fields = form.locator("input");
  const fieldCount = await fields.count();
  await unit.selectOption({ label: "Other" });
  await expect(unit).toHaveValue("units");
  await expect(fields).toHaveCount(fieldCount);
  await unit.selectOption({ label: "Scoops" });
  await form.getByLabel("Amount per unit").fill("300");
  await form.getByLabel("Measurement unit").fill("mg");
  const target = form.getByLabel("Daily target (optional)", { exact: true });
  await expect(target).toHaveAttribute("placeholder", "Enter number of units");
  await target.fill("0.5");
  await form.getByRole("button", { name: "Save product" }).click();

  const library = page.getByRole("dialog", { name: "Supplement library" });
  await expect(library.getByRole("button", { name: /Magnesium powder/ })).toBeVisible();
  await library.getByRole("button", { name: "Close Supplement library" }).click();
  const cards = page.getByRole("region", { name: "Supplements" });
  await expect(cards.getByText("Due", { exact: true })).toBeVisible();
  await cards.getByRole("button", { name: "Log Magnesium powder intake" }).click();
  const intake = page.getByRole("dialog", { name: "Log Magnesium powder intake" });
  await expect(intake.getByRole("button", { name: "Time", exact: true })).toHaveText(/\d{2}:\d{2}/);
  await expect(intake.locator('input[type="datetime-local"], input[type="date"]')).toHaveCount(0);
  await intake.getByLabel("Quantity (scoops)").fill("0.5");
  await intake.getByRole("button", { name: "Save intake" }).click();
  await expect(cards.getByText("0.5 / 0.5 scoops")).toBeVisible();
  await expect(cards.getByText("Due", { exact: true })).toHaveCount(0);

  const emptyNote = cards.getByRole("button", { name: "Open Magnesium powder note", exact: true });
  await expect(emptyNote.locator("svg.lucide-file")).toBeVisible();
  await expect(emptyNote).not.toHaveClass(/journal-active/);
  await emptyNote.click();
  const note = page.getByRole("dialog", { name: "Magnesium powder note" });
  await note.getByLabel("Note", { exact: true }).fill("Mixed in water.");
  await note.getByRole("button", { name: "Save note" }).click();
  const savedNote = cards.getByRole("button", { name: "Open Magnesium powder note (saved)" });
  await expect(savedNote.locator("svg.lucide-file-text")).toBeVisible();
  await expect(savedNote).toHaveClass("journal-active");

  await cards.getByRole("article").click();
  const detail = page.getByRole("dialog", { name: "Magnesium powder", exact: true });
  await expect(detail.getByRole("region", { name: "Intake history" }).getByText("0.5 scoops · 150 mg").first()).toBeVisible();
  await expect(detail.getByRole("list", { name: "Recorded intake over 7 days" }).getByRole("listitem")).toHaveCount(7);
  await detail.getByRole("button", { name: "30 days" }).click();
  await expect(detail.getByRole("list", { name: "Recorded intake over 30 days" }).getByRole("listitem")).toHaveCount(30);
  await expect(detail.getByRole("listitem", { name: `${today}: 150 mg` })).toBeAttached();
  expect(await detail.locator(".modal-content").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await expect(detail.getByText("Rating · Unrated")).toBeVisible();
  await detail.getByRole("button", { name: "Edit rating" }).click();
  const rating = page.getByRole("dialog", { name: "Supplement rating" });
  await rating.getByRole("combobox", { name: "Rating", exact: true }).selectOption("4");
  await rating.getByRole("button", { name: "Save rating" }).click();
  await expect(detail.getByText("Rating · 4 / 5 stars")).toBeVisible();

  const notebookButton = detail.getByRole("button", { name: "Open supplement notebook" });
  await expect(notebookButton.locator("svg.lucide-notebook-pen")).toBeVisible();
  await notebookButton.click();
  const notebook = page.getByRole("dialog", { name: "Magnesium powder notebook" });
  await expect(notebook.getByText("Mixed in water.")).toBeVisible();
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  await notebook.getByLabel("Note date").fill(yesterday);
  await notebook.getByRole("button", { name: "Open note" }).click();
  await note.getByLabel("Note", { exact: true }).fill("Opened the package.");
  await note.getByRole("button", { name: "Save note" }).click();
  await expect(notebook.getByRole("article").first()).toContainText("Mixed in water.");
  await expect(notebook.getByRole("article").last()).toContainText("Opened the package.");
  await notebook.getByRole("button", { name: "Close Magnesium powder notebook" }).click();

  await detail.getByRole("button", { name: "Track stock" }).click();
  const stock = page.getByRole("dialog", { name: "Track stock" });
  await stock.getByLabel("Starting balance (scoops)").fill("0");
  await stock.getByRole("button", { name: "Save balance" }).click();
  await expect(detail.getByText("0 scoops remaining")).toBeVisible();
  await detail.getByRole("button", { name: "Log intake" }).click();
  await intake.getByLabel("Quantity (scoops)").fill("0.25");
  await intake.getByRole("button", { name: "Save intake" }).click();
  await expect(detail.getByText("-0.25 scoops remaining")).toBeVisible();
  await expect(detail.getByText("Negative balance. Reconcile stock.")).toBeVisible();

  await detail.getByRole("button", { name: "Close Magnesium powder", exact: true }).click();
  await savedNote.click();
  await note.getByRole("button", { name: "Delete note", exact: true }).click();
  const confirmDelete = page.getByRole("dialog", { name: "Delete note?", exact: true });
  await expect(confirmDelete).toBeVisible();
  await confirmDelete.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(note.getByRole("textbox", { name: "Note", exact: true })).toHaveValue("Mixed in water.");
  await note.getByRole("button", { name: "Delete note", exact: true }).click();
  await confirmDelete.getByRole("button", { name: "Delete note", exact: true }).click();
  await expect(note).toBeHidden();
  await expect(emptyNote.locator("svg.lucide-file")).toBeVisible();
});

test("the time wheel logs intake on the card's day and edits keep the original day", async ({ page, request }) => {
  const { today } = await (await request.get(`${ledger.origin}/api/config`)).json();
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const created = await request.post(`${ledger.origin}/api/supplements`, { data: {
    name: "Zinc", unit: "capsules", dailyTarget: "2", amountPerUnit: "20", amountUnit: "mg", startDate: yesterday,
  } });
  expect(created.ok()).toBe(true);
  await page.goto(ledger.origin);
  await page.getByRole("button", { name: "Previous day" }).click();
  await page.getByRole("button", { name: "Log Zinc intake" }).click();
  const intake = page.getByRole("dialog", { name: "Log Zinc intake" });
  await expect(intake.getByRole("button", { name: "Time", exact: true })).toHaveText("12:00");
  await setNextMinute(intake);
  await intake.getByRole("button", { name: "Save intake" }).click();
  await expect(page.getByText("1 / 2 capsules")).toBeVisible();

  await page.getByRole("button", { name: "Next day" }).click();
  await page.getByRole("article").filter({ hasText: "Zinc" }).click();
  await page.getByRole("button", { name: "Edit intake at 12:01" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Zinc intake" });
  await setNextMinute(edit);
  await edit.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("button", { name: "Edit intake at 12:02" })).toBeVisible();
  const past = await (await request.get(`${ledger.origin}/api/days/${yesterday}`)).json();
  const current = await (await request.get(`${ledger.origin}/api/days/${today}`)).json();
  expect(past.supplements.find((card) => card.name === "Zinc").quantity).toBe("1");
  expect(current.supplements.find((card) => card.name === "Zinc").quantity).toBe("0");
});

async function setNextMinute(dialog) {
  await dialog.getByRole("button", { name: "Time", exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "Minute" }).press("ArrowUp");
  await dialog.getByRole("button", { name: "Set time" }).click();
}
