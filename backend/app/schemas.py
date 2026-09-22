from __future__ import annotations

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


class ExerciseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    baseName: str = Field(min_length=1, max_length=100)
    imageKey: str | None = Field(default=None, max_length=100)


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


class DeleteConfirmation(BaseModel):
    confirmation: str


class RestoreConfirmation(BaseModel):
    confirmation: str


class SetWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    time: str | None = None
    repetitions: int | None = None
    durationMinutes: int | None = None
    durationSeconds: int | None = None
    holdMinutes: int | None = None
    holdSeconds: int | None = None
    resistanceKind: ResistanceKind
    weightKg: str | None = None
