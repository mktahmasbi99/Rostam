import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";
import { ExercisePicker } from "./ExercisePicker";

vi.mock("../lib/api", () => ({
  api: {
    rotations: vi.fn(),
    skipRotation: vi.fn(),
    undoRotationSkip: vi.fn(),
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
  primaryMuscle: "chest",
};

beforeEach(() => {
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  vi.mocked(api.rotations).mockResolvedValue([]);
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
  it("opens the active rotation and marks its due exercise added today", async () => {
    vi.mocked(api.rotations).mockResolvedValue([{ id: 1, name: "Morning", active: true, dueExerciseId: exercise.id, resolvedToday: "completed", members: [{ exercise, lastDoneDate: "2026-09-17", daysSinceLastDone: 0 }] }]);
    render(<ExercisePicker day="2026-09-17" today="2026-09-17" presentIds={[exercise.id]} onChoose={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Rotation" })).toHaveClass("selected");
    expect(screen.getByText("Added today")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Push-ups/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Skip exercise" })).not.toBeInTheDocument();
  });

  it("keeps the library and its measurement filters as the default view", async () => {
    const user = userEvent.setup();
    render(<ExercisePicker day="2026-09-17" presentIds={[]} onChoose={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => expect(api.exercises).toHaveBeenCalledWith("active", "", "", expect.any(AbortSignal)));
    expect(api.exerciseRecommendations).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "All" })).toHaveClass("selected");

    await user.click(screen.getByRole("button", { name: "Timed reps" }));

    await waitFor(() => expect(api.exercises).toHaveBeenCalledWith("active", "", "timed_repetitions", expect.any(AbortSignal)));
  });

  it("disables exercises that are already on the selected day in the library", async () => {
    render(<ExercisePicker day="2026-09-17" presentIds={[exercise.id]} onChoose={vi.fn()} onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /Push-ups/ })).toBeDisabled();
    expect(screen.getByText("Already added")).toBeInTheDocument();
  });

  it("debounces search and ignores a response after its query has been replaced", async () => {
    const user = userEvent.setup();
    const deadlift = { ...exercise, id: 4, name: "Deadlift" };
    const squat = { ...exercise, id: 5, name: "Squat" };
    let resolveDeadlift!: (items: Exercise[]) => void;
    let resolveSquat!: (items: Exercise[]) => void;
    vi.mocked(api.exercises).mockImplementation((_status, query) => {
      if (query === "dead") return new Promise((resolve) => { resolveDeadlift = resolve; });
      if (query === "squat") return new Promise((resolve) => { resolveSquat = resolve; });
      return Promise.resolve([exercise]);
    });
    render(<ExercisePicker day="2026-09-17" presentIds={[]} onChoose={vi.fn()} onClose={vi.fn()} />);
    const input = await screen.findByRole("searchbox", { name: "Search exercises" });
    await user.type(input, "dead");
    await waitFor(() => expect(api.exercises).toHaveBeenCalledWith("active", "dead", "", expect.any(AbortSignal)));
    const obsoleteSignal = vi.mocked(api.exercises).mock.calls.find((call) => call[1] === "dead")?.[3];

    await user.clear(input);
    await user.type(input, "squat");
    await waitFor(() => expect(api.exercises).toHaveBeenCalledWith("active", "squat", "", expect.any(AbortSignal)));
    expect(obsoleteSignal?.aborted).toBe(true);
    await act(async () => { resolveDeadlift([deadlift]); });
    expect(screen.queryByRole("button", { name: /Deadlift/ })).not.toBeInTheDocument();
    await act(async () => { resolveSquat([squat]); });
    expect(await screen.findByRole("button", { name: /Squat/ })).toBeInTheDocument();
  });

  it("loads history-based recommendations only after the user requests them", async () => {
    const user = userEvent.setup();
    render(<ExercisePicker day="2026-09-17" presentIds={[]} onChoose={vi.fn()} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Show recommendations" }));

    expect(await screen.findByRole("heading", { name: "Recommendations" })).toBeInTheDocument();
    await waitFor(() => expect(api.exerciseRecommendations).toHaveBeenCalledWith("2026-09-17", { includePaused: false }));
    expect(screen.getByRole("button", { name: "Go to exercise library" })).toBeInTheDocument();
  });

  it("defaults to exercise ordering and groups only consecutive matching muscles", async () => {
    const user = userEvent.setup();
    const squats = { ...exercise, id: 1, name: "Squats", primaryMuscle: "quadriceps" };
    const sidePlank = { ...exercise, id: 4, name: "Side Plank Leg Lift", primaryMuscle: "abs" };
    const splitSquats = { ...exercise, id: 5, name: "Split Squats", primaryMuscle: "quadriceps" };
    vi.mocked(api.exerciseRecommendations).mockResolvedValueOnce({
      groups: [
        { muscle: "chest", muscleName: "Chest", lastTrainedDate: "2026-09-11", daysSinceLastTrained: 6, exercises: [{ exercise, lastDoneDate: "2026-09-11", daysSinceLastDone: 6, paused: false }] },
        { muscle: "abs", muscleName: "Abs", lastTrainedDate: "2026-09-13", daysSinceLastTrained: 4, exercises: [{ exercise: sidePlank, lastDoneDate: "2026-09-13", daysSinceLastDone: 4, paused: false }] },
        { muscle: "quadriceps", muscleName: "Quadriceps", lastTrainedDate: "2026-09-23", daysSinceLastTrained: 2, exercises: [{ exercise: splitSquats, lastDoneDate: "2026-09-23", daysSinceLastDone: 2, paused: false }, { exercise: squats, lastDoneDate: "2026-09-14", daysSinceLastDone: 11, paused: false }] },
      ],
      unclassified: [],
      neverTried: [],
      allExercises: [
        { exercise, lastDoneDate: "2026-09-11", daysSinceLastDone: 6, paused: false },
        { exercise: sidePlank, lastDoneDate: "2026-09-13", daysSinceLastDone: 4, paused: false },
        { exercise: splitSquats, lastDoneDate: "2026-09-23", daysSinceLastDone: 2, paused: false },
        { exercise: squats, lastDoneDate: "2026-09-14", daysSinceLastDone: 11, paused: false },
      ],
      muscleGroups: [{ slug: "chest", name: "Chest" }, { slug: "abs", name: "Abs" }, { slug: "quadriceps", name: "Quadriceps" }],
    });
    render(<ExercisePicker day="2026-09-25" presentIds={[]} onChoose={vi.fn()} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Show recommendations" }));
    expect(await screen.findByRole("button", { name: "By exercise" })).toHaveClass("selected");
    const results = [...document.querySelectorAll(".exercise-result")].map((result) => result.textContent);
    expect(results).toEqual(expect.arrayContaining([expect.stringContaining("Squats"), expect.stringContaining("Push-ups")]));
    expect(results.findIndex((result) => result?.includes("Squats"))).toBeLessThan(results.findIndex((result) => result?.includes("Push-ups")));
    expect(screen.getAllByRole("heading", { name: "Quadriceps" })).toHaveLength(2);

    const recommendationCalls = vi.mocked(api.exerciseRecommendations).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "By muscle" }));
    expect(screen.getByRole("button", { name: "By muscle" })).toHaveClass("selected");
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["ChestLast trained 6 days ago", "AbsLast trained 4 days ago", "QuadricepsLast trained 2 days ago"]);
    expect(api.exerciseRecommendations).toHaveBeenCalledTimes(recommendationCalls);
  });

  it("resets to exercise ordering when recommendations are reopened", async () => {
    const user = userEvent.setup();
    render(<ExercisePicker day="2026-09-17" presentIds={[]} onChoose={vi.fn()} onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Show recommendations" }));
    await user.click(screen.getByRole("button", { name: "By muscle" }));
    await user.click(screen.getByRole("button", { name: "Go to exercise library" }));
    await user.click(await screen.findByRole("button", { name: "Show recommendations" }));
    expect(screen.getByRole("button", { name: "By exercise" })).toHaveClass("selected");
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
