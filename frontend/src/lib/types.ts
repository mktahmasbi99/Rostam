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

export interface Profile { heightCm: string | null; dateOfBirth: string | null; age: number | null; }
export interface ProfilePayload { heightCm: string | null; dateOfBirth: string | null; }
export interface BodyMeasurement { id: number; date: string; measurementType: "weight" | "waist"; weightKg: string | null; waistCm: string | null; createdAt: string; updatedAt: string; }
export interface BodyMeasurementPayload { date: string; weightKg: string | null; waistCm: string | null; }

export interface Exercise {
  id: number;
  name: string;
  baseName: string;
  measurementType: MeasurementType;
  equipment: Equipment | null;
  customEquipment: string | null;
  allowBodyweight: boolean;
  defaultWeightKg: string | null;
  imageKey: string | null;
  exerciseNote: string | null;
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
  dailyNote?: string | null;
  photoCount?: number;
}

export interface DailyNote { date: string; body: string; createdAt: string; updatedAt: string; }
export interface DailyPhoto { id: number; date: string; displayOrder: number; width: number; height: number; createdAt: string; thumbnailUrl: string; url: string; }
export interface PhotoGroup { date: string; photos: DailyPhoto[]; }

export interface SetPayload {
  time: string | null;
  repetitions: number | null;
  durationMinutes: number | null;
  durationSeconds: number | null;
  resistanceKind: ResistanceKind;
  weightKg: string | null;
}

export interface ExerciseCreatePayload {
  baseName: string;
  measurementType: MeasurementType;
  equipment: Equipment | null;
  customEquipment: string | null;
  allowBodyweight: boolean;
  defaultWeightKg: string | null;
  imageKey: string | null;
}

export interface ExerciseUpdatePayload {
  baseName: string;
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
