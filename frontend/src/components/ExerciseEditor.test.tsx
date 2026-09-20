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
      name: "Lateral raises (Resistance tubes)",
      baseName: "Lateral raises",
      measurementType: "repetitions",
      equipment: "resistance_tube",
      customEquipment: null,
      allowBodyweight: false,
      imageKey: null,
      exerciseNote: null,
      archivedAt: null,
      hasHistory: false,
    });
    render(<ExerciseEditor onSaved={onSaved} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("Exercise name"), "Lateral raises");
    await user.click(screen.getByRole("button", { name: "Equipment" }));
    await user.selectOptions(screen.getByLabelText("Equipment"), "resistance_tube");
    expect(screen.getByText("Lateral raises (Resistance tubes)")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Allow bodyweight sets"));
    expect(screen.queryByLabelText(/Default kg/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save exercise" }));

    await waitFor(() => expect(api.createExercise).toHaveBeenCalledWith({
      baseName: "Lateral raises",
      measurementType: "repetitions",
      equipment: "resistance_tube",
      customEquipment: null,
      allowBodyweight: false,
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
      imageKey: null,
      exerciseNote: "Keep elbows forward.",
      archivedAt: null,
      hasHistory: true,
    }} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Repetitions" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Equipment" })).toBeDisabled();
    expect(screen.getByLabelText("Allow bodyweight sets")).toBeDisabled();
    expect(screen.queryByLabelText(/Default kg/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Exercise note")).not.toBeInTheDocument();
  });
});
