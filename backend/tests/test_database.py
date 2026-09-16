from __future__ import annotations

import sqlite3
from types import SimpleNamespace

import pytest

from app.database import DomainError


def exercise_payload(**overrides):
    values = {
        "name": "Wall sit",
        "measurementType": "duration",
        "defaultResistanceKind": "bodyweight",
        "defaultEquipment": None,
        "defaultCustomEquipment": None,
        "defaultWeightKg": None,
        "imageKey": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def set_payload(**overrides):
    values = {
        "time": "08:12",
        "repetitions": 15,
        "durationMinutes": None,
        "durationSeconds": None,
        "resistanceKind": "bodyweight",
        "equipment": None,
        "customEquipment": None,
        "weightKg": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_initial_library_is_seeded_once(database):
    assert [item["name"] for item in database.list_exercises("active", "", None)] == [
        "Band pull-aparts",
        "Bicep curls",
        "Deadlifts",
        "Hollow-body hold",
        "Plank",
        "Pull-ups",
        "Push-ups",
        "Squats",
    ]
    database.migrate()
    assert len(database.list_exercises("all", "", None)) == 8


def test_names_are_case_and_whitespace_insensitive(database):
    database.create_exercise(exercise_payload())
    with pytest.raises(DomainError, match="already exists"):
        database.create_exercise(exercise_payload(name="  WALL   SIT "))


def test_mixed_resistance_sets_total_and_stable_day_order(database):
    today = database.today().isoformat()
    exercises = {item["name"]: item for item in database.list_exercises("active", "", None)}
    pushups = exercises["Push-ups"]
    squats = exercises["Squats"]
    first = database.add_set(pushups["id"], today, set_payload(time="10:21"))
    database.add_set(
        squats["id"],
        today,
        set_payload(
            time="09:36",
            resistanceKind="external",
            equipment="dumbbell",
            weightKg="10,5",
        ),
    )
    earlier = database.add_set(pushups["id"], today, set_payload(time="08:12"))
    day = database.day(today)
    assert [section["exercise"]["name"] for section in day["sections"]] == ["Push-ups", "Squats"]
    assert [item["id"] for item in day["sections"][0]["sets"]] == [earlier["id"], first["id"]]
    assert day["sections"][0]["total"] == 30
    assert day["sections"][1]["sets"][0]["weightKg"] == "10.5"


def test_zero_weight_becomes_bodyweight(database):
    today = database.today().isoformat()
    exercise = next(item for item in database.list_exercises("active", "Dead", None))
    result = database.add_set(
        exercise["id"],
        today,
        set_payload(resistanceKind="external", equipment="barbell", weightKg="0"),
    )
    assert result["resistanceKind"] == "bodyweight"
    assert result["weightKg"] is None
    assert result["equipment"] is None


def test_duration_total(database):
    today = database.today().isoformat()
    plank = next(item for item in database.list_exercises("active", "Plank", None))
    for index, seconds in enumerate((30, 45, 60), start=1):
        database.add_set(
            plank["id"],
            today,
            set_payload(
                time=f"08:0{index}",
                repetitions=None,
                durationMinutes=seconds // 60,
                durationSeconds=seconds % 60,
            ),
        )
    assert database.day(today)["sections"][0]["total"] == 135


def test_measurement_types_cannot_be_mixed(database):
    today = database.today().isoformat()
    exercises = {item["name"]: item for item in database.list_exercises("active", "", None)}
    with pytest.raises(DomainError, match="cannot contain a duration"):
        database.add_set(exercises["Push-ups"]["id"], today, set_payload(durationSeconds=10))
    with pytest.raises(DomainError, match="cannot contain repetitions"):
        database.add_set(exercises["Plank"]["id"], today, set_payload(durationSeconds=10))


def test_previous_set_prefill_is_chronological(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], today, set_payload(time="08:00", repetitions=10))
    database.add_set(pushups["id"], today, set_payload(time="12:00", repetitions=20))
    assert database.prefill(pushups["id"], today, "10:00")["repetitions"] == 10
    assert database.prefill(pushups["id"], today, "13:00")["repetitions"] == 20


def test_deleting_final_set_removes_day_section(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    result = database.add_set(pushups["id"], today, set_payload())
    database.delete_set(result["id"])
    assert database.day(today)["sections"] == []


def test_used_exercise_cannot_be_deleted(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], today, set_payload())
    with pytest.raises(DomainError, match="cannot be deleted"):
        database.delete_exercise(pushups["id"], "DELETE")
    archived = database.archive_exercise(pushups["id"])
    assert archived["archivedAt"] is not None


def test_unused_exercise_requires_typed_confirmation(database):
    exercise = database.create_exercise(exercise_payload(name="Temporary"))
    with pytest.raises(DomainError, match="Type DELETE"):
        database.delete_exercise(exercise["id"], "delete")
    database.delete_exercise(exercise["id"], "DELETE")
    with pytest.raises(DomainError, match="not found"):
        database.exercise(exercise["id"])


def test_calendar_has_only_nonempty_days(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    result = database.add_set(pushups["id"], today, set_payload())
    assert database.calendar(today[:7])["activeDates"] == [today]
    database.delete_set(result["id"])
    assert database.calendar(today[:7])["activeDates"] == []


def test_backup_retention_is_per_category_and_on_demand_is_unlimited(database):
    for _ in range(7):
        database.create_backup("daily")
        database.create_backup("weekly")
        database.create_backup("on-demand")
    backups = database.list_backups()
    assert sum(item["category"] == "daily" for item in backups) == 5
    assert sum(item["category"] == "weekly" for item in backups) == 5
    assert sum(item["category"] == "on-demand" for item in backups) == 7


def test_restore_replaces_live_data_and_keeps_a_safety_backup(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], today, set_payload(repetitions=10))
    source = database.create_backup("on-demand")
    database.add_set(pushups["id"], today, set_payload(time="09:12", repetitions=20))

    result = database.restore_backup(source["id"], "RESTORE")

    assert database.day(today)["sections"][0]["total"] == 10
    safety_path = database.backup_path(result["safetyBackup"]["id"])
    with sqlite3.connect(safety_path) as connection:
        assert connection.execute("SELECT SUM(repetitions) FROM exercise_sets").fetchone()[0] == 30


def test_restore_rejects_bad_confirmation_without_creating_a_safety_backup(database):
    source = database.create_backup("on-demand")
    before = database.list_backups()

    with pytest.raises(DomainError, match="Type RESTORE"):
        database.restore_backup(source["id"], "restore")

    assert database.list_backups() == before


def test_restore_rejects_invalid_source_without_creating_a_safety_backup(database, tmp_path):
    source = tmp_path / "not-a-database.sqlite3"
    source.write_text("not sqlite")
    before = database.list_backups()

    with pytest.raises(DomainError, match="valid SQLite"):
        database.restore_path(source, "RESTORE", source="uploaded backup")

    assert database.list_backups() == before


def test_restore_rolls_back_when_post_restore_validation_fails(database, monkeypatch):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], today, set_payload(repetitions=10))
    source = database.create_backup("on-demand")
    database.add_set(pushups["id"], today, set_payload(time="09:12", repetitions=20))
    verify = database._verify_live_database
    calls = 0

    def fail_once():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise DomainError("simulated verification failure")
        verify()

    monkeypatch.setattr(database, "_verify_live_database", fail_once)
    with pytest.raises(DomainError, match="rolled back"):
        database.restore_backup(source["id"], "RESTORE")

    assert database.day(today)["sections"][0]["total"] == 30


@pytest.mark.parametrize(
    ("statement", "message"),
    [
        ("UPDATE backup_metadata SET app_id = 'other-app' WHERE id = 1", "not a Rostam"),
        ("INSERT INTO schema_migrations(version) VALUES (2)", "schema is newer"),
    ],
)
def test_restore_rejects_incompatible_backup_without_creating_a_safety_backup(
    database, statement, message
):
    source = database.create_backup("on-demand")
    with sqlite3.connect(database.backup_path(source["id"])) as connection:
        connection.execute(statement)
        connection.commit()
    before = database.list_backups()

    with pytest.raises(DomainError, match=message):
        database.restore_backup(source["id"], "RESTORE")

    assert database.list_backups() == before


def test_restore_rejects_path_traversal(database):
    with pytest.raises(DomainError, match="Invalid backup identifier"):
        database.restore_backup("../outside.sqlite3", "RESTORE")
