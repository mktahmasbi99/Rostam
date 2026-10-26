import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { NotesPage } from "./NotesPage";

vi.mock("../lib/api", () => ({ api: { dailyNotes: vi.fn(), activityNotes: vi.fn(), activityNoteGroups: vi.fn(), updateActivityNote: vi.fn(), updateDailyNote: vi.fn(), deleteDailyNote: vi.fn() } }));
const daily = (date: string, body: string) => ({ date, body, createdAt: "", updatedAt: "" });
const session = (id: number, activityId: number, activityName: string, note: string) => ({ id, activityId, activityName, date: "2026-10-25", startedAt: "2026-10-25T10:00:00Z", endedAt: null, durationSeconds: null, note, createdAt: "" });
const dailyPage = { items: [daily("2026-10-25", "Today")], nextBeforeDate: "2026-10-24" };
const activityPage = { items: [session(1, 1, "Drills", "Practice")], nextBeforeStartedAt: "2026-10-24T10:00:00Z", nextBeforeId: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.dailyNotes).mockResolvedValue(dailyPage);
  vi.mocked(api.activityNotes).mockResolvedValue(activityPage);
  vi.mocked(api.activityNoteGroups).mockResolvedValue([{ activityId: 1, activityName: "Drills", noteCount: 1, latestStartedAt: "2026-10-25T10:00:00Z" }]);
  vi.mocked(api.updateDailyNote).mockResolvedValue({ date: "2026-10-25", dailyNote: "" });
  vi.mocked(api.updateActivityNote).mockResolvedValue(session(1, 1, "Drills", ""));
  vi.mocked(api.deleteDailyNote).mockResolvedValue(undefined);
});

describe("NotesPage", () => {
  it("shows a five-note preview and opens a paged daily history from its collection", async () => {
    const user = userEvent.setup();
    vi.mocked(api.dailyNotes).mockResolvedValue({ items: Array.from({ length: 5 }, (_, i) => daily("2026-10-2" + (5 - i), "Note " + i)), nextBeforeDate: "2026-10-20" });
    render(<NotesPage />);
    expect(await screen.findByText("Note 0")).toBeInTheDocument();
    expect(api.dailyNotes).toHaveBeenCalledWith({ limit: 5 });
    expect(screen.getByRole("button", { name: "View all daily notes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View all daily notes" }));
    expect(await screen.findByRole("heading", { name: "Daily notes" })).toBeInTheDocument();
    vi.mocked(api.dailyNotes).mockResolvedValueOnce({ items: [daily("2026-10-19", "Older note")], nextBeforeDate: null });
    await user.click(screen.getByRole("button", { name: "Load older notes" }));
    expect(await screen.findByText("Older note")).toBeInTheDocument();
    expect(api.dailyNotes).toHaveBeenLastCalledWith({ beforeDate: "2026-10-20", limit: 30 });
  });

  it("groups activity notes, opens a note, and saves edits", async () => {
    const user = userEvent.setup(); render(<NotesPage />);
    await user.click(await screen.findByRole("button", { name: /Drills/ }));
    expect(api.activityNotes).toHaveBeenLastCalledWith({ activityId: 1, limit: 30 });
    await user.click(await screen.findByRole("button", { name: /Practice/ }));
    expect(await screen.findByRole("heading", { name: "Drills" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "Updated practice" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateActivityNote).toHaveBeenCalledWith(1, "Updated practice"));
    expect(await screen.findByText("Updated practice")).toBeInTheDocument();
  });

  it("restores a cancelled daily-note draft and removes the note when empty text is saved", async () => {
    const user = userEvent.setup(); render(<NotesPage />);
    await user.click(await screen.findByRole("button", { name: /Today/ }));
    await user.click(screen.getByRole("button", { name: "Edit note" }));
    await user.type(screen.getByRole("textbox", { name: "Note" }), " changed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Today")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit note" }));
    await user.clear(screen.getByRole("textbox", { name: "Note" }));
    vi.mocked(api.dailyNotes).mockResolvedValueOnce({ items: [], nextBeforeDate: null });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.updateDailyNote).toHaveBeenCalledWith("2026-10-25", ""));
    expect(await screen.findByText("No daily notes yet.")).toBeInTheDocument();
  });

  it("confirms deletion and keeps an emptied activity history visible", async () => {
    const user = userEvent.setup(); render(<NotesPage />);
    await user.click(await screen.findByRole("button", { name: /Drills/ }));
    await user.click(await screen.findByRole("button", { name: /Practice/ }));
    await user.click(screen.getByRole("button", { name: "Note options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByRole("dialog", { name: "Delete note?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Practice")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Note options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete note" }));
    await waitFor(() => expect(api.updateActivityNote).toHaveBeenCalledWith(1, ""));
    expect(await screen.findByText("No activity notes yet.")).toBeInTheDocument();
  });
});
