from __future__ import annotations

import sqlite3
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.config import Settings
from app.database import DomainError, MonsterSetsDatabase


def exercise_payload(**overrides):
    values = {
        "baseName": "Wall sit",
        "measurementType": "duration",
        "equipment": None,
        "customEquipment": None,
        "allowBodyweight": True,
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
        database.create_exercise(exercise_payload(baseName="  WALL   SIT "))


def test_equipment_is_part_of_generated_title_and_uniqueness(database):
    first = database.create_exercise(
        exercise_payload(
            baseName="Squats",
            measurementType="repetitions",
            equipment="barbell",
            allowBodyweight=False,
        )
    )
    second = database.create_exercise(
        exercise_payload(
            baseName="Squats",
            measurementType="repetitions",
            equipment="resistance_band",
        )
    )

    assert first["name"] == "Squats (Barbell)"
    assert second["name"] == "Squats (Resistance Bands)"
    with pytest.raises(DomainError, match="already exists"):
        database.create_exercise(
            exercise_payload(
                baseName=" SQUATS ",
                measurementType="repetitions",
                equipment="barbell",
                allowBodyweight=False,
            )
        )


def test_fixed_equipment_is_used_for_external_sets(database):
    today = database.today().isoformat()
    exercise = database.create_exercise(
        exercise_payload(
            baseName="Press",
            measurementType="repetitions",
            equipment="resistance_band",
        )
    )

    result = database.add_set(
        exercise["id"], today, set_payload(resistanceKind="external", weightKg="17.5")
    )

    assert result["equipment"] == "resistance_band"
    assert result["weightKg"] == "17.5"


def test_mixed_resistance_sets_total_and_stable_day_order(database):
    today = database.today().isoformat()
    exercises = {item["name"]: item for item in database.list_exercises("active", "", None)}
    pushups = exercises["Push-ups"]
    deadlifts = exercises["Deadlifts"]
    first = database.add_set(pushups["id"], today, set_payload(time="10:21"))
    database.add_set(
        deadlifts["id"],
        today,
        set_payload(
            time="09:36",
            resistanceKind="external",
            weightKg="10,5",
        ),
    )
    earlier = database.add_set(pushups["id"], today, set_payload(time="08:12"))
    day = database.day(today)
    assert [section["exercise"]["name"] for section in day["sections"]] == ["Push-ups", "Deadlifts"]
    assert [item["id"] for item in day["sections"][0]["sets"]] == [earlier["id"], first["id"]]
    assert day["sections"][0]["total"] == 30
    assert day["sections"][1]["sets"][0]["weightKg"] == "10.5"


def test_zero_weight_requires_bodyweight_to_be_allowed(database):
    today = database.today().isoformat()
    exercise = next(item for item in database.list_exercises("active", "Dead", None))
    with pytest.raises(DomainError, match="Bodyweight is not allowed"):
        database.add_set(exercise["id"], today, set_payload())
    with pytest.raises(DomainError, match="greater than zero"):
        database.add_set(
            exercise["id"],
            today,
            set_payload(resistanceKind="external", weightKg="0"),
        )

    exercise = database.create_exercise(
        exercise_payload(
            baseName="Band press",
            measurementType="repetitions",
            equipment="resistance_band",
        )
    )
    result = database.add_set(
        exercise["id"], today, set_payload(resistanceKind="external", weightKg="0")
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
    exercise = database.create_exercise(exercise_payload(baseName="Temporary"))
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


def test_schema_v1_migration_converts_recorded_exercises_without_losing_history(tmp_path):
    path = tmp_path / "legacy.sqlite3"
    timestamp = "2026-09-13T08:00:00+00:00"
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO schema_migrations(version) VALUES (1);
            CREATE TABLE exercises (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                seed_key TEXT UNIQUE,
                name TEXT NOT NULL,
                normalized_name TEXT NOT NULL UNIQUE,
                measurement_type TEXT NOT NULL,
                default_resistance_kind TEXT NOT NULL,
                default_equipment TEXT,
                default_custom_equipment TEXT,
                default_weight_grams INTEGER,
                image_key TEXT,
                archived_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE exercise_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exercise_id INTEGER NOT NULL,
                entry_date TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                repetitions INTEGER,
                duration_seconds INTEGER,
                resistance_kind TEXT NOT NULL,
                weight_grams INTEGER,
                equipment TEXT,
                custom_equipment TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
            );
            """
        )
        exercises = (
            (1, "Ab Rollouts", "bodyweight", None),
            (2, "Overhead Press RB", "external", "resistance_band"),
            (3, "Squats", "external", "resistance_band"),
            (4, "Band pull-aparts", "external", "resistance_band"),
            (5, "Bicep curls", "external", "resistance_band"),
            (6, "Deadlifts", "external", "barbell"),
        )
        for exercise_id, name, resistance, equipment in exercises:
            connection.execute(
                """
                INSERT INTO exercises(
                    id, name, normalized_name, measurement_type,
                    default_resistance_kind, default_equipment, created_at, updated_at
                ) VALUES (?, ?, ?, 'repetitions', ?, ?, ?, ?)
                """,
                (exercise_id, name, name.casefold(), resistance, equipment, timestamp, timestamp),
            )
            connection.execute(
                """
                INSERT INTO exercise_sets(
                    id, exercise_id, entry_date, occurred_at, repetitions,
                    resistance_kind, weight_grams, equipment, created_at, updated_at
                ) VALUES (?, ?, '2026-09-13', ?, 12, ?, ?, ?, ?, ?)
                """,
                (
                    exercise_id,
                    exercise_id,
                    timestamp,
                    resistance,
                    None if resistance == "bodyweight" else 15000,
                    equipment,
                    timestamp,
                    timestamp,
                ),
            )
        connection.commit()

    migrated = MonsterSetsDatabase(
        Settings(
            database_path=path,
            timezone_name="Europe/Warsaw",
            timezone=ZoneInfo("Europe/Warsaw"),
        )
    )
    by_id = {item["id"]: item for item in migrated.list_exercises("all", "", None)}

    assert by_id[1]["name"] == "Ab Rollouts"
    assert by_id[1]["equipment"] is None
    assert by_id[1]["allowBodyweight"] is True
    assert by_id[1]["hasHistory"] is True
    assert [by_id[index]["name"] for index in range(2, 6)] == [
        "Overhead Press (Resistance Bands)",
        "Squats (Resistance Bands)",
        "Band pull-aparts (Resistance Bands)",
        "Bicep curls (Resistance Bands)",
    ]
    assert all(by_id[index]["equipment"] == "resistance_band" for index in range(2, 6))
    assert all(by_id[index]["allowBodyweight"] for index in range(2, 6))
    assert by_id[6]["name"] == "Deadlifts"
    assert by_id[6]["equipment"] == "barbell"
    assert by_id[6]["allowBodyweight"] is False
    assert (
        migrated.update_exercise(
            6,
            SimpleNamespace(baseName="Deadlift", defaultWeightKg=None, imageKey="deadlift"),
        )["name"]
        == "Deadlift"
    )
    assert (
        migrated.update_exercise(
            3,
            SimpleNamespace(baseName="Front Squats", defaultWeightKg=None, imageKey="squat"),
        )["name"]
        == "Front Squats (Resistance Bands)"
    )
    with migrated.connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM exercise_sets").fetchone()[0] == 6
        assert connection.execute("SELECT SUM(repetitions) FROM exercise_sets").fetchone()[0] == 72
        assert connection.execute("PRAGMA foreign_key_check").fetchone() is None
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert [row[0] for row in connection.execute("SELECT version FROM schema_migrations")] == [
            1,
            2,
        ]


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
        ("INSERT INTO schema_migrations(version) VALUES (3)", "schema is newer"),
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
