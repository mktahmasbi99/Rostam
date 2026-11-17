from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MeasurementType = Literal["repetitions", "duration", "timed_repetitions"]
ResistanceKind = Literal["bodyweight", "external"]
Equipment = Literal[
    "resistance_band",
    "resistance_tube",
    "dumbbell",
    "barbell",
    "kettlebell",
    "cable",
    "weight_machine",
    "weighted_vest",
    "weight_plate",
    "ankle_weights",
    "sandbag",
    "other",
]


class ExerciseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    baseName: str = Field(min_length=1, max_length=100)
    measurementType: MeasurementType
    equipment: Equipment | None = None
    customEquipment: str | None = Field(default=None, max_length=80)
    allowBodyweight: bool = True
    imageKey: str | None = Field(default=None, max_length=100)
    primaryMuscle: str | None = None
    secondaryMuscles: list[str] = Field(default_factory=list, max_length=11)


class ExerciseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    baseName: str = Field(min_length=1, max_length=100)
    imageKey: str | None = Field(default=None, max_length=100)
    primaryMuscle: str | None = None
    secondaryMuscles: list[str] = Field(default_factory=list, max_length=11)


class RecommendationPauseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period: Literal["week", "month", "six_months", "year", "forever", "resume"]


class ExerciseNoteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: str


class DailyNoteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: str


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    heightCm: str | None = None
    dateOfBirth: str | None = None


class BodyMeasurementWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str
    weightKg: str | None = None
    waistCm: str | None = None


class SupplementWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    brand: str = Field(default="", max_length=100)
    form: str = Field(default="", max_length=60)
    unit: str = Field(min_length=1, max_length=40)
    amountPerUnit: str = Field(min_length=1, max_length=40)
    amountUnit: str = Field(min_length=1, max_length=40)
    dailyTarget: str | None = Field(default=None, max_length=40)
    intervalDays: int = Field(default=1, ge=1, le=3652058)
    startDate: date
    rating: int | None = Field(default=None, ge=1, le=5)


class SupplementStockWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    startingBalance: str = Field(max_length=40)
    effectiveAt: str | None = Field(default=None, max_length=40)
    packageSize: str | None = Field(default=None, max_length=40)
    expiryDate: date | None = None


class SupplementIntakeWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    takenAt: str = Field(min_length=1, max_length=40)
    quantity: str = Field(min_length=1, max_length=40)


class DeleteConfirmation(BaseModel):
    confirmation: str


class RestoreConfirmation(BaseModel):
    confirmation: str


class ImportConfirmation(BaseModel):
    confirmation: str


class BackupSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dailyEnabled: bool
    dailyTime: str
    dailyRetention: int
    weeklyEnabled: bool
    weeklyWeekday: int
    weeklyTime: str
    weeklyRetention: int
    safetyRetention: int


class SetWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occurredAt: str | None = None
    time: str | None = None
    repetitions: int | None = None
    durationMinutes: int | None = None
    durationSeconds: int | None = None
    holdMinutes: int | None = None
    holdSeconds: int | None = None
    resistanceKind: ResistanceKind
    weightKg: str | None = None
    enrollInRotation: bool | None = None


class RotationName(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class RotationMembers(BaseModel):
    exerciseIds: list[int]


class RotationActivation(BaseModel):
    firstExerciseId: int | None = None
    firstPosition: int | None = Field(default=None, ge=0)


class ActivityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)


class ActivityDelete(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirmation: str


class ActivityStart(BaseModel):
    model_config = ConfigDict(extra="forbid")

    startedAt: str


class ActivityFinish(BaseModel):
    model_config = ConfigDict(extra="forbid")

    startedAt: str
    endedAt: str
    note: str = Field(default="", max_length=20000)


class ActivityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    startedAt: str
    endedAt: str
    note: str = Field(default="", max_length=20000)


class ActivityNoteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str = Field(default="", max_length=20000)


class WorkoutWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=100)
    startedAt: str | None = None
    endedAt: str | None = None


class WorkoutExerciseAdd(BaseModel):
    exerciseId: int


class WorkoutOrder(BaseModel):
    exerciseEntryIds: list[int]


class WorkoutDelete(BaseModel):
    confirmation: str | None = None
