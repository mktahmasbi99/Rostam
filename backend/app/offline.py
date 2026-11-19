from __future__ import annotations

import json
from base64 import b64encode
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from functools import partial

from .database import RostamDatabase


def all_pages(
    read: Callable[..., dict], items: str, *cursor_keys: str, limit: int = 50
) -> list[dict]:
    result: list[dict] = []
    cursor = [None] * len(cursor_keys)
    while True:
        page = read(*cursor, limit=limit)
        result.extend(page[items])
        cursor = [page[key] for key in cursor_keys]
        if cursor[0] is None:
            return result


def snapshot_records(database: RostamDatabase, config: Callable[[], dict]) -> Iterator[bytes]:
    def record(path: str, value: object) -> bytes:
        return (
            json.dumps([path, value], ensure_ascii=False, separators=(",", ":")) + "\n"
        ).encode()

    with database.read_snapshot() as connection:
        settings = config()
        yield record("meta", {"schema": 1, "downloadedAt": datetime.now(UTC).isoformat()})
        yield record("/api/config", settings)

        yield record("/api/profile", database.profile())
        yield record("/api/body-measurements/trends", database.body_measurement_trends())
        yield record(
            "/api/body-measurements",
            all_pages(database.body_measurement_page, "items", "nextBeforeDate", "nextBeforeId"),
        )
        yield record("/api/notes", all_pages(database.list_daily_notes, "items", "nextBeforeDate"))
        yield record("/api/activity-note-groups", database.activity_note_groups())
        yield record(
            "/api/activity-notes",
            all_pages(database.activity_notes, "items", "nextBeforeStartedAt", "nextBeforeId"),
        )
        for status in ("active", "archived"):
            yield record(f"/api/activities?status={status}", database.list_activities(status))
        yield record("/api/rotations", database.rotations("all"))

        workouts = all_pages(database.list_workouts, "items", "nextBeforeId")
        yield record("/api/workouts", workouts)
        for workout in workouts:
            yield record(f"/api/workouts/{workout['id']}", database.workout(workout["id"]))

        exercises = database.list_exercises("all", "", None)
        yield record("/api/exercises", exercises)
        for exercise in exercises:
            exercise_id = exercise["id"]
            history = all_pages(
                partial(database.exercise_history, exercise_id),
                "sessions",
                "nextBeforeDate",
            )
            yield record(f"/api/exercises/{exercise_id}/history", history)
        for row in connection.execute("SELECT image_key, jpeg FROM exercise_images"):
            yield record(
                f"/api/exercise-images/{row['image_key']}", b64encode(row["jpeg"]).decode()
            )

        photos = all_pages(database.list_photos, "items", "nextBeforeDate")
        yield record("/api/photos", photos)
        for group in photos:
            yield record(f"/api/days/{group['date']}/photos", group["photos"])
        for row in connection.execute("SELECT id, jpeg, thumbnail_jpeg FROM daily_photos"):
            path = f"/api/photos/{row['id']}"
            yield record(path, b64encode(row["jpeg"]).decode())
            yield record(f"{path}/thumbnail", b64encode(row["thumbnail_jpeg"]).decode())

        supplements = database.list_supplements()
        yield record("/api/supplements", supplements)
        for product in supplements:
            yield record(
                f"/api/supplements/{product['id']}", database.supplement_history(product["id"])
            )

        dates = {settings["today"]}
        dates.update(
            row[0]
            for row in connection.execute(
                "SELECT entry_date FROM day_exercises UNION SELECT entry_date FROM exercise_sets "
                "UNION SELECT entry_date FROM daily_notes UNION SELECT entry_date FROM daily_photos "
                "UNION SELECT entry_date FROM supplement_notes "
                "UNION SELECT entry_date FROM body_measurements"
            )
        )
        dates.update(
            datetime.fromisoformat(row[0]).astimezone(database.settings.timezone).date().isoformat()
            for row in connection.execute(
                "SELECT started_at FROM workouts UNION SELECT started_at FROM activity_entries "
                "UNION SELECT taken_at FROM supplement_intakes"
            )
        )
        for day in sorted(dates):
            yield record(f"/api/days/{day}", database.day(day))
        for month in sorted({day[:7] for day in dates}):
            yield record(f"/api/calendar/{month}", database.calendar(month))
        yield record("complete", True)
