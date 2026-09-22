import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";
import { DayPage } from "./DayPage";

vi.mock("../lib/api", () => ({
  api: {
    day: vi.fn(),
    exercises: vi.fn(),
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
    vi.mocked(api.exercises).mockResolvedValue([exercise]);
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
});
