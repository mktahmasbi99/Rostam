import { devices, expect, test } from "@playwright/test";
import { startLedgerFixture } from "./ledger-fixture.mjs";

let ledger;
test.use({ ...devices["iPhone 14 Pro"], browserName: "chromium", serviceWorkers: "block" });
test.beforeAll(async () => { ledger = await startLedgerFixture(4188); });
test.afterAll(async () => { await ledger?.close(); });

test("create, log, note, and review a supplement at iPhone size", async ({ page, request }) => {
  const { today } = await (await request.get(`${ledger.origin}/api/config`)).json();
  await page.goto(ledger.origin);
  await page.getByRole("button", { name: "Supplement library" }).click();
  await page.getByRole("button", { name: "Add supplement" }).click();
  const form = page.getByRole("dialog", { name: "New supplement" });
  await form.getByLabel("Name", { exact: true }).fill("Magnesium powder");
  await form.getByLabel("Brand").fill("Example");
  await form.getByLabel("Form").fill("Powder");
  await form.getByLabel("Intake unit", { exact: true }).fill("scoops");
  await form.getByLabel("Amount per unit").fill("300");
  await form.getByLabel("Measurement unit").fill("mg");
  await form.getByLabel("Daily target").fill("0.5");
  await form.getByLabel("Rating").selectOption("4");
  await form.getByRole("button", { name: "Save product" }).click();

  const library = page.getByRole("dialog", { name: "Supplement library" });
  await expect(library.getByRole("button", { name: /Magnesium powder.*4 \/ 5/ })).toBeVisible();
  await library.getByRole("button", { name: "Close Supplement library" }).click();
  const cards = page.getByRole("region", { name: "Supplements" });
  await expect(cards.getByText("Due", { exact: true })).toBeVisible();
  await cards.getByRole("button", { name: "Log Magnesium powder intake" }).click();
  const intake = page.getByRole("dialog", { name: "Log Magnesium powder intake" });
  await expect(intake.getByLabel("Date and time")).toHaveValue(new RegExp(`^${today}T`));
  await intake.getByLabel("Quantity (scoops)").fill("0.5");
  await intake.getByRole("button", { name: "Save intake" }).click();
  await expect(cards.getByText("0.5 / 0.5 scoops")).toBeVisible();
  await expect(cards.getByText("Due", { exact: true })).toHaveCount(0);

  await cards.getByRole("button", { name: "Open Magnesium powder note", exact: true }).click();
  const note = page.getByRole("dialog", { name: "Magnesium powder note" });
  await note.getByLabel("Note", { exact: true }).fill("Mixed in water.");
  await note.getByRole("button", { name: "Save note" }).click();
  await expect(cards.getByRole("button", { name: "Open Magnesium powder note (saved)" })).toHaveClass("journal-active");

  await cards.getByRole("button", { name: "View Magnesium powder details" }).click();
  const detail = page.getByRole("dialog", { name: "Magnesium powder", exact: true });
  await expect(detail.getByRole("region", { name: "Intake history" }).getByText("0.5 scoops · 150 mg").first()).toBeVisible();
  await expect(detail.getByRole("list", { name: "Recorded intake over 7 days" }).getByRole("listitem")).toHaveCount(7);
  await detail.getByRole("button", { name: "30 days" }).click();
  await expect(detail.getByRole("list", { name: "Recorded intake over 30 days" }).getByRole("listitem")).toHaveCount(30);
  await expect(detail.getByRole("listitem", { name: `${today}: 150 mg` })).toBeAttached();
  expect(await detail.locator(".modal-content").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await detail.getByRole("button", { name: "Open supplement notebook" }).click();
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
});
