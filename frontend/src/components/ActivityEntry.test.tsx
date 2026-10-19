import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { ActivityEntry } from "../lib/types";
import { ActivityEntryCard } from "./ActivityEntry";

vi.mock("../lib/api", () => ({
  api: {
    deleteActivity: vi.fn(),
    finishActivity: vi.fn(),
    updateActivityNote: vi.fn(),
    updateActivity: vi.fn(),
  },
}));

const entry: ActivityEntry = {
  id: 12,
  activityId: 3,
  activityName: "BJJ – No Gi",
  date: "2026-10-19",
  startedAt: "2026-10-19T17:45:00+02:00",
  endedAt: "2026-10-19T18:45:00+02:00",
  durationSeconds: 3600,
  note: "Guard retention",
  createdAt: "2026-10-19T15:45:00+00:00",
};

describe("ActivityEntryCard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets the user delete only this session from its own menu", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(api.deleteActivity).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ActivityEntryCard entry={entry} timezone="Europe/Warsaw" onChanged={onChanged} />);
    await user.click(screen.getByRole("button", { name: "BJJ – No Gi options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete session" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "Delete the BJJ – No Gi session from 2026-10-19? This cannot be undone.",
    );
    await waitFor(() => expect(api.deleteActivity).toHaveBeenCalledWith(entry.id));
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("saves a session note from the note icon so it appears on the day card", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(api.updateActivityNote).mockResolvedValue({ ...entry, note: "Arm drags" });

    render(<ActivityEntryCard entry={{ ...entry, note: "" }} timezone="Europe/Warsaw" onChanged={onChanged} />);
    await user.click(screen.getByRole("button", { name: "Add note for BJJ – No Gi" }));
    await user.type(screen.getByRole("textbox", { name: "Session note" }), "Arm drags");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(api.updateActivityNote).toHaveBeenCalledWith(entry.id, "Arm drags"));
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("reviews and saves editable start and end times when stopping", async () => {
    const user = userEvent.setup();
    const activeEntry = { ...entry, startedAt: "2020-10-19T17:45:00+02:00", endedAt: null, durationSeconds: null };
    vi.mocked(api.finishActivity).mockResolvedValue(entry);

    render(<ActivityEntryCard entry={activeEntry} timezone="Europe/Warsaw" onChanged={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Stop BJJ – No Gi" }));

    expect(screen.getByRole("heading", { name: "Finish BJJ – No Gi" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Session note")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start time" })).toHaveTextContent("17:45");
    expect(screen.getByRole("button", { name: "End time" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start time" }));
    const startHour = screen.getByRole("spinbutton", { name: "Hour" });
    await user.click(startHour);
    await user.keyboard("{ArrowUp}");
    await user.click(screen.getByRole("button", { name: "Set time" }));
    await user.click(screen.getByRole("button", { name: "Save session" }));
    await waitFor(() => expect(api.finishActivity).toHaveBeenCalled());
    expect(api.finishActivity).toHaveBeenCalledWith(entry.id, "2026-10-19T18:45", expect.stringMatching(/^2026-10-19T\d{2}:\d{2}$/), entry.note);
  });

  it("leaves the activity running when stopping is cancelled", async () => {
    const user = userEvent.setup();
    const activeEntry = { ...entry, startedAt: "2020-10-19T17:45:00+02:00", endedAt: null, durationSeconds: null };
    render(<ActivityEntryCard entry={activeEntry} timezone="Europe/Warsaw" onChanged={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Stop BJJ – No Gi" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("heading", { name: "Finish BJJ – No Gi" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop BJJ – No Gi" })).toBeInTheDocument();
    expect(api.finishActivity).not.toHaveBeenCalled();
  });

  it("keeps the note out of the edit dialog", async () => {
    const user = userEvent.setup();
    render(<ActivityEntryCard entry={entry} timezone="Europe/Warsaw" onChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Edit BJJ – No Gi" }));

    expect(screen.getByRole("heading", { name: "Edit BJJ – No Gi" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Session note")).not.toBeInTheDocument();
  });
});
