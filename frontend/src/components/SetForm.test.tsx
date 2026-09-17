import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { api } from "../lib/api";
import type { Exercise } from "../lib/types";
import { SetForm } from "./SetForm";

vi.mock("../lib/api", () => ({
  api: {
    config: vi.fn(),
    prefill: vi.fn(),
    addSet: vi.fn(),
    updateSet: vi.fn(),
  },
}));

const exercise: Exercise = {
  id: 2,
  name: "Overhead Press (Resistance Bands)",
  baseName: "Overhead Press",
  measurementType: "repetitions",
  equipment: "resistance_band",
  customEquipment: null,
  allowBodyweight: true,
  defaultWeightKg: "40",
  imageKey: null,
  exerciseNote: null,
  archivedAt: null,
  hasHistory: true,
};

describe("SetForm", () => {
  it("uses fixed equipment without presenting an equipment picker", async () => {
    const user = userEvent.setup();
    vi.mocked(api.config).mockResolvedValue({ today: "2026-09-16", timezone: "Europe/Warsaw", version: "1" });
    vi.mocked(api.prefill).mockResolvedValue({
      source: "defaults",
      time: null,
      repetitions: 12,
      durationMinutes: null,
      durationSeconds: null,
      resistanceKind: "external",
      weightKg: "40",
    });
    vi.mocked(api.addSet).mockResolvedValue({});
    render(<SetForm exercise={exercise} day="2026-09-16" onSaved={vi.fn()} onCancel={vi.fn()} />);

    await screen.findByDisplayValue("12");
    expect(screen.queryByLabelText("Equipment")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BW" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save set" }));

    await waitFor(() => expect(api.addSet).toHaveBeenCalled());
    expect(vi.mocked(api.addSet).mock.calls[0][2]).not.toHaveProperty("equipment");
  });

  it("does not show bodyweight for an equipment-only exercise", () => {
    render(<SetForm
      exercise={{ ...exercise, allowBodyweight: false }}
      day="2026-09-16"
      existing={{
        id: 3,
        exerciseId: exercise.id,
        date: "2026-09-16",
        occurredAt: "2026-09-16T10:00:00+00:00",
        time: "12:00",
        repetitions: 10,
        durationMinutes: null,
        durationSeconds: null,
        resistanceKind: "external",
        weightKg: "40",
        equipment: "resistance_band",
        customEquipment: null,
        createdAt: "2026-09-16T10:00:00+00:00",
      }}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
    />);

    expect(screen.queryByRole("button", { name: "BW" })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("40")).toBeInTheDocument();
  });
});
