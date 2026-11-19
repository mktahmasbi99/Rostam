from __future__ import annotations

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.database import DomainError, RostamDatabase
from app.schemas import SetWrite, WorkoutWrite


@pytest.fixture
def clock(database, monkeypatch):
    now = datetime(2026, 10, 31, 12, 0, tzinfo=UTC)
    monkeypatch.setattr(database, "now_local", lambda: now.astimezone(database.settings.timezone))
    monkeypatch.setattr(database, "_utc_now", lambda: now.isoformat(timespec="microseconds"))
    return now


def exercise(database, query="Push"):
    return database.list_exercises("active", query, None)[0]


def workout_with_exercise(database, start="2026-10-30T09:00", end="2026-10-30T10:00"):
    workout = database.create_workout(WorkoutWrite(startedAt=start, endedAt=end))
    return database.add_workout_exercise(workout["id"], exercise(database)["id"])


def log(database, workout, at="2026-10-30T09:15", **values):
    return database.add_workout_set(
        workout["id"],
        workout["exercises"][0]["id"],
        SetWrite(
            occurredAt=at,
            repetitions=values.pop("repetitions", 10),
            resistanceKind="bodyweight",
            **values,
        ),
    )


def test_workout_sets_share_history_prefill_but_not_standalone_sections(database, clock):
    workout = workout_with_exercise(database)
    saved = log(database, workout)
    assert database.day("2026-10-30")["sections"] == []
    assert database.day("2026-10-30")["workouts"][0]["setCount"] == 1
    standalone = database.add_set(
        exercise(database)["id"],
        "2026-10-30",
        SetWrite(time="10:30", repetitions=7, resistanceKind="bodyweight"),
    )
    day = database.day("2026-10-30")
    assert [s["id"] for s in day["sections"][0]["sets"]] == [standalone["id"]]
    history = database.exercise_history(exercise(database)["id"], None, 10)
    assert history["sessions"][0]["total"] == 17
    assert database.prefill(exercise(database)["id"], "2026-10-30", "09:30")["id"] == saved["id"]
    assert database.calendar("2026-10")["activeDates"] == ["2026-10-30"]
    database.delete_set(standalone["id"])
    assert database.calendar("2026-10")["activeDates"] == ["2026-10-30"]
    database.delete_set(saved["id"])
    assert database.calendar("2026-10")["activeDates"] == []


def test_active_workout_is_single_and_finish_is_idempotent(database, clock):
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = list(pool.map(lambda _: database.create_workout(WorkoutWrite())["id"], range(2)))
    assert ids[0] == ids[1]
    assert database.active_workout()["id"] == ids[0]
    assert database.calendar("2026-10")["activeDates"] == []
    with pytest.raises(DomainError, match="at least one set"):
        database.update_workout(ids[0], WorkoutWrite(), finish=True)
    workout = database.add_workout_exercise(ids[0], exercise(database)["id"])
    log(database, workout, None)
    done = database.update_workout(ids[0], WorkoutWrite(), finish=True)
    assert done["endedAt"] is not None
    assert database.active_workout() is None
    assert (
        database.update_workout(ids[0], WorkoutWrite(endedAt="2026-10-30T10:00"), finish=True)
        == done
    )
    assert database.create_workout(WorkoutWrite())["id"] != ids[0]


def test_cross_midnight_workout_marks_actual_set_days_and_edits_boundaries(database, clock):
    workout = workout_with_exercise(database, "2026-10-29T23:30", "2026-10-30T01:00")
    first = log(database, workout, "2026-10-29T23:45")
    second = log(database, workout, "2026-10-30T00:15")
    assert first["date"] == "2026-10-29"
    assert second["date"] == "2026-10-30"
    assert database.calendar("2026-10")["activeDates"] == ["2026-10-29", "2026-10-30"]
    for day in ("2026-10-29", "2026-10-30"):
        assert database.day(day)["workouts"][0]["id"] == workout["id"]
    for at in ("2026-10-29T23:00", "2026-10-30T01:30", "2027-01-01T10:00"):
        with pytest.raises(DomainError):
            log(database, workout, at)
    with pytest.raises(DomainError, match="contain all"):
        database.update_workout(workout["id"], WorkoutWrite(endedAt="2026-10-30T00:00"))
    with pytest.raises(DomainError, match="within"):
        database.update_set(
            first["id"],
            SetWrite(occurredAt="2026-10-29T20:00", repetitions=5, resistanceKind="bodyweight"),
        )
    database.update_set(
        first["id"],
        SetWrite(occurredAt="2026-10-30T00:10", repetitions=5, resistanceKind="bodyweight"),
    )
    assert database.calendar("2026-10")["activeDates"] == ["2026-10-30"]


def test_workout_order_membership_archive_and_confirmed_deletion(database, clock):
    workout = workout_with_exercise(database)
    one = workout["exercises"][0]
    again = database.add_workout_exercise(workout["id"], one["exercise"]["id"])
    assert len(again["exercises"]) == 1
    two = database.add_workout_exercise(workout["id"], exercise(database, "Squat")["id"])
    other = two["exercises"][1]
    ordered = database.reorder_workout_exercises(workout["id"], [other["id"], one["id"]])
    assert ordered["exercises"][0]["id"] == other["id"]
    with pytest.raises(DomainError, match="exactly once"):
        database.reorder_workout_exercises(workout["id"], [one["id"], one["id"]])
    saved = log(database, workout)
    database.archive_exercise(one["exercise"]["id"])
    database.update_set(saved["id"], SetWrite(repetitions=8, resistanceKind="bodyweight"))
    with pytest.raises(DomainError, match="Restore"):
        log(database, workout)
    with pytest.raises(DomainError, match="Remove this exercise"):
        database.delete_exercise(one["exercise"]["id"], "DELETE")
    with pytest.raises(DomainError, match="Confirm"):
        database.remove_workout_exercise(workout["id"], one["id"], None)
    with pytest.raises(DomainError, match="Confirm"):
        database.delete_workout(workout["id"], None)
    different = database.create_workout(WorkoutWrite())
    with pytest.raises(DomainError, match="not found"):
        database.add_workout_set(
            different["id"], one["id"], SetWrite(repetitions=5, resistanceKind="bodyweight")
        )
    database.remove_workout_exercise(workout["id"], one["id"], "DELETE")
    database.delete_workout(workout["id"], None)
    assert database.exercise_history(one["exercise"]["id"], None, 10)["sessions"] == []
    with database.connect() as connection:
        assert connection.execute("PRAGMA foreign_key_check").fetchone() is None


def test_workout_sets_do_not_resolve_rotations_or_satisfy_standalone_completion(database, clock):
    pushups = exercise(database)
    rotation = database.create_rotation("Daily")
    database.set_rotation_members(rotation["id"], [pushups["id"]])
    database.activate_rotation(rotation["id"], pushups["id"])
    workout = workout_with_exercise(database, "2026-10-31T09:00", "2026-10-31T10:00")
    log(database, workout, "2026-10-31T09:15")
    assert database.rotations()[0]["resolvedToday"] is None
    assert database.rotations()[0]["members"][0]["lastDoneDate"] is None
    assert database.rotation_recommendations(7) == []
    # Activation also must not resolve the due exercise using workout history.
    database.activate_rotation(rotation["id"], pushups["id"])
    assert database.rotations()[0]["resolvedToday"] is None
    standalone = database.add_set(
        pushups["id"],
        "2026-10-31",
        SetWrite(time="11:00", repetitions=5, resistanceKind="bodyweight"),
    )
    assert database.rotations()[0]["resolvedToday"] == "completed"
    database.delete_set(standalone["id"])
    assert database.rotations()[0]["resolvedToday"] is None


def test_workout_calendar_mixed_sources_and_timezone(database, clock):
    activity = database.create_activity("Walk")
    entry = database.start_activity_entry(activity["id"], "2026-10-30T23:30:00+00:00")
    assert database.calendar("2026-10")["activeDates"] == ["2026-10-31"]
    workout = workout_with_exercise(database, "2026-10-31T09:00", "2026-10-31T10:00")
    saved = log(database, workout, "2026-10-31T09:15")
    database.delete_activity_entry(entry["id"])
    assert database.calendar("2026-10")["activeDates"] == ["2026-10-31"]
    database.delete_set(saved["id"])
    assert database.calendar("2026-10")["activeDates"] == []


def test_workout_times_reject_dst_gaps_and_ambiguity(database, clock):
    for start in ("2026-03-29T02:30", "2026-10-25T02:30", "bad", "2027-01-01T00:00"):
        with pytest.raises(DomainError):
            database.create_workout(WorkoutWrite(startedAt=start))
    # An explicit offset disambiguates a repeated local hour.
    database.create_workout(WorkoutWrite(startedAt="2026-10-25T02:30+02:00"))


def test_v16_backup_migrates_and_new_workout_backup_roundtrips(database, clock):
    source = database.create_backup("on-demand")
    with sqlite3.connect(database.backup_path(source["id"])) as connection:
        connection.execute("DROP INDEX idx_sets_workout")
        connection.execute("ALTER TABLE exercise_sets DROP COLUMN workout_exercise_id")
        connection.execute("DROP TABLE workout_exercises")
        connection.execute("DROP TABLE workouts")
        connection.execute("DELETE FROM schema_migrations WHERE version = 17")
        connection.commit()
    database.restore_backup(source["id"], "RESTORE")
    workout = workout_with_exercise(database)
    log(database, workout)
    snapshot = database.create_backup("on-demand")
    database.delete_workout(workout["id"], "DELETE")
    database.restore_backup(snapshot["id"], "RESTORE")
    assert database.workout(workout["id"])["setCount"] == 1
    assert RostamDatabase(database.settings).workout(workout["id"])["setCount"] == 1


def test_workout_api_pagination_validation_and_version(database, clock, monkeypatch):
    from app import main

    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)
    assert client.get("/api/config").json()["version"] == "2.3.0"
    created = client.post(
        "/api/workouts", json={"startedAt": "2026-10-30T09:00", "endedAt": "2026-10-30T10:00"}
    ).json()
    member = client.post(
        f"/api/workouts/{created['id']}/exercises", json={"exerciseId": exercise(database)["id"]}
    ).json()["exercises"][0]
    assert (
        client.post(
            f"/api/workouts/{created['id']}/exercises/{member['id']}/sets",
            json={
                "occurredAt": "2026-10-30T09:30",
                "repetitions": 5,
                "resistanceKind": "bodyweight",
            },
        ).status_code
        == 201
    )
    assert client.get(f"/api/workouts/{created['id']}").json()["setCount"] == 1
    assert (
        client.put(
            f"/api/workouts/{created['id']}/order", json={"exerciseEntryIds": [member["id"]]}
        ).status_code
        == 200
    )
    assert client.get("/api/workouts/active").json() is None
    second = client.post("/api/workouts", json={}).json()
    page = client.get("/api/workouts?limit=1").json()
    assert page["items"][0]["id"] == second["id"]
    assert (
        client.get(f"/api/workouts?beforeId={page['nextBeforeId']}").json()["items"][0]["id"]
        == created["id"]
    )
    assert client.get("/api/workouts?limit=100").status_code == 400
    assert client.post("/api/workouts", json={"name": "x" * 101}).status_code == 422
    assert client.request("DELETE", f"/api/workouts/{created['id']}", json={}).status_code == 400


def test_historical_workout_does_not_replace_or_resume_live_workout(database, clock):
    live = database.create_workout(WorkoutWrite(name="Live workout"))
    historical = database.create_workout(
        WorkoutWrite(name="Past workout", startedAt="2026-10-30T09:00", endedAt="2026-10-30T10:00")
    )
    assert historical["id"] != live["id"]
    assert historical["endedAt"] is not None
    assert database.active_workout()["id"] == live["id"]
    assert database.day("2026-10-30")["workouts"][0]["id"] == historical["id"]


def test_queued_workout_set_retries_after_finish_and_deletion(database, clock, monkeypatch):
    from uuid import uuid4

    from app import main

    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)
    workout = workout_with_exercise(database, "2026-10-31T11:00", None)
    entry = workout["exercises"][0]
    url = f"/api/workouts/{workout['id']}/exercises/{entry['id']}/sets"
    payload = {
        "occurredAt": "2026-10-31T10:30:00Z",
        "resistanceKind": "bodyweight",
        "repetitions": 5,
        "operationId": str(uuid4()),
        "ledgerGeneration": workout["ledgerGeneration"],
    }
    assert client.post(url, json={**payload, "ledgerGeneration": None}).status_code == 422
    assert client.post(url, json={**payload, "occurredAt": None}).status_code == 422
    log(database, workout, "2026-10-31T11:10")
    database.update_workout(workout["id"], WorkoutWrite(), finish=True)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first, retry = pool.map(lambda _: client.post(url, json=payload), range(2))
    assert first.status_code == retry.status_code == 201
    saved = first.json()
    assert saved == retry.json()
    assert saved["operationId"] == payload["operationId"]
    assert saved["occurredAt"] == "2026-10-31T10:30:00.000000+00:00"
    assert database.workout(workout["id"])["setCount"] == 2
    assert client.post(url, json={**payload, "repetitions": 8}).status_code == 409
    assert (
        client.post(
            url, json={**payload, "operationId": str(uuid4()), "occurredAt": "2026-10-31T09:59:00Z"}
        ).status_code
        == 400
    )
    database.delete_workout(workout["id"], "DELETE")
    assert client.post(url, json=payload).json() == saved
    assert client.post(url, json={**payload, "operationId": str(uuid4())}).status_code == 400


def test_sync_generation_migrates_older_backups_and_changes_on_each_replacement(database, clock):
    from uuid import uuid4

    from app.database import WorkoutSetConflict
    from app.schemas import WorkoutSetWrite

    workout = workout_with_exercise(database)
    entry = workout["exercises"][0]
    payload = WorkoutSetWrite(
        occurredAt="2026-10-30T09:15",
        repetitions=5,
        resistanceKind="bodyweight",
        operationId=uuid4(),
        ledgerGeneration=workout["ledgerGeneration"],
    )
    saved = database.add_workout_set(workout["id"], entry["id"], payload)
    marked = database.create_backup("on-demand")
    database.restore_backup(marked["id"], "RESTORE")
    restored = database.ledger_generation()
    assert restored != workout["ledgerGeneration"]
    assert database.workout(workout["id"])["exercises"][0]["sets"] == [saved]
    with pytest.raises(WorkoutSetConflict, match="ledger was replaced"):
        database.add_workout_set(workout["id"], entry["id"], payload)

    source = database.backup_path(marked["id"])
    with sqlite3.connect(source) as connection:
        connection.execute("DROP TABLE workout_sync_generation")
        connection.execute("DROP TABLE workout_set_receipts")
        connection.execute("ALTER TABLE exercise_sets DROP COLUMN operation_id")
        connection.execute("DELETE FROM schema_migrations WHERE version = 19")
        connection.execute("DROP TABLE backup_metadata")
    database.import_path(source, "IMPORT", source="2.1.0.sqlite3")
    assert database.ledger_generation() not in (restored, workout["ledgerGeneration"])
    assert database.workout(workout["id"])["setCount"] == 1
