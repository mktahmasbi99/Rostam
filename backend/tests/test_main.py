from __future__ import annotations

import asyncio
from io import BytesIO
from threading import Event
from time import sleep
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import main


def test_rotation_endpoints_manage_members_and_skip(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)
    exercise_ids = [item["id"] for item in database.list_exercises("active", "", None)[:2]]
    created = client.post("/api/rotations", json={"name": "Morning"})
    assert created.status_code == 201
    rotation_id = created.json()["id"]
    assert (
        client.put(
            f"/api/rotations/{rotation_id}/members", json={"exerciseIds": exercise_ids}
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/rotations/{rotation_id}/activate", json={"firstExerciseId": exercise_ids[0]}
        ).json()["dueExerciseId"]
        == exercise_ids[0]
    )
    assert (
        client.post(f"/api/rotations/{rotation_id}/skip-today").json()["resolvedToday"] == "skipped"
    )
    assert client.delete(f"/api/rotations/{rotation_id}/skip-today").json()["resolvedToday"] is None
    assert (
        client.patch(f"/api/rotations/{rotation_id}", json={"name": "Evening"}).json()["name"]
        == "Evening"
    )
    assert client.post(f"/api/rotations/{rotation_id}/deactivate").json()["active"] is False
    assert client.delete(f"/api/rotations/{rotation_id}").status_code == 204


def test_rotation_archive_endpoints(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)
    rotation_id = client.post("/api/rotations", json={"name": "Archive me"}).json()["id"]
    assert client.post(f"/api/rotations/{rotation_id}/archive").json()["archivedAt"]
    assert client.get("/api/rotations").json() == []
    assert client.get("/api/rotations?status=archived").json()[0]["id"] == rotation_id
    restored = client.post(f"/api/rotations/{rotation_id}/restore")
    assert restored.status_code == 200
    assert restored.json()["archivedAt"] is None
    assert client.get("/api/rotations").json()[0]["id"] == rotation_id


def test_rotation_api_accepts_repeats_and_recommends_daily_history(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)
    exercise_id = next(item["id"] for item in database.list_exercises("active", "Squats", None))
    rotation_id = client.post("/api/rotations", json={"name": "Repeats"}).json()["id"]
    saved = client.put(
        f"/api/rotations/{rotation_id}/members",
        json={"exerciseIds": [exercise_id, exercise_id]},
    )
    assert saved.status_code == 200
    assert [item["position"] for item in saved.json()["members"]] == [0, 1]
    activated = client.post(f"/api/rotations/{rotation_id}/activate", json={"firstPosition": 1})
    assert activated.json()["duePosition"] == 1

    day = database.today().isoformat()
    payload = SimpleNamespace(
        time="08:00",
        repetitions=10,
        durationMinutes=None,
        durationSeconds=None,
        holdMinutes=None,
        holdSeconds=None,
        resistanceKind="bodyweight",
        weightKg=None,
        enrollInRotation=None,
    )
    database.add_set(exercise_id, day, payload)
    database.add_set(exercise_id, day, SimpleNamespace(**{**vars(payload), "time": "09:00"}))
    assert len(client.get("/api/rotation-recommendations?days=7").json()) == 1
    assert client.get("/api/rotation-recommendations?days=0").status_code == 422


def test_body_measurement_and_profile_endpoints(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)

    profile = client.put("/api/profile", json={"heightCm": "180", "dateOfBirth": "1990-01-01"})
    created = client.post(
        "/api/body-measurements",
        json={"date": database.today().isoformat(), "weightKg": "80.2", "waistCm": None},
    )

    assert profile.status_code == 200
    assert profile.json()["heightCm"] == "180"
    assert created.status_code == 201
    assert client.get("/api/body-measurements").json()["items"][0]["weightKg"] == "80.2"
    assert client.get("/api/body-measurements/trends").json()["latest"]["weight"]["value"] == "80.2"
    assert client.delete(f"/api/body-measurements/{created.json()['id']}").status_code == 204


def test_exercise_api_generates_title_and_rejects_immutable_updates(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)
    created = client.post(
        "/api/exercises",
        json={
            "baseName": "Overhead press",
            "measurementType": "repetitions",
            "equipment": "resistance_tube",
            "customEquipment": None,
            "allowBodyweight": True,
            "imageKey": None,
        },
    )

    assert created.status_code == 201
    assert created.json()["name"] == "Overhead press (Resistance tubes)"
    rejected = client.patch(
        f"/api/exercises/{created.json()['id']}",
        json={
            "baseName": "Overhead press",
            "imageKey": None,
            "equipment": "barbell",
        },
    )
    assert rejected.status_code == 422


def test_photo_upload_rejects_excessive_file_count_before_reading(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)

    response = client.post(
        f"/api/days/{database.today().isoformat()}/photos",
        files=[("files", (f"{index}.png", b"x", "image/png")) for index in range(11)],
    )

    assert response.status_code == 400
    assert "no more than 10 photos" in response.json()["detail"]


def test_photo_upload_stream_enforces_source_size_cap(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    monkeypatch.setattr(main, "MAX_PHOTO_BYTES", 4)
    client = TestClient(main.app)

    response = client.post(
        f"/api/days/{database.today().isoformat()}/photos",
        files=[("files", ("large.png", b"12345", "image/png"))],
    )

    assert response.status_code == 400
    assert "50 MiB or smaller" in response.json()["detail"]


def test_photo_upload_stream_enforces_aggregate_size_cap(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    monkeypatch.setattr(main, "MAX_PHOTO_UPLOAD_TOTAL_BYTES", 4)
    client = TestClient(main.app)

    response = client.post(
        f"/api/days/{database.today().isoformat()}/photos",
        files=[
            ("files", ("first.png", b"123", "image/png")),
            ("files", ("second.png", b"456", "image/png")),
        ],
    )

    assert response.status_code == 400
    assert "100 MiB or less" in response.json()["detail"]


def test_photo_processing_does_not_block_health_requests(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    processing_started = Event()
    original = database._process_photo

    def slow_process(source, **kwargs):
        processing_started.set()
        sleep(0.2)
        return original(source, **kwargs)

    monkeypatch.setattr(database, "_process_photo", slow_process)
    output = BytesIO()
    Image.new("RGB", (8, 8), "#995c12").save(output, format="PNG")
    source = output.getvalue()

    async def exercise_requests():
        transport = httpx.ASGITransport(app=main.app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            upload = asyncio.create_task(
                client.post(
                    f"/api/days/{database.today().isoformat()}/photos",
                    files=[("files", ("photo.png", source, "image/png"))],
                )
            )
            assert await asyncio.to_thread(processing_started.wait, 2)
            health = await client.get("/api/health")
            assert health.status_code == 200
            result = await upload
            assert result.status_code == 201

    asyncio.run(exercise_requests())


def test_interrupted_photo_stream_leaves_the_day_unchanged(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    image = BytesIO()
    Image.new("RGB", (8, 8), "#995c12").save(image, format="PNG")

    class InterruptedRead(BytesIO):
        def read(self, size=-1):
            if self.tell():
                raise OSError("simulated interrupted upload")
            return super().read(size)

    upload = main.UploadFile(filename="photo.png", file=InterruptedRead(image.getvalue()))

    async def interrupt():
        await main.upload_daily_photos(database.today().isoformat(), [upload])

    with pytest.raises(OSError, match="interrupted"):
        asyncio.run(interrupt())

    assert database.list_daily_photos(database.today().isoformat()) == []


def test_set_api_rejects_client_supplied_equipment(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    exercise = database.create_exercise(
        type(
            "Payload",
            (),
            {
                "baseName": "Press",
                "measurementType": "repetitions",
                "equipment": "resistance_band",
                "customEquipment": None,
                "allowBodyweight": True,
                "imageKey": None,
            },
        )()
    )
    response = TestClient(main.app).post(
        f"/api/days/{database.today().isoformat()}/exercises/{exercise['id']}/sets",
        json={
            "time": None,
            "repetitions": 10,
            "durationMinutes": None,
            "durationSeconds": None,
            "resistanceKind": "external",
            "weightKg": "15",
            "equipment": "barbell",
        },
    )

    assert response.status_code == 422


def test_exercise_history_endpoint_returns_grouped_sessions(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    exercise = next(item for item in database.list_exercises("active", "Push", None))
    payload = {
        "time": "08:00",
        "repetitions": 10,
        "durationMinutes": None,
        "durationSeconds": None,
        "holdMinutes": None,
        "holdSeconds": None,
        "resistanceKind": "bodyweight",
        "weightKg": None,
    }
    database.add_set(exercise["id"], "2026-09-01", type("Payload", (), payload)())
    database.add_set(exercise["id"], "2026-09-10", type("Payload", (), payload)())

    response = TestClient(main.app).get(
        f"/api/exercises/{exercise['id']}/history?beforeDate=2026-09-10&limit=10"
    )

    assert response.status_code == 200
    assert [session["date"] for session in response.json()["sessions"]] == ["2026-09-01"]


def test_exercise_note_api_preserves_plaintext_and_clears_whitespace(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    exercise = next(item for item in database.list_exercises("active", "Push", None))
    client = TestClient(main.app)
    body = "Hands below shoulders.\nhttps://example.com/push-ups"

    saved = client.put(f"/api/exercises/{exercise['id']}/note", json={"body": body})

    assert saved.status_code == 200
    assert saved.json()["exerciseNote"] == body
    assert client.get(f"/api/exercises/{exercise['id']}").json()["exerciseNote"] == body
    cleared = client.put(f"/api/exercises/{exercise['id']}/note", json={"body": "  \n"})
    assert cleared.status_code == 200
    assert cleared.json()["exerciseNote"] is None


def test_timed_activity_entries_allow_repeats_and_keep_notes_in_order(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)
    activity = client.post("/api/activities", json={"name": "BJJ – No Gi"}).json()
    first = client.post(
        f"/api/activities/{activity['id']}/entries",
        json={"startedAt": "2026-09-17T17:45:00+02:00"},
    ).json()
    overlapping = client.post(
        f"/api/activities/{activity['id']}/entries",
        json={"startedAt": "2026-09-17T19:00:00+02:00"},
    )
    assert overlapping.status_code == 400
    assert (
        client.patch(
            f"/api/activity-entries/{first['id']}",
            json={
                "startedAt": "2026-09-17T17:45:00+02:00",
                "endedAt": "2026-09-17T18:45:00+02:00",
                "note": "",
            },
        ).status_code
        == 200
    )
    second = client.post(
        f"/api/activities/{activity['id']}/entries",
        json={"startedAt": "2026-09-17T19:00:00+02:00"},
    ).json()
    assert (
        client.patch(
            f"/api/activity-entries/{second['id']}",
            json={
                "startedAt": "2026-09-17T19:00:00+02:00",
                "endedAt": "2026-09-17T20:00:00+02:00",
                "note": "",
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            f"/api/activities/{activity['id']}/entries",
            json={"startedAt": "2026-09-17T23:59:00+02:00"},
        ).status_code
        == 400
    )

    assert first["endedAt"] is None
    note_saved = client.put(
        f"/api/activity-entries/{second['id']}/note",
        json={"note": "Warm up and guard passing"},
    )
    assert note_saved.status_code == 200
    assert note_saved.json()["note"] == "Warm up and guard passing"
    assert [entry["id"] for entry in client.get("/api/days/2026-09-17").json()["activities"]] == [
        first["id"],
        second["id"],
    ]
    assert client.get("/api/days/2026-09-17").json()["activities"][1]["note"] == (
        "Warm up and guard passing"
    )
    assert (
        client.patch(
            f"/api/activity-entries/{first['id']}",
            json={
                "startedAt": "2026-09-17T17:50:00+02:00",
                "endedAt": "2026-09-17T18:45:00+02:00",
                "note": "Guard retention",
            },
        ).json()["durationSeconds"]
        == 3300
    )
    assert (
        client.patch(
            f"/api/activity-entries/{second['id']}",
            json={
                "startedAt": "2026-09-17T19:00:00+02:00",
                "endedAt": "2026-09-17T20:00:00+02:00",
                "note": "Arm drags",
            },
        ).status_code
        == 200
    )
    assert (
        client.patch(
            f"/api/activity-entries/{second['id']}",
            json={
                "startedAt": "2026-09-17T19:00:00+02:00",
                "endedAt": "2026-09-17T18:59:00+02:00",
                "note": "Invalid",
            },
        ).status_code
        == 400
    )
    assert (
        client.patch(
            f"/api/activity-entries/{second['id']}",
            json={
                "startedAt": "2026-09-17T23:00:00+02:00",
                "endedAt": "2026-09-18T00:01:00+02:00",
                "note": "Overnight",
            },
        ).status_code
        == 400
    )

    day = client.get("/api/days/2026-09-17").json()
    assert [entry["id"] for entry in day["activities"]] == [first["id"], second["id"]]
    note_page = client.get("/api/activity-notes?limit=1").json()
    assert [entry["note"] for entry in note_page["items"]] == ["Arm drags"]
    older_notes = client.get(
        f"/api/activity-notes?limit=1&beforeStartedAt={note_page['nextBeforeStartedAt']}&beforeId={note_page['nextBeforeId']}"
    ).json()
    assert [entry["note"] for entry in older_notes["items"]] == ["Guard retention"]
    assert [entry["note"] for entry in client.get("/api/activity-notes").json()["items"]] == [
        "Arm drags",
        "Guard retention",
    ]
    assert "2026-09-17" in client.get("/api/calendar/2026-09").json()["activeDates"]
    edited = client.put(
        f"/api/activity-entries/{second['id']}",
        json={
            "startedAt": "2026-09-17T19:05:00+02:00",
            "endedAt": "2026-09-17T20:00:00+02:00",
            "note": "Arm drags and snap downs",
        },
    )
    assert edited.status_code == 200
    assert edited.json()["durationSeconds"] == 3300
    assert edited.json()["note"] == "Arm drags and snap downs"
    assert client.delete(f"/api/activity-entries/{first['id']}").status_code == 204


def test_restore_backup_endpoint(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    source = database.create_backup("on-demand")

    response = TestClient(main.app).post(
        f"/api/backups/{source['id']}/restore", json={"confirmation": "RESTORE"}
    )

    assert response.status_code == 200
    assert response.json()["safetyBackup"]["category"] == "pre-restore"


def test_restore_upload_endpoint_removes_temporary_file(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    source = database.create_backup("on-demand")
    source_path = database.backup_path(source["id"])

    with source_path.open("rb") as handle:
        response = TestClient(main.app).post(
            "/api/backups/restore-upload",
            data={"confirmation": "RESTORE"},
            files={"file": ("restore.sqlite3", handle, "application/x-sqlite3")},
        )

    assert response.status_code == 200
    assert not list(database.path.parent.glob("restore-upload-*.sqlite3"))
