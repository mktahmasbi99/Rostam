import { describe, expect, it } from "vitest";
import { exerciseTitle, formatDuration, formatMeasurement, formatResistance } from "./format";
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
  holdMinutes: null,
  holdSeconds: null,
  resistanceKind: "bodyweight",
  weightKg: null,
  equipment: null,
  customEquipment: null,
  createdAt: "2026-09-13T08:00:00+00:00",
};

describe("formatting", () => {
  it("generates canonical equipment titles", () => {
    expect(exerciseTitle("  Squats  ", "resistance_band", "")).toBe("Squats (Resistance Bands)");
    expect(exerciseTitle("Lateral raises", "resistance_tube", "")).toBe("Lateral raises (Resistance tubes)");
    expect(exerciseTitle("Ab Rollouts", null, "")).toBe("Ab Rollouts");
  });

  it("adds durations using clock notation", () => {
    expect(formatDuration(135)).toBe("2:15");
  });

  it("formats timed repetitions with a readable per-rep hold", () => {
    expect(formatMeasurement({ ...base, repetitions: 4, holdMinutes: 0, holdSeconds: 10 })).toBe("4 reps × 10s hold");
    expect(formatMeasurement({ ...base, repetitions: 4, holdMinutes: 1, holdSeconds: 5 })).toBe("4 reps × 1m 5s hold");
  });

  it("shows complete external resistance context", () => {
    expect(formatResistance({ ...base, resistanceKind: "external", weightKg: "25", equipment: "resistance_band" })).toBe("25 kg · Resistance band");
    expect(formatResistance({ ...base, resistanceKind: "external", weightKg: "25", equipment: "resistance_tube" })).toBe("25 kg · Resistance tubes");
  });

  it("shows Bodyweight explicitly", () => {
    expect(formatResistance(base)).toBe("Bodyweight");
  });
});
