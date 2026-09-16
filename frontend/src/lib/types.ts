export type MeasurementType = "repetitions" | "duration";
export type ResistanceKind = "bodyweight" | "external";
export type Equipment =
  | "resistance_band"
  | "dumbbell"
  | "barbell"
  | "kettlebell"
  | "cable"
  | "weight_machine"
  | "weighted_vest"
  | "weight_plate"
  | "ankle_weights"
  | "sandbag"
  | "other";

export interface Config {
  today: string;
  timezone: string;
  version: string;
}

export interface Exercise {
  id: number;
  name: string;
  measurementType: MeasurementType;
  defaultResistanceKind: ResistanceKind;
  defaultEquipment: Equipment | null;
  defaultCustomEquipment: string | null;
  defaultWeightKg: string | null;
  imageKey: string | null;
  archivedAt: string | null;
  hasHistory: boolean;
}

export interface ExerciseSet {
  id: number;
  exerciseId: number;
  date: string;
  occurredAt: string;
  time: string;
  repetitions: number | null;
  durationMinutes: number | null;
  durationSeconds: number | null;
  resistanceKind: ResistanceKind;
  weightKg: string | null;
  equipment: Equipment | null;
  customEquipment: string | null;
  createdAt: string;
}

export interface DaySection {
  exercise: Exercise;
  displayOrder: number;
  total: number;
  sets: ExerciseSet[];
}

export interface DayData {
  date: string;
  sections: DaySection[];
}

export interface SetPayload {
  time: string | null;
  repetitions: number | null;
  durationMinutes: number | null;
  durationSeconds: number | null;
  resistanceKind: ResistanceKind;
  equipment: Equipment | null;
  customEquipment: string | null;
  weightKg: string | null;
}

export interface ExercisePayload {
  name: string;
  measurementType?: MeasurementType;
  defaultResistanceKind: ResistanceKind;
  defaultEquipment: Equipment | null;
  defaultCustomEquipment: string | null;
  defaultWeightKg: string | null;
  imageKey: string | null;
}

export interface Backup {
  id: string;
  category: "daily" | "weekly" | "on-demand";
  createdAt: string;
  sizeBytes: number;
}

export interface RestoreResult {
  source: string;
  safetyBackup: Backup;
}
