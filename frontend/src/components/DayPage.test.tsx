import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { DayData, Exercise } from "../lib/types";
import { DayPage } from "./DayPage";

vi.mock("../lib/api", () => ({
  api: {
    rotations: vi.fn().mockResolvedValue([]),
    day: vi.fn(),
    exercises: vi.fn(),
    exerciseRecommendations: vi.fn(),
    config: vi.fn(),
    prefill: vi.fn(),
    updateExerciseNote: vi.fn(),
    deleteActivity: vi.fn(),
  },
}));

const exercise: Exercise = {
  id: 3,
  name: "Push-ups",
  baseName: "Push-ups",
  measurementType: "repetitions",
  equipment: null,
  customEquipment: null,
  allowBodyweight: true,
  imageKey: "push-up",
  exerciseNote: null,
  archivedAt: null,
  hasHistory: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("DayPage exercise notes", () => {
  it("renders separate session cards with their own delete menus and running controls", async () => {
    const user = userEvent.setup();
    vi.mocked(api.day).mockResolvedValue({
      date: "2026-09-17",
      sections: [],
      activities: [
        { id: 1, activityId: 4, activityName: "BJJ – No Gi", date: "2026-09-17", startedAt: "2026-09-17T17:45:00+02:00", endedAt: null, durationSeconds: null, note: "", createdAt: "2026-09-17T15:45:00Z" },
        { id: 2, activityId: 4, activityName: "BJJ – No Gi", date: "2026-09-17", startedAt: "2026-09-17T19:00:00+02:00", endedAt: "2026-09-17T20:00:00+02:00", durationSeconds: 3600, note: "Arm drags", createdAt: "2026-09-17T17:00:00Z" },
      ],
    });
    vi.mocked(api.deleteActivity).mockResolvedValue(undefined);
    render(<DayPage day="2026-09-17" today="2026-09-17" onOpenCalendar={vi.fn()} onPreviousDay={vi.fn()} onNextDay={vi.fn()} />);

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Stop BJJ – No Gi" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Edit time for BJJ – No Gi" })).toHaveLength(1);
    const optionsButtons = screen.getAllByRole("button", { name: "BJJ – No Gi options" });
    expect(optionsButtons).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Timed activity options" })).not.toBeInTheDocument();
    await user.click(optionsButtons[0]);
    const deleteAction = screen.getByRole("menuitem", { name: "Delete session" });
    expect(deleteAction).toHaveClass("activity-menu-item", "danger-text");
    await user.click(deleteAction);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete session" }));
    await waitFor(() => expect(api.deleteActivity).toHaveBeenCalledWith(1));
  });

  it("shows repeated timed activity entries with their notes on the selected day", async () => {
    vi.mocked(api.day).mockResolvedValue({
      date: "2026-09-17",
      sections: [],
      activities: [
        { id: 1, activityId: 4, activityName: "BJJ – No Gi", date: "2026-09-17", startedAt: "2026-09-17T17:45:00+02:00", endedAt: "2026-09-17T18:45:00+02:00", durationSeconds: 3600, note: "Guard retention", createdAt: "2026-09-17T15:45:00Z" },
        { id: 2, activityId: 4, activityName: "BJJ – No Gi", date: "2026-09-17", startedAt: "2026-09-17T19:00:00+02:00", endedAt: "2026-09-17T20:00:00+02:00", durationSeconds: 3600, note: "Arm drags", createdAt: "2026-09-17T17:00:00Z" },
      ],
    });
    render(<DayPage day="2026-09-17" today="2026-09-17" onOpenCalendar={vi.fn()} onPreviousDay={vi.fn()} onNextDay={vi.fn()} />);

    expect(await screen.findAllByText("BJJ – No Gi")).toHaveLength(2);
    expect(screen.getByText("Guard retention")).toBeInTheDocument();
    expect(screen.getByText("Arm drags")).toBeInTheDocument();
    expect(screen.getAllByText(/1h 0m/)).toHaveLength(2);
  });

  it("shows the note action on persisted exercise cards", async () => {
    vi.mocked(api.day).mockResolvedValue({
      date: "2026-09-17",
      sections: [{ exercise, displayOrder: 1, total: 10, sets: [] }],
    });
    render(<DayPage day="2026-09-17" today="2026-09-17" onOpenCalendar={vi.fn()} onPreviousDay={vi.fn()} onNextDay={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Add exercise note" })).toBeInTheDocument();
  });

  it("shows the note action on a pending exercise card", async () => {
    const user = userEvent.setup();
    vi.mocked(api.day).mockResolvedValue({ date: "2026-09-17", sections: [] });
    vi.mocked(api.exercises).mockResolvedValue([exercise]);
    render(<DayPage day="2026-09-17" today="2026-09-17" onOpenCalendar={vi.fn()} onPreviousDay={vi.fn()} onNextDay={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Add to day" }));
    await user.click(screen.getByRole("menuitem", { name: /Add exercise/ }));
    await user.click(await screen.findByRole("button", { name: /Push-ups/ }));

    expect(screen.getByRole("button", { name: "Add exercise note" })).toBeInTheDocument();
  });

  it("opens the add menu with keyboard navigation and restores focus on Escape", async () => {
    const user = userEvent.setup();
    vi.mocked(api.day).mockResolvedValue({ date: "2026-09-17", sections: [] });
    render(<DayPage day="2026-09-17" today="2026-09-17" onOpenCalendar={vi.fn()} onPreviousDay={vi.fn()} onNextDay={vi.fn()} />);

    const trigger = await screen.findByRole("button", { name: "Add to day" });
    await user.click(trigger);
    const exerciseItem = screen.getByRole("menuitem", { name: /Add exercise/ });
    const activityItem = screen.getByRole("menuitem", { name: /Add activity/ });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(activityItem).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(exerciseItem).toHaveFocus();
    await user.keyboard("{Home}");
    expect(activityItem).toHaveFocus();
    await user.keyboard("{End}");
    expect(exerciseItem).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("toggles the add menu and dismisses it after an outside click", async () => {
    const user = userEvent.setup();
    vi.mocked(api.day).mockResolvedValue({ date: "2026-09-17", sections: [] });
    render(<DayPage day="2026-09-17" today="2026-09-17" onOpenCalendar={vi.fn()} onPreviousDay={vi.fn()} onNextDay={vi.fn()} />);

    const trigger = await screen.findByRole("button", { name: "Add to day" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Choose a day" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the existing activity picker from the add menu", async () => {
    const user = userEvent.setup();
    vi.mocked(api.day).mockResolvedValue({ date: "2026-09-17", sections: [] });
    render(<DayPage day="2026-09-17" today="2026-09-17" onOpenCalendar={vi.fn()} onPreviousDay={vi.fn()} onNextDay={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Add to day" }));
    await user.click(screen.getByRole("menuitem", { name: /Add activity/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("shows timed repetition totals without collapsing varied holds", async () => {
    vi.mocked(api.day).mockResolvedValue({
      date: "2026-09-17",
      sections: [{
        exercise: { ...exercise, name: "Side Plank Leg Lift", measurementType: "timed_repetitions" },
        displayOrder: 1,
        total: 8,
        sets: [
          { id: 1, exerciseId: 3, date: "2026-09-17", occurredAt: "2026-09-17T08:00:00+00:00", time: "10:00", repetitions: 4, durationMinutes: null, durationSeconds: null, holdMinutes: 0, holdSeconds: 10, resistanceKind: "bodyweight", weightKg: null, equipment: null, customEquipment: null, createdAt: "2026-09-17T08:00:00+00:00" },
          { id: 2, exerciseId: 3, date: "2026-09-17", occurredAt: "2026-09-17T08:30:00+00:00", time: "10:30", repetitions: 4, durationMinutes: null, durationSeconds: null, holdMinutes: 0, holdSeconds: 15, resistanceKind: "bodyweight", weightKg: null, equipment: null, customEquipment: null, createdAt: "2026-09-17T08:30:00+00:00" },
        ],
      }],
    });
    render(<DayPage day="2026-09-17" today="2026-09-17" onOpenCalendar={vi.fn()} onPreviousDay={vi.fn()} onNextDay={vi.fn()} />);

    expect(await screen.findByText("8 reps · 10s, 15s holds")).toBeInTheDocument();
  });

  it("ignores a superseded day request after navigation", async () => {
    const first = deferred<DayData>();
    const second = deferred<DayData>();
    vi.mocked(api.day).mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const props = {
      today: "2026-09-17",
      onOpenCalendar: vi.fn(),
      onPreviousDay: vi.fn(),
      onNextDay: vi.fn(),
    };
    const { rerender } = render(<DayPage day="2026-09-16" {...props} />);
    await waitFor(() => expect(api.day).toHaveBeenCalledTimes(1));
    const firstSignal = vi.mocked(api.day).mock.calls[0][1];

    rerender(<DayPage day="2026-09-17" {...props} />);
    await waitFor(() => expect(api.day).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);

    await act(async () => {
      second.resolve({ date: "2026-09-17", sections: [] });
      await Promise.resolve();
    });
    expect(await screen.findByText("No activity recorded")).toBeInTheDocument();

    await act(async () => {
      first.reject(new Error("Older request failed"));
      await Promise.resolve();
    });
    expect(screen.queryByText("Older request failed")).not.toBeInTheDocument();
    expect(screen.queryByText("Push-ups")).not.toBeInTheDocument();
  });

  it("does not overwrite a newer day with an older response", async () => {
    const first = deferred<DayData>();
    const second = deferred<DayData>();
    vi.mocked(api.day).mockReset()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const props = {
      today: "2026-09-17",
      onOpenCalendar: vi.fn(),
      onPreviousDay: vi.fn(),
      onNextDay: vi.fn(),
    };
    const { rerender } = render(<DayPage day="2026-09-16" {...props} />);
    await waitFor(() => expect(api.day).toHaveBeenCalledTimes(1));
    rerender(<DayPage day="2026-09-17" {...props} />);
    await waitFor(() => expect(api.day).toHaveBeenCalledTimes(2));

    await act(async () => {
      second.resolve({ date: "2026-09-17", sections: [] });
      await Promise.resolve();
    });
    expect(await screen.findByText("No activity recorded")).toBeInTheDocument();

    await act(async () => {
      first.resolve({
        date: "2026-09-16",
        sections: [{ exercise, displayOrder: 1, total: 10, sets: [] }],
      });
      await Promise.resolve();
    });
    expect(screen.queryByText("Push-ups")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading sets…")).not.toBeInTheDocument();
  });
});
