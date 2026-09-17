import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";
import { ExerciseNote } from "./ExerciseNote";

vi.mock("../lib/api", () => ({
  api: { updateExerciseNote: vi.fn() },
}));

const exercise: Exercise = {
  id: 7,
  name: "Push-ups",
  baseName: "Push-ups",
  measurementType: "repetitions",
  equipment: null,
  customEquipment: null,
  allowBodyweight: true,
  defaultWeightKg: null,
  imageKey: "push-up",
  exerciseNote: null,
  archivedAt: null,
  hasHistory: true,
};

describe("ExerciseNote", () => {
  beforeEach(() => vi.resetAllMocks());

  it("adds and clears an unrestricted multiline note inline", async () => {
    const user = userEvent.setup();
    const body = `Keep elbows forward.\nWatch https://example.com/technique`;
    vi.mocked(api.updateExerciseNote)
      .mockResolvedValueOnce({ ...exercise, exerciseNote: body })
      .mockResolvedValueOnce({ ...exercise, exerciseNote: null });
    render(<ExerciseNote exercise={exercise} />);

    await user.click(screen.getByRole("button", { name: "Add exercise note" }));
    const editor = screen.getByLabelText("Exercise note");
    expect(editor).not.toHaveAttribute("maxlength");
    await user.type(editor, body);
    await user.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() => expect(api.updateExerciseNote).toHaveBeenCalledWith(exercise.id, body));
    expect(screen.getByText("Keep elbows forward.", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://example.com/technique" })).toHaveAttribute("target", "_blank");

    await user.click(screen.getByRole("button", { name: `Edit exercise note for ${exercise.name}` }));
    await user.clear(screen.getByLabelText("Exercise note"));
    await user.type(screen.getByLabelText("Exercise note"), "   ");
    await user.click(screen.getByRole("button", { name: "Save note" }));
    expect(await screen.findByRole("button", { name: "Add exercise note" })).toBeInTheDocument();
  });

  it("keeps trailing punctuation outside links and cancels drafts", async () => {
    const user = userEvent.setup();
    render(<ExerciseNote exercise={{ ...exercise, exerciseNote: "See https://example.com/demo).\nThen brace." }} />);

    expect(screen.getByRole("link", { name: "https://example.com/demo" })).toHaveAttribute("href", "https://example.com/demo");
    await user.click(screen.getByRole("button", { name: `Edit exercise note for ${exercise.name}` }));
    await user.clear(screen.getByLabelText("Exercise note"));
    await user.type(screen.getByLabelText("Exercise note"), "Unsaved");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Then brace.", { exact: false })).toBeInTheDocument();
    expect(api.updateExerciseNote).not.toHaveBeenCalled();
  });

  it("keeps the editor open and reports save failures", async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateExerciseNote).mockRejectedValue(new Error("Network unavailable"));
    render(<ExerciseNote exercise={exercise} />);

    await user.click(screen.getByRole("button", { name: "Add exercise note" }));
    await user.type(screen.getByLabelText("Exercise note"), "Try again");
    await user.click(screen.getByRole("button", { name: "Save note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Network unavailable");
    expect(screen.getByLabelText("Exercise note")).toHaveValue("Try again");
  });

  it("refreshes its display when a newly loaded day supplies the current note", () => {
    const { rerender } = render(<ExerciseNote exercise={exercise} />);
    expect(screen.getByRole("button", { name: "Add exercise note" })).toBeInTheDocument();

    rerender(<ExerciseNote exercise={{ ...exercise, exerciseNote: "Current global cue" }} />);

    expect(screen.getByText("Current global cue")).toBeInTheDocument();
  });
});
