import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";
import { ExercisesPage } from "./ExercisesPage";

vi.mock("../lib/api", () => ({
  api: {
    exercises: vi.fn(),
    archiveExercise: vi.fn(),
    deleteExercise: vi.fn(),
    restoreExercise: vi.fn(),
    updateExercise: vi.fn(),
  },
}));

beforeEach(() => {
  vi.mocked(api.exercises).mockResolvedValue([]);
});

const bandPullApart: Exercise = {
  id: 1, name: "Band pull-aparts", baseName: "Band pull-aparts", measurementType: "repetitions",
  equipment: "resistance_band", customEquipment: null, allowBodyweight: false, imageKey: null,
  exerciseNote: null, archivedAt: null, hasHistory: false, primaryMuscle: "back", secondaryMuscles: ["shoulders"],
};

describe("ExercisesPage", () => {
  it("filters both active and archived exercises by measurement type", async () => {
    const user = userEvent.setup();
    render(<ExercisesPage />);

    await waitFor(() => expect(api.exercises).toHaveBeenCalledWith("active", "", ""));
    expect(api.exercises).toHaveBeenCalledWith("archived", "", "");

    await user.click(screen.getByRole("button", { name: "Timed reps" }));

    await waitFor(() => expect(api.exercises).toHaveBeenCalledWith("active", "", "timed_repetitions"));
    expect(api.exercises).toHaveBeenCalledWith("archived", "", "timed_repetitions");
    expect(screen.getByRole("button", { name: "Timed reps" })).toHaveClass("selected");
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

  it("opens a read-only exercise view and edits from its pencil", async () => {
    vi.mocked(api.exercises).mockImplementation(async (status) => status === "active" ? [bandPullApart] : []);
    const user = userEvent.setup();
    render(<ExercisesPage />);
    await user.click(await screen.findByRole("button", { name: "View Band pull-aparts" }));
    const dialog = await screen.findByRole("dialog", { name: "Band pull-aparts" });
    expect(within(dialog).getByText("Back (Shoulders)")).toBeInTheDocument();
    expect(within(dialog).getByText("Resistance band")).toBeInTheDocument();
    expect(dialog.querySelector(".modal-header-actions button[aria-label='Edit Band pull-aparts']")).toBeInTheDocument();
    expect(dialog.querySelector(".modal-header-actions button[aria-label='Close Band pull-aparts']")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Edit Band pull-aparts" }));
    expect(await screen.findByRole("textbox", { name: "Exercise name" })).toHaveValue("Band pull-aparts");
  });

  it("keeps the library pencil as a direct edit shortcut", async () => {
    vi.mocked(api.exercises).mockImplementation(async (status) => status === "active" ? [bandPullApart] : []);
    const user = userEvent.setup();
    render(<ExercisesPage />);
    await user.click(await screen.findByRole("button", { name: "Edit Band pull-aparts" }));
    expect(await screen.findByRole("textbox", { name: "Exercise name" })).toHaveValue("Band pull-aparts");
  });

  it("shows cancel, save, archive, and delete controls in the edit header", async () => {
    vi.mocked(api.exercises).mockImplementation(async (status) => status === "active" ? [bandPullApart] : []);
    vi.mocked(api.updateExercise).mockResolvedValue(bandPullApart);
    const user = userEvent.setup();
    render(<ExercisesPage />);
    await user.click(await screen.findByRole("button", { name: "Edit Band pull-aparts" }));

    const dialog = await screen.findByRole("dialog", { name: "Edit Band pull-aparts" });
    expect(within(dialog).getByRole("button", { name: "Close Edit Band pull-aparts" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save exercise" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "More actions for Band pull-aparts" }));
    expect(within(dialog).getByRole("menuitem", { name: "Archive Band pull-aparts" })).toBeInTheDocument();
    expect(within(dialog).getByRole("menuitem", { name: "Delete Band pull-aparts permanently" })).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Save exercise" }));
    await waitFor(() => expect(api.updateExercise).toHaveBeenCalledWith(1, expect.objectContaining({ baseName: "Band pull-aparts" })));
  });

  it("archives an exercise from the edit header actions", async () => {
    vi.mocked(api.exercises).mockImplementation(async (status) => status === "active" ? [bandPullApart] : []);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<ExercisesPage />);
    await user.click(await screen.findByRole("button", { name: "Edit Band pull-aparts" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Band pull-aparts" });
    await user.click(within(dialog).getByRole("button", { name: "More actions for Band pull-aparts" }));
    await user.click(within(dialog).getByRole("menuitem", { name: "Archive Band pull-aparts" }));

    await waitFor(() => expect(api.archiveExercise).toHaveBeenCalledWith(1));
    expect(confirm).toHaveBeenCalledWith("Archive Band pull-aparts? Its history will remain available.");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Band pull-aparts" })).not.toBeInTheDocument());
    confirm.mockRestore();
  });
});
