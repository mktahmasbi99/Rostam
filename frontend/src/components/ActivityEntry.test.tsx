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
    updateActivityDefinition: vi.fn(),
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

    render(<ActivityEntryCard entry={entry} timezone="Europe/Warsaw" onChanged={onChanged} />);
    await user.click(screen.getByRole("button", { name: "BJJ – No Gi options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete session" }));

    expect(screen.getByRole("heading", { name: "Delete BJJ – No Gi session?" })).toBeInTheDocument();
    expect(screen.getByText("Delete the BJJ – No Gi session from 2026-10-19? This cannot be undone.")).toBeInTheDocument();
    expect(api.deleteActivity).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete session" }));
    await waitFor(() => expect(api.deleteActivity).toHaveBeenCalledWith(entry.id));
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("keeps the activity session when delete confirmation is cancelled", async () => {
    const user = userEvent.setup();
    render(<ActivityEntryCard entry={entry} timezone="Europe/Warsaw" onChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "BJJ – No Gi options" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete session" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.deleteActivity).not.toHaveBeenCalled();
  });

  it("adds an activity note from the labeled note control", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(api.updateActivityNote).mockResolvedValue({ ...entry, note: "Arm drags" });

    render(<ActivityEntryCard entry={{ ...entry, note: "" }} timezone="Europe/Warsaw" onChanged={onChanged} />);
    await user.click(screen.getByRole("button", { name: "Add activity note" }));
    await user.type(screen.getByRole("textbox", { name: "Activity note" }), "Arm drags");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(api.updateActivityNote).toHaveBeenCalledWith(entry.id, "Arm drags"));
    expect(onChanged).toHaveBeenCalledOnce();
    expect(await screen.findByText("Arm drags")).toBeInTheDocument();
    expect(screen.getByText("Activity note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit activity note" })).toBeInTheDocument();
    expect(document.querySelectorAll(".activity-note svg")).toHaveLength(1);
  });

  it("edits a saved activity note from its pencil control", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateActivityNote).mockResolvedValue({ ...entry, note: "Arm drags" });
    render(<ActivityEntryCard entry={entry} timezone="Europe/Warsaw" onChanged={vi.fn()} />);

    await user.click(screen.getByText("Guard retention"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit activity note" }));
    const note = screen.getByRole("textbox", { name: "Activity note" });
    expect(note).toHaveValue("Guard retention");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.updateActivityNote).not.toHaveBeenCalled();
    expect(screen.getByText("Guard retention")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit activity note" }));
    const reopenedNote = screen.getByRole("textbox", { name: "Activity note" });
    expect(reopenedNote).toHaveValue("Guard retention");
    await user.clear(reopenedNote);
    await user.type(reopenedNote, "Arm drags");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(api.updateActivityNote).toHaveBeenCalledWith(entry.id, "Arm drags"));
  });

  it("keeps an empty activity note as an add control and retains failed drafts", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(api.updateActivityNote).mockResolvedValueOnce({ ...entry, note: "" }).mockRejectedValueOnce(new Error("Network unavailable"));
    render(<ActivityEntryCard entry={{ ...entry, note: "" }} timezone="Europe/Warsaw" onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: "Add activity note" }));
    await user.click(screen.getByRole("button", { name: "Save note" }));
    await waitFor(() => expect(api.updateActivityNote).toHaveBeenCalledWith(entry.id, ""));
    expect(await screen.findByRole("button", { name: "Add activity note" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add activity note" }));
    const note = screen.getByRole("textbox", { name: "Activity note" });
    await user.type(note, "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByRole("textbox", { name: "Activity note" })).toHaveValue("Keep this draft");
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("reviews and saves editable start and end times when stopping", async () => {
    const user = userEvent.setup();
    const activeEntry = { ...entry, startedAt: "2020-10-19T17:45:00+02:00", endedAt: null, durationSeconds: null };
    vi.mocked(api.finishActivity).mockResolvedValue(entry);

    render(<ActivityEntryCard entry={activeEntry} timezone="Europe/Warsaw" onChanged={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Stop BJJ – No Gi" }));

    expect(screen.getByRole("heading", { name: "Finish BJJ – No Gi" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Activity note")).not.toBeInTheDocument();
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

  it("opens the time editor from the displayed session time", async () => {
    const user = userEvent.setup();
    render(<ActivityEntryCard entry={entry} timezone="Europe/Warsaw" onChanged={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Edit time for BJJ – No Gi" }));

    expect(screen.getByRole("heading", { name: "Edit BJJ – No Gi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start time" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End time" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Activity note")).not.toBeInTheDocument();
  });

  it("renames the shared activity definition from the session actions menu", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    vi.mocked(api.updateActivityDefinition).mockResolvedValue({ id: entry.activityId, name: "Walking" });
    render(<ActivityEntryCard entry={entry} timezone="Europe/Warsaw" onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: "BJJ – No Gi options" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename activity" }));
    expect(screen.getByRole("heading", { name: "Rename activity" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Activity name" })).toHaveValue("BJJ – No Gi");
    await user.clear(screen.getByRole("textbox", { name: "Activity name" }));
    await user.type(screen.getByRole("textbox", { name: "Activity name" }), "Walking");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(api.updateActivityDefinition).toHaveBeenCalledWith(entry.activityId, "Walking"));
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
