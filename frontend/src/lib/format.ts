import type { Equipment, ExerciseSet } from "./types";

export const equipmentLabels: Record<Equipment, string> = {
  resistance_band: "Resistance band",
  resistance_tube: "Resistance tubes",
  dumbbell: "Dumbbell",
  barbell: "Barbell",
  kettlebell: "Kettlebell",
  cable: "Cable",
  weight_machine: "Weight machine",
  weighted_vest: "Weighted vest",
  weight_plate: "Weight plate",
  ankle_weights: "Ankle weights",
  sandbag: "Sandbag",
  other: "Other",
};

export const equipmentTitleLabels: Record<Exclude<Equipment, "other">, string> = {
  resistance_band: "Resistance Bands",
  resistance_tube: "Resistance tubes",
  dumbbell: "Dumbbells",
  barbell: "Barbell",
  kettlebell: "Kettlebell",
  cable: "Cable",
  weight_machine: "Weight Machine",
  weighted_vest: "Weighted Vest",
  weight_plate: "Weight Plate",
  ankle_weights: "Ankle Weights",
  sandbag: "Sandbag",
};

export function exerciseTitle(baseName: string, equipment: Equipment | null, customEquipment: string): string {
  const base = baseName.trim().replace(/\s+/g, " ");
  if (!equipment) return base;
  const suffix = equipment === "other" ? customEquipment.trim().replace(/\s+/g, " ") : equipmentTitleLabels[equipment];
  return suffix ? `${base} (${suffix})` : base;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

export function formatHoldDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (!minutes) return `${remainder}s`;
  if (!remainder) return `${minutes}m`;
  return `${minutes}m ${remainder}s`;
}

export function formatMeasurement(set: ExerciseSet): string {
  if (set.repetitions !== null && set.holdMinutes !== null && set.holdSeconds !== null) {
    return `${set.repetitions} reps × ${formatHoldDuration(set.holdMinutes * 60 + set.holdSeconds)} hold`;
  }
  if (set.repetitions !== null) return `${set.repetitions} reps`;
  return formatDuration((set.durationMinutes ?? 0) * 60 + (set.durationSeconds ?? 0));
}

export function formatResistance(set: ExerciseSet): string {
  if (set.resistanceKind === "bodyweight") return "Bodyweight";
  const equipment = set.equipment === "other" ? set.customEquipment : set.equipment && equipmentLabels[set.equipment];
  return `${set.weightKg} kg · ${equipment}`;
}

export function formatDay(day: string, today: string): string {
  if (day === today) return "Today";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${day}T12:00:00`),
  );
}
