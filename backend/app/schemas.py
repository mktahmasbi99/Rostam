from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

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
    name: str = Field(min_length=1, max_length=100)
    measurementType: MeasurementType
    defaultResistanceKind: ResistanceKind
    defaultEquipment: Equipment | None = None
    defaultCustomEquipment: str | None = Field(default=None, max_length=80)
    defaultWeightKg: str | None = None
    imageKey: str | None = Field(default=None, max_length=100)


class ExerciseUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    defaultResistanceKind: ResistanceKind
    defaultEquipment: Equipment | None = None
    defaultCustomEquipment: str | None = Field(default=None, max_length=80)
    defaultWeightKg: str | None = None
    imageKey: str | None = Field(default=None, max_length=100)


class DeleteConfirmation(BaseModel):
    confirmation: str


class RestoreConfirmation(BaseModel):
    confirmation: str


class SetWrite(BaseModel):
    time: str | None = None
    repetitions: int | None = None
    durationMinutes: int | None = None
    durationSeconds: int | None = None
    resistanceKind: ResistanceKind
    equipment: Equipment | None = None
    customEquipment: str | None = Field(default=None, max_length=80)
    weightKg: str | None = None
