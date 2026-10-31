import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DailyJournal } from "./DailyJournal";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: { dayPhotos: vi.fn(), updateDailyNote: vi.fn(), uploadPhotos: vi.fn(), deletePhoto: vi.fn(), deleteDailyNote: vi.fn() } }));

describe("DailyJournal", () => {
  it("rejects a selection that exceeds the remaining daily photo count before uploading", async () => {
    const user = userEvent.setup();
    vi.mocked(api.dayPhotos).mockResolvedValue([]);
    render(<DailyJournal day="2026-10-25" today="2026-10-25" note={null} photoCount={9} onChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Open daily photos" }));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    await user.upload(input!, [new File(["one"], "one.png", { type: "image/png" }), new File(["two"], "two.png", { type: "image/png" })]);

    expect(await screen.findByRole("alert")).toHaveTextContent("Choose no more than 1 more photo");
    expect(api.uploadPhotos).not.toHaveBeenCalled();
  });

  it("keeps an edited note draft when a late refresh changes the server note", async () => {
    const user = userEvent.setup();
    const props = { day: "2026-10-25", today: "2026-10-25", note: "Original note", photoCount: 0, onChanged: vi.fn(), initialMode: "note" as const };
    const view = render(<DailyJournal {...props} />);
    const textarea = screen.getByRole("textbox", { name: "Note" });
    await user.clear(textarea);
    await user.type(textarea, "My unsaved draft");

    view.rerender(<DailyJournal {...props} note="A newer server note" />);

    expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("My unsaved draft");
  });
});


it("keeps the photo dialog open until an upload finishes", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  let finish!: () => void;
  vi.mocked(api.dayPhotos).mockResolvedValue([]);
  vi.mocked(api.uploadPhotos).mockImplementation(() => new Promise((resolve) => { finish = () => resolve([]); }));
  render(<DailyJournal day="2026-10-31" today="2026-10-31" note={null} photoCount={0} onChanged={vi.fn()} initialMode="photos" hideActions onClose={onClose} />);
  await user.upload(document.querySelector<HTMLInputElement>('input[type="file"]')!, new File(["photo"], "today.png", { type: "image/png" }));
  await user.click(screen.getByRole("button", { name: "Close Daily photos" }));
  expect(screen.getByRole("dialog", { name: "Daily photos" })).toBeInTheDocument();
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => { finish(); });
  await waitFor(() => expect(screen.getByRole("button", { name: "Add photos" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Close Daily photos" }));
  expect(onClose).toHaveBeenCalledOnce();
});
