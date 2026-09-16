import { describe, expect, it } from "vitest";
import { exerciseTitle, formatDuration, formatResistance } from "./format";
import type { ExerciseSet } from "./types";

const base: ExerciseSet = {
  id: 1,
  exerciseId: 1,
  date: "2026-09-13",
  occurredAt: "2026-09-13T08:00:00+00:00",
  time: "10:00",
  repetitions: 15,
  durationMinutes: null,
  durationSeconds: null,
  resistanceKind: "bodyweight",
  weightKg: null,
  equipment: null,
  customEquipment: null,
  createdAt: "2026-09-13T08:00:00+00:00",
};

describe("formatting", () => {
  it("generates canonical equipment titles", () => {
    expect(exerciseTitle("  Squats  ", "resistance_band", "")).toBe("Squats (Resistance Bands)");
    expect(exerciseTitle("Ab Rollouts", null, "")).toBe("Ab Rollouts");
  });

  it("adds durations using clock notation", () => {
    expect(formatDuration(135)).toBe("2:15");
  });

  it("shows complete external resistance context", () => {
    expect(formatResistance({ ...base, resistanceKind: "external", weightKg: "25", equipment: "resistance_band" })).toBe("25 kg · Resistance band");
  });

  it("shows Bodyweight explicitly", () => {
    expect(formatResistance(base)).toBe("Bodyweight");
  });
});
