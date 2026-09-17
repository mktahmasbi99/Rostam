import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ExerciseEditor } from "./ExerciseEditor";

vi.mock("../lib/api", () => ({
  api: {
    createExercise: vi.fn(),
    updateExercise: vi.fn(),
  },
}));

describe("ExerciseEditor", () => {
  it("previews a generated title and sends immutable creation features", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    vi.mocked(api.createExercise).mockResolvedValue({
      id: 20,
      name: "Squats (Resistance Bands)",
      baseName: "Squats",
      measurementType: "repetitions",
      equipment: "resistance_band",
      customEquipment: null,
      allowBodyweight: false,
      defaultWeightKg: "15",
      imageKey: null,
      exerciseNote: null,
      archivedAt: null,
      hasHistory: false,
    });
    render(<ExerciseEditor onSaved={onSaved} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("Exercise name"), "Squats");
    await user.click(screen.getByRole("button", { name: "Equipment" }));
    await user.selectOptions(screen.getByLabelText("Equipment"), "resistance_band");
    expect(screen.getByText("Squats (Resistance Bands)")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Allow bodyweight sets"));
    await user.type(screen.getByLabelText(/Default kg/), "15");
    await user.click(screen.getByRole("button", { name: "Save exercise" }));

    await waitFor(() => expect(api.createExercise).toHaveBeenCalledWith({
      baseName: "Squats",
      measurementType: "repetitions",
      equipment: "resistance_band",
      customEquipment: null,
      allowBodyweight: false,
      defaultWeightKg: "15",
      imageKey: null,
    }));
    expect(screen.queryByLabelText("Exercise note")).not.toBeInTheDocument();
  });

  it("locks measurement, equipment, and bodyweight eligibility while editing", () => {
    render(<ExerciseEditor exercise={{
      id: 20,
      name: "Squats (Resistance Bands)",
      baseName: "Squats",
      measurementType: "repetitions",
      equipment: "resistance_band",
      customEquipment: null,
      allowBodyweight: true,
      defaultWeightKg: "15",
      imageKey: null,
      exerciseNote: "Keep elbows forward.",
      archivedAt: null,
      hasHistory: true,
    }} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Repetitions" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Equipment" })).toBeDisabled();
    expect(screen.getByLabelText("Allow bodyweight sets")).toBeDisabled();
    expect(screen.getByLabelText(/Default kg/)).toBeEnabled();
    expect(screen.queryByLabelText("Exercise note")).not.toBeInTheDocument();
  });
});
