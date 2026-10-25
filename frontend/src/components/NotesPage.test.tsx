import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { NotesPage } from "./NotesPage";

vi.mock("../lib/api", () => ({ api: { dailyNotes: vi.fn(), activityNotes: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.dailyNotes).mockResolvedValue({ items: [{ date: "2026-10-25", body: "Today", createdAt: "", updatedAt: "" }], nextBeforeDate: "2026-10-24" });
  vi.mocked(api.activityNotes).mockResolvedValue({ items: [{ id: 1, activityId: 1, activityName: "Drills", date: "2026-10-25", startedAt: "2026-10-25T10:00:00Z", endedAt: null, durationSeconds: null, note: "Practice", createdAt: "" }], nextBeforeStartedAt: "2026-10-24T10:00:00Z", nextBeforeId: 2 });
});

describe("NotesPage", () => {
  it("loads daily and activity notes with independent cursors", async () => {
    const user = userEvent.setup();
    render(<NotesPage today="2026-10-25" onChooseDay={vi.fn()} />);
    expect(await screen.findByText("Today")).toBeInTheDocument();

    vi.mocked(api.dailyNotes).mockResolvedValueOnce({ items: [{ date: "2026-10-24", body: "Yesterday", createdAt: "", updatedAt: "" }], nextBeforeDate: null });
    await user.click(screen.getByRole("button", { name: "Load older daily notes" }));
    expect(await screen.findByText("Yesterday")).toBeInTheDocument();
    expect(api.dailyNotes).toHaveBeenLastCalledWith({ beforeDate: "2026-10-24" });

    vi.mocked(api.activityNotes).mockResolvedValueOnce({ items: [], nextBeforeStartedAt: null, nextBeforeId: null });
    await user.click(screen.getByRole("button", { name: "Load older activity notes" }));
    expect(api.activityNotes).toHaveBeenLastCalledWith({ beforeStartedAt: "2026-10-24T10:00:00Z", beforeId: 2 });
  });
});
