import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";
import { ExercisePicker } from "./ExercisePicker";

vi.mock("../lib/api", () => ({
  api: {
    exercises: vi.fn(),
    exerciseRecommendations: vi.fn(),
    updateRecommendationPause: vi.fn(),
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
  hasHistory: true,
};

beforeEach(() => {
  vi.mocked(api.exercises).mockResolvedValue([exercise]);
  vi.mocked(api.exerciseRecommendations).mockResolvedValue({
    groups: [{ muscle: "chest", muscleName: "Chest", lastTrainedDate: "2026-09-01", daysSinceLastTrained: 16, exercises: [{ exercise, lastDoneDate: "2026-09-01", daysSinceLastDone: 16, paused: false }] }],
    unclassified: [],
    neverTried: [],
    allExercises: [{ exercise, lastDoneDate: "2026-09-01", daysSinceLastDone: 16, paused: false }],
    muscleGroups: [],
  });
});

describe("ExercisePicker", () => {
  it("keeps the library and its measurement filters as the default view", async () => {
    const user = userEvent.setup();
    render(<ExercisePicker day="2026-09-17" presentIds={[]} onChoose={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(api.exercises).toHaveBeenCalledWith("active", "", ""));
    expect(api.exerciseRecommendations).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "All" })).toHaveClass("selected");

    await user.click(screen.getByRole("button", { name: "Timed repetitions" }));

    await waitFor(() => expect(api.exercises).toHaveBeenCalledWith("active", "", "timed_repetitions"));
  });

  it("loads history-based recommendations only after the user requests them", async () => {
    const user = userEvent.setup();
    render(<ExercisePicker day="2026-09-17" presentIds={[]} onChoose={vi.fn()} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Show recommendations" }));

    expect(await screen.findByRole("heading", { name: "Recommendations" })).toBeInTheDocument();
    await waitFor(() => expect(api.exerciseRecommendations).toHaveBeenCalledWith("2026-09-17", { includePaused: false }));
    expect(screen.getByRole("button", { name: "Back to exercise library" })).toBeInTheDocument();
  });

  it("dismisses a pause menu without selecting the exercise underneath", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<ExercisePicker day="2026-09-17" presentIds={[]} onChoose={onChoose} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Show recommendations" }));
    const pauseButton = await screen.findByLabelText("Pause recommendations for Push-ups");
    await user.click(pauseButton);
    expect(pauseButton.closest("details")).toHaveAttribute("open");

    await user.click(screen.getByRole("button", { name: /^Push-ups/ }));

    expect(pauseButton.closest("details")).not.toHaveAttribute("open");
    expect(onChoose).not.toHaveBeenCalled();
  });
});
