from __future__ import annotations

import asyncio
import sqlite3
import tempfile
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import load_settings
from .database import DomainError, MonsterSetsDatabase
from .schemas import (
    DeleteConfirmation,
    ExerciseCreate,
    ExerciseUpdate,
    RestoreConfirmation,
    SetWrite,
)

settings = load_settings()
database = MonsterSetsDatabase(settings)


async def backup_scheduler() -> None:
    while True:
        try:
            await asyncio.to_thread(database.run_scheduled_backups)
        except (DomainError, OSError, sqlite3.Error):
            # A failed scheduled backup must not terminate the web application.
            # The next scheduler pass will retry because the logical run date is
            # recorded only after a successful backup.
            pass
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


@app.get("/api/days/{day}")
def get_day(day: str) -> dict:
    return database.day(day)


@app.get("/api/calendar/{month}")
def get_calendar(month: str) -> dict:
    return database.calendar(month)


@app.get("/api/exercises")
def list_exercises(
    status: str = "active",
    query: str = "",
    measurement_type: Annotated[str | None, Query(alias="measurementType")] = None,
) -> list[dict]:
    return database.list_exercises(status, query, measurement_type)


@app.post("/api/exercises", status_code=201)
def create_exercise(payload: ExerciseCreate) -> dict:
    return database.create_exercise(payload)


@app.get("/api/exercises/{exercise_id}")
def get_exercise(exercise_id: int) -> dict:
    return database.exercise(exercise_id)


@app.patch("/api/exercises/{exercise_id}")
def update_exercise(exercise_id: int, payload: ExerciseUpdate) -> dict:
    return database.update_exercise(exercise_id, payload)


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
        while chunk := await file.read(1024 * 1024):
            temporary.write(chunk)
    try:
        if path.stat().st_size == 0:
            raise DomainError("Choose a SQLite backup file to restore.")
        return database.restore_path(path, confirmation, source=file.filename or "uploaded backup")
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
