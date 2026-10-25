import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import { ExerciseEditor } from "./ExerciseEditor";

vi.mock("../lib/api", () => ({
  api: {
    createExercise: vi.fn(),
    updateExercise: vi.fn(),
    uploadExerciseImage: vi.fn(),
  },
}));

describe("ExerciseEditor", () => {
  it("rejects an oversized exercise image before uploading it", async () => {
    const user = userEvent.setup();
    render(<ExerciseEditor onSaved={vi.fn()} onCancel={vi.fn()} />);
    await user.click(screen.getByText("No picture"));
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(["x"], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 50 * 1024 * 1024 + 1 });

    await user.upload(input!, file);

    expect(await screen.findByRole("alert")).toHaveTextContent("50 MiB or smaller");
    expect(api.uploadExerciseImage).not.toHaveBeenCalled();
  });

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
      primaryMuscle: null,
      secondaryMuscles: [],
      exerciseNote: null,
      archivedAt: null,
      hasHistory: false,
    });
    render(<ExerciseEditor onSaved={onSaved} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText("Exercise name"), "Lateral raises");
    await user.selectOptions(screen.getByLabelText("Fixed equipment"), "resistance_tube");
    expect(screen.getByText("Lateral raises (Resistance tubes)")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Bodyweight sets allowed" }));
    expect(screen.queryByLabelText(/Default kg/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save exercise" }));

    await waitFor(() => expect(api.createExercise).toHaveBeenCalledWith({
      baseName: "Lateral raises",
      measurementType: "repetitions",
      equipment: "resistance_tube",
      customEquipment: null,
      allowBodyweight: false,
      imageKey: null,
      primaryMuscle: null,
      secondaryMuscles: [],
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

    expect(screen.getByText("Reps")).toBeInTheDocument();
    expect(screen.getByText("Resistance Bands")).toBeInTheDocument();
    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Default kg/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Exercise note")).not.toBeInTheDocument();
  });
});
