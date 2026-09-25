export type MeasurementType = "repetitions" | "duration" | "timed_repetitions";
export type ResistanceKind = "bodyweight" | "external";
export type Equipment =
  | "resistance_band"
  | "resistance_tube"
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
  imageKey: string | null;
  exerciseNote: string | null;
  archivedAt: string | null;
  hasHistory: boolean;
  primaryMuscle?: string | null;
  secondaryMuscles?: string[];
  recommendationPausedUntil?: string | null;
  recommendationPausedForever?: boolean;
}

export interface MuscleGroup { slug: string; name: string; }
export interface RecommendationItem {
  exercise: Exercise;
  lastDoneDate: string | null;
  daysSinceLastDone: number | null;
  paused: boolean;
}
export interface RecommendationGroup {
  muscle: string;
  muscleName: string;
  lastTrainedDate: string | null;
  daysSinceLastTrained: number | null;
  exercises: RecommendationItem[];
}
export interface ExerciseRecommendations {
  groups: RecommendationGroup[];
  unclassified: RecommendationItem[];
  neverTried: RecommendationItem[];
  allExercises: RecommendationItem[];
  muscleGroups: MuscleGroup[];
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
  holdMinutes: number | null;
  holdSeconds: number | null;
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

export interface ExerciseHistorySession {
  date: string;
  total: number;
  sets: ExerciseSet[];
}

export interface ExerciseHistoryPage {
  sessions: ExerciseHistorySession[];
  nextBeforeDate: string | null;
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
  holdMinutes: number | null;
  holdSeconds: number | null;
  resistanceKind: ResistanceKind;
  weightKg: string | null;
}

export interface ExerciseCreatePayload {
  baseName: string;
  measurementType: MeasurementType;
  equipment: Equipment | null;
  customEquipment: string | null;
  allowBodyweight: boolean;
  imageKey: string | null;
  primaryMuscle: string | null;
  secondaryMuscles: string[];
}

export interface ExerciseUpdatePayload {
  baseName: string;
  imageKey: string | null;
  primaryMuscle: string | null;
  secondaryMuscles: string[];
}

export interface Backup {
  id: string;
  category: "daily" | "weekly" | "on-demand" | "pre-restore" | "pre-import" | "pre-delete";
  createdAt: string;
  sizeBytes: number;
  isSafety?: boolean;
}

export interface BackupSettings { dailyEnabled: boolean; dailyTime: string; dailyRetention: number; weeklyEnabled: boolean; weeklyWeekday: number; weeklyTime: string; weeklyRetention: number; safetyRetention: number; }

export interface RestoreResult {
  source: string;
  safetyBackup: Backup;
}
