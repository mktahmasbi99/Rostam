from __future__ import annotations

from fastapi.testclient import TestClient

from app import main


def test_exercise_api_generates_title_and_rejects_immutable_updates(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)
    created = client.post(
        "/api/exercises",
        json={
            "baseName": "Overhead press",
            "measurementType": "repetitions",
            "equipment": "resistance_band",
            "customEquipment": None,
            "allowBodyweight": True,
            "defaultWeightKg": "40",
            "imageKey": None,
        },
    )

    assert created.status_code == 201
    assert created.json()["name"] == "Overhead press (Resistance Bands)"
    rejected = client.patch(
        f"/api/exercises/{created.json()['id']}",
        json={
            "baseName": "Overhead press",
            "defaultWeightKg": "40",
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
                "defaultWeightKg": None,
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


def test_restore_backup_endpoint(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    source = database.create_backup("on-demand")

    response = TestClient(main.app).post(
        f"/api/backups/{source['id']}/restore", json={"confirmation": "RESTORE"}
    )

    assert response.status_code == 200
    assert response.json()["safetyBackup"]["category"] == "on-demand"


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
