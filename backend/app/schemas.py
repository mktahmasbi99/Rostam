from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MeasurementType = Literal["repetitions", "duration"]
ResistanceKind = Literal["bodyweight", "external"]
Equipment = Literal[
    "resistance_band",
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
    defaultWeightKg: str | None = None
    imageKey: str | None = Field(default=None, max_length=100)


class ExerciseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    baseName: str = Field(min_length=1, max_length=100)
    defaultWeightKg: str | None = None
    imageKey: str | None = Field(default=None, max_length=100)


class ExerciseNoteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    body: str


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
    resistanceKind: ResistanceKind
    weightKg: str | None = None
