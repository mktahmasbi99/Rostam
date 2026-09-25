import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ExercisesPage } from "./ExercisesPage";

vi.mock("../lib/api", () => ({
  api: {
    exercises: vi.fn(),
    archiveExercise: vi.fn(),
    deleteExercise: vi.fn(),
    restoreExercise: vi.fn(),
  },
}));

beforeEach(() => {
  vi.mocked(api.exercises).mockResolvedValue([]);
});

describe("ExercisesPage", () => {
  it("filters both active and archived exercises by measurement type", async () => {
    const user = userEvent.setup();
    render(<ExercisesPage />);

    await waitFor(() => expect(api.exercises).toHaveBeenCalledWith("active", "", ""));
    expect(api.exercises).toHaveBeenCalledWith("archived", "", "");

    await user.click(screen.getByRole("button", { name: "Timed repetitions" }));

    await waitFor(() => expect(api.exercises).toHaveBeenCalledWith("active", "", "timed_repetitions"));
    expect(api.exercises).toHaveBeenCalledWith("archived", "", "timed_repetitions");
    expect(screen.getByRole("button", { name: "Timed repetitions" })).toHaveClass("selected");
  });

  it("searches both active and archived exercises", async () => {
    const user = userEvent.setup();
    render(<ExercisesPage />);

    await user.type(screen.getByPlaceholderText("Search exercises"), "deadlift");

    await waitFor(() => {
      expect(api.exercises).toHaveBeenCalledWith("active", "deadlift", "");
      expect(api.exercises).toHaveBeenCalledWith("archived", "deadlift", "");
    });
  });
});
