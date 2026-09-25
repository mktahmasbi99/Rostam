from __future__ import annotations

import asyncio
import sqlite3
import tempfile
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import load_settings
from .database import DomainError, RostamDatabase
from .schemas import (
    BackupSettingsUpdate,
    BodyMeasurementWrite,
    DailyNoteUpdate,
    DeleteConfirmation,
    ExerciseCreate,
    ExerciseNoteUpdate,
    ExerciseUpdate,
    ProfileUpdate,
    RecommendationPauseUpdate,
    RestoreConfirmation,
    SetWrite,
)

settings = load_settings()
database = RostamDatabase(settings)


async def backup_scheduler() -> None:
    while True:
        try:
            await asyncio.to_thread(database.run_scheduled_backups)
        except (DomainError, OSError, sqlite3.Error) as exc:
            # A failed scheduled backup must not terminate the web application.
            # The next scheduler pass will retry because the logical run date is
            # recorded only after a successful backup.
            database.record_backup_failure(f"Scheduled backup failed: {exc}")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(backup_scheduler())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Rostam API", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def prevent_api_caching(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(DomainError)
async def domain_error_handler(_, exc: DomainError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/config")
def config() -> dict[str, str]:
    return {
        "today": database.today().isoformat(),
        "timezone": settings.timezone_name,
        "version": "1.0.0",
    }


@app.get("/api/profile")
def get_profile() -> dict:
    return database.profile()


@app.put("/api/profile")
def update_profile(payload: ProfileUpdate) -> dict:
    return database.update_profile(payload)


@app.get("/api/body-measurements")
def list_body_measurements() -> list[dict]:
    return database.list_body_measurements()


@app.post("/api/body-measurements", status_code=201)
def create_body_measurement(payload: BodyMeasurementWrite) -> dict:
    return database.create_body_measurement(payload)


@app.patch("/api/body-measurements/{measurement_id}")
def update_body_measurement(measurement_id: int, payload: BodyMeasurementWrite) -> dict:
    return database.update_body_measurement(measurement_id, payload)


@app.delete("/api/body-measurements/{measurement_id}", status_code=204)
def delete_body_measurement(measurement_id: int) -> None:
    database.delete_body_measurement(measurement_id)


@app.get("/api/days/{day}")
def get_day(day: str) -> dict:
    return database.day(day)


@app.get("/api/calendar/{month}")
def get_calendar(month: str) -> dict:
    return database.calendar(month)


@app.get("/api/exercises/{exercise_id}/history")
def get_exercise_history(
    exercise_id: int,
    before_date: Annotated[str | None, Query(alias="beforeDate")] = None,
    limit: int = 10,
) -> dict:
    return database.exercise_history(exercise_id, before_date, limit)


@app.get("/api/exercises")
def list_exercises(
    status: str = "active",
    query: str = "",
    measurement_type: Annotated[str | None, Query(alias="measurementType")] = None,
) -> list[dict]:
    return database.list_exercises(status, query, measurement_type)


@app.get("/api/exercise-recommendations")
def exercise_recommendations(
    day: str,
    query: str = "",
    measurement_type: Annotated[str | None, Query(alias="measurementType")] = None,
    muscle_group: Annotated[str | None, Query(alias="muscleGroup")] = None,
    muscle_role: Annotated[str, Query(alias="muscleRole")] = "any",
    include_paused: Annotated[bool, Query(alias="includePaused")] = False,
    sort: str = "recommended",
) -> dict:
    return database.exercise_recommendations(
        day, query, measurement_type, muscle_group, muscle_role, include_paused, sort
    )


@app.post("/api/exercises", status_code=201)
def create_exercise(payload: ExerciseCreate) -> dict:
    return database.create_exercise(payload)


@app.get("/api/exercises/{exercise_id}")
def get_exercise(exercise_id: int) -> dict:
    return database.exercise(exercise_id)


@app.patch("/api/exercises/{exercise_id}")
def update_exercise(exercise_id: int, payload: ExerciseUpdate) -> dict:
    return database.update_exercise(exercise_id, payload)


@app.put("/api/exercises/{exercise_id}/recommendation-pause")
def update_recommendation_pause(exercise_id: int, payload: RecommendationPauseUpdate) -> dict:
    return database.update_recommendation_pause(exercise_id, payload.period)


@app.put("/api/exercises/{exercise_id}/note")
def update_exercise_note(exercise_id: int, payload: ExerciseNoteUpdate) -> dict:
    return database.update_exercise_note(exercise_id, payload.body)


@app.put("/api/days/{day}/note")
def update_daily_note(day: str, payload: DailyNoteUpdate) -> dict:
    return database.update_daily_note(day, payload.body)


@app.delete("/api/days/{day}/note", status_code=204)
def delete_daily_note(day: str) -> None:
    database.delete_daily_note(day)


@app.get("/api/notes")
def list_daily_notes() -> list[dict]:
    return database.list_daily_notes()


@app.post("/api/days/{day}/photos", status_code=201)
async def upload_daily_photos(day: str, files: list[UploadFile] = File()):  # noqa: B008
    try:
        return database.add_daily_photos(day, [await file.read() for file in files])
    finally:
        for file in files:
            await file.close()


@app.get("/api/days/{day}/photos")
def list_daily_photos(day: str) -> list[dict]:
    return database.list_daily_photos(day)


@app.get("/api/photos")
def list_photos() -> list[dict]:
    return database.list_photos()


@app.get("/api/photos/{photo_id}")
def get_photo(photo_id: int) -> Response:
    return Response(database.photo_data(photo_id, thumbnail=False), media_type="image/jpeg")


@app.get("/api/photos/{photo_id}/thumbnail")
def get_photo_thumbnail(photo_id: int) -> Response:
    return Response(database.photo_data(photo_id, thumbnail=True), media_type="image/jpeg")


@app.delete("/api/photos/{photo_id}", status_code=204)
def delete_daily_photo(photo_id: int) -> None:
    database.delete_daily_photo(photo_id)


@app.post("/api/exercises/{exercise_id}/archive")
def archive_exercise(exercise_id: int) -> dict:
    return database.archive_exercise(exercise_id)


@app.post("/api/exercises/{exercise_id}/restore")
def restore_exercise(exercise_id: int) -> dict:
    return database.restore_exercise(exercise_id)


@app.delete("/api/exercises/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: int, payload: DeleteConfirmation) -> None:
    database.delete_exercise(exercise_id, payload.confirmation)


@app.get("/api/exercises/{exercise_id}/prefill")
def get_prefill(exercise_id: int, day: str, time: str | None = None) -> dict:
    return database.prefill(exercise_id, day, time)


@app.post("/api/days/{day}/exercises/{exercise_id}/sets", status_code=201)
def add_set(day: str, exercise_id: int, payload: SetWrite) -> dict:
    return database.add_set(exercise_id, day, payload)


@app.patch("/api/sets/{set_id}")
def update_set(set_id: int, payload: SetWrite) -> dict:
    return database.update_set(set_id, payload)


@app.delete("/api/sets/{set_id}", status_code=204)
def delete_set(set_id: int) -> None:
    database.delete_set(set_id)


@app.get("/api/backups")
def list_backups() -> list[dict]:
    return database.list_backups()


@app.post("/api/backups/on-demand", status_code=201)
def create_on_demand_backup() -> dict:
    return database.create_backup("on-demand")


@app.post("/api/backups/{backup_id}/restore")
def restore_backup(backup_id: str, payload: RestoreConfirmation) -> dict:
    return database.restore_backup(backup_id, payload.confirmation)


@app.post("/api/backups/restore-upload")
async def restore_uploaded_backup(
    confirmation: str = Form(),
    file: UploadFile = File(),  # noqa: B008
) -> dict:
    database.settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        prefix="restore-upload-",
        suffix=".sqlite3",
        dir=database.settings.database_path.parent,
        delete=False,
    ) as temporary:
        path = Path(temporary.name)
        size = 0
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > 100 * 1024 * 1024:
                raise DomainError("Backup uploads are limited to 100 MiB.")
            temporary.write(chunk)
    try:
        if path.stat().st_size == 0:
            raise DomainError("Choose a SQLite backup file to restore.")
        return database.restore_path(path, confirmation, source=file.filename or "uploaded backup")
    finally:
        await file.close()
        path.unlink(missing_ok=True)


@app.get("/api/backups/settings")
def get_backup_settings() -> dict:
    return database.backup_settings()


@app.put("/api/backups/settings")
def update_backup_settings(payload: BackupSettingsUpdate) -> dict:
    return database.update_backup_settings(payload.model_dump())


@app.get("/api/backups/notifications")
def get_backup_notifications() -> list[dict[str, str]]:
    return database.backup_notifications()


@app.post("/api/backups/import-legacy")
async def import_legacy_database(
    confirmation: str = Form(),
    file: UploadFile = File(),  # noqa: B008
) -> dict:
    with tempfile.NamedTemporaryFile(
        prefix="legacy-import-", suffix=".sqlite3", dir=database.path.parent, delete=False
    ) as temporary:
        path = Path(temporary.name)
        size = 0
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > 100 * 1024 * 1024:
                raise DomainError("Import uploads are limited to 100 MiB.")
            temporary.write(chunk)
    try:
        if path.stat().st_size == 0:
            raise DomainError("Choose a legacy SQLite file to import.")
        return database.import_path(path, confirmation, source=file.filename or "legacy database")
    finally:
        await file.close()
        path.unlink(missing_ok=True)


@app.get("/api/backups/{backup_id}/download")
def download_backup(backup_id: str) -> FileResponse:
    path = database.backup_path(backup_id)
    return FileResponse(path, filename=path.name, media_type="application/x-sqlite3")


@app.delete("/api/backups/{backup_id}", status_code=204)
def delete_backup(backup_id: str) -> None:
    database.delete_backup(backup_id)


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
