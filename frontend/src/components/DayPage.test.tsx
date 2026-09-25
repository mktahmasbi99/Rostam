import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { DayData, Exercise } from "../lib/types";
import { DayPage } from "./DayPage";

vi.mock("../lib/api", () => ({
  api: {
    day: vi.fn(),
    exercises: vi.fn(),
    exerciseRecommendations: vi.fn(),
    config: vi.fn(),
    prefill: vi.fn(),
    updateExerciseNote: vi.fn(),
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
    vi.mocked(api.exerciseRecommendations).mockResolvedValue({
      groups: [{ muscle: "chest", muscleName: "Chest", lastTrainedDate: null, daysSinceLastTrained: null, exercises: [{ exercise, lastDoneDate: null, daysSinceLastDone: null, paused: false }] }],
      unclassified: [], neverTried: [], allExercises: [{ exercise, lastDoneDate: null, daysSinceLastDone: null, paused: false }], muscleGroups: [],
    });
    render(<DayPage day="2026-09-17" today="2026-09-17" onOpenCalendar={vi.fn()} onPreviousDay={vi.fn()} onNextDay={vi.fn()} />);

    await user.click((await screen.findAllByRole("button", { name: "Add exercise" }))[0]);
    await user.click(await screen.findByRole("button", { name: /Push-ups/ }));

    expect(screen.getByRole("button", { name: "Add exercise note" })).toBeInTheDocument();
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
    expect(await screen.findByText("No sets recorded")).toBeInTheDocument();

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
    expect(await screen.findByText("No sets recorded")).toBeInTheDocument();

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
