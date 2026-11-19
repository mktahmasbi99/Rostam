from __future__ import annotations

import json
from base64 import b64decode
from datetime import timedelta
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app import main


def test_snapshot_contains_complete_history_and_images(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)
    today = database.today()
    exercise = database.list_exercises("active", "Push-ups", None)[0]
    exercise_id = exercise["id"]
    for offset in range(52):
        day = (today - timedelta(days=offset)).isoformat()
        database.update_daily_note(day, f"Day {offset}")
        response = client.post(
            f"/api/days/{day}/exercises/{exercise_id}/sets",
            json={"repetitions": 8, "time": "00:00", "resistanceKind": "bodyweight"},
        )
        assert response.status_code == 201
    old_day = day
    jpeg = BytesIO()
    Image.new("RGB", (640, 480), "orange").save(jpeg, format="JPEG")
    photo = database.add_daily_photos(old_day, [jpeg.getvalue()])[0]
    custom_key = database.store_exercise_image(jpeg.getvalue())

    rotation = database.create_rotation("Snapshot rotation")
    database.set_rotation_members(rotation["id"], [exercise_id])
    database.activate_rotation(rotation["id"], exercise_id)

    export = client.get("/api/offline/snapshot")
    assert export.status_code == 200
    assert export.headers["Cache-Control"] == "no-store"
    assert int(export.headers["X-Rostam-Snapshot-Bytes"]) == len(export.content)
    rows = [json.loads(line) for line in export.iter_lines()]
    assert rows[0][1]["schema"] == 1
    assert rows[-1] == ["complete", True]
    snapshot = dict(rows)
    assert snapshot["/api/config"] == client.get("/api/config").json()
    assert len(snapshot["/api/notes"]) == 52
    assert snapshot["/api/notes"][-1]["body"] == "Day 51"
    history = snapshot[f"/api/exercises/{exercise_id}/history"]
    assert len(history) == 52
    assert history[-1]["date"] == old_day
    assert snapshot[f"/api/days/{old_day}"] == client.get(f"/api/days/{old_day}").json()
    assert old_day in snapshot[f"/api/calendar/{old_day[:7]}"]["activeDates"]
    assert snapshot["/api/rotations"] == client.get("/api/rotations?status=all").json()
    for url in (photo["url"], photo["thumbnailUrl"], f"/api/exercise-images/{custom_key}"):
        assert b64decode(snapshot[url]) == client.get(url).content
