import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DailyJournal } from "./DailyJournal";

vi.mock("../lib/api", () => ({ api: { dayPhotos: vi.fn(), updateDailyNote: vi.fn(), uploadPhotos: vi.fn(), deletePhoto: vi.fn(), deleteDailyNote: vi.fn() } }));

describe("DailyJournal", () => {
  it("keeps an edited note draft when a late refresh changes the server note", async () => {
    const user = userEvent.setup();
    const props = { day: "2026-10-25", today: "2026-10-25", note: "Original note", photoCount: 0, onChanged: vi.fn(), openOnMount: true };
    const view = render(<DailyJournal {...props} />);
    const textarea = screen.getByRole("textbox", { name: "Note" });
    await user.clear(textarea);
    await user.type(textarea, "My unsaved draft");

    view.rerender(<DailyJournal {...props} note="A newer server note" />);

    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("My unsaved draft");
  });
});
