from __future__ import annotations

from fastapi.testclient import TestClient

from app import main


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
    assert client.get("/api/body-measurements").json()[0]["weightKg"] == "80.2"
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
    assert [entry["note"] for entry in client.get("/api/activity-notes").json()] == [
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
