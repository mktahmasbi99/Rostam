from __future__ import annotations

import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from io import BytesIO
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest
from PIL import Image
from pillow_heif import from_pillow

from app.config import Settings
from app.database import (
    PHOTO_SUMMARY_COLUMNS,
    DomainError,
    RostamDatabase,
    parse_weight_grams,
)


def exercise_payload(**overrides):
    values = {
        "baseName": "Wall sit",
        "measurementType": "duration",
        "equipment": None,
        "customEquipment": None,
        "allowBodyweight": True,
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
        "holdMinutes": None,
        "holdSeconds": None,
        "resistanceKind": "bodyweight",
        "weightKg": None,
        "enrollInRotation": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def measurement_payload(**overrides):
    values = {"date": "2026-09-16", "weightKg": "82.4", "waistCm": "91.5"}
    values.update(overrides)
    return SimpleNamespace(**values)


def profile_payload(**overrides):
    values = {"heightCm": "181.5", "dateOfBirth": "1990-09-17"}
    values.update(overrides)
    return SimpleNamespace(**values)


def image_upload() -> bytes:
    output = BytesIO()
    Image.new("RGB", (8, 8), "#995c12").save(output, format="PNG")
    return output.getvalue()


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


def test_database_identity_migrates_without_changing_ledger_data(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], today, set_payload(repetitions=23))
    with sqlite3.connect(database.path) as connection:
        connection.execute("UPDATE backup_metadata SET app_id = 'historical-app' WHERE id = 1")
        connection.execute("DELETE FROM schema_migrations WHERE version = 11")
        connection.commit()

    migrated = RostamDatabase(database.settings)

    assert migrated.day(today)["sections"][0]["total"] == 23
    with migrated.connect() as connection:
        assert (
            connection.execute("SELECT app_id FROM backup_metadata WHERE id = 1").fetchone()[0]
            == "rostam"
        )
        assert connection.execute("SELECT 1 FROM schema_migrations WHERE version = 11").fetchone()


def test_new_backups_use_the_rostam_identity(database):
    backup = database.create_backup("on-demand")

    with sqlite3.connect(database.backup_path(backup["id"])) as connection:
        assert (
            connection.execute("SELECT app_id FROM backup_metadata WHERE id = 1").fetchone()[0]
            == "rostam"
        )


def test_seed_muscles_and_recommendations_are_optional_and_date_aware(database, monkeypatch):
    monkeypatch.setattr(database, "today", lambda: date(2026, 9, 17))
    exercises = {item["name"]: item for item in database.list_exercises("active", "", None)}
    assert exercises["Push-ups"]["primaryMuscle"] == "chest"
    assert exercises["Push-ups"]["secondaryMuscles"] == ["abs", "shoulders", "triceps"]
    custom = database.create_exercise(exercise_payload(baseName="Custom movement"))
    assert custom["primaryMuscle"] is None
    database.add_set(exercises["Push-ups"]["id"], "2026-09-03", set_payload(repetitions=10))
    recommendations = database.exercise_recommendations(
        "2026-09-17", "", None, None, "any", False, "recommended"
    )
    chest = next(group for group in recommendations["groups"] if group["muscle"] == "chest")
    assert chest["daysSinceLastTrained"] == 14
    assert custom in [item["exercise"] for item in recommendations["neverTried"]]


def test_recommendation_pause_uses_calendar_months(database, monkeypatch):
    monkeypatch.setattr(database, "today", lambda: date(2026, 1, 31))
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    paused = database.update_recommendation_pause(pushups["id"], "month")
    assert paused["recommendationPausedUntil"] == "2026-02-28"
    assert (
        database.update_recommendation_pause(pushups["id"], "resume")["recommendationPausedUntil"]
        is None
    )


def test_body_measurements_and_profile_validate_and_keep_optional_values(database, monkeypatch):
    monkeypatch.setattr(database, "today", lambda: __import__("datetime").date(2026, 9, 17))
    assert database.profile() == {"heightCm": None, "dateOfBirth": None, "age": None}
    profile = database.update_profile(profile_payload())
    assert profile == {"heightCm": "181.5", "dateOfBirth": "1990-09-17", "age": 36}
    created = database.create_body_measurement(measurement_payload(waistCm=None))
    assert created["weightKg"] == "82.4"
    assert created["waistCm"] is None
    waist = database.create_body_measurement(measurement_payload(weightKg=None))
    assert waist["waistCm"] == "91.5"
    updated = database.update_body_measurement(
        created["id"], measurement_payload(date="2026-09-15", waistCm=None)
    )
    assert updated["weightKg"] == "82.4"
    assert updated["waistCm"] is None
    with pytest.raises(DomainError, match="exactly one"):
        database.create_body_measurement(measurement_payload(weightKg=None, waistCm=None))
    with pytest.raises(DomainError, match="exactly one"):
        database.create_body_measurement(measurement_payload())
    with pytest.raises(DomainError, match="positive"):
        database.create_body_measurement(measurement_payload(date="2026-09-14", weightKg="0"))
    with pytest.raises(DomainError, match="Future dates"):
        database.create_body_measurement(measurement_payload(date="2026-09-18"))
    with pytest.raises(DomainError, match="future"):
        database.update_profile(profile_payload(dateOfBirth="2026-09-18"))
    database.delete_body_measurement(created["id"])
    assert database.body_measurement_page(None, None, 50)["items"] == [waist]


def test_archive_pages_use_stable_cursors_and_measurement_trends_cover_full_history(database):
    first = database.create_body_measurement(
        measurement_payload(date="2026-09-14", weightKg="80", waistCm=None)
    )
    same_day = database.create_body_measurement(
        measurement_payload(date="2026-09-14", weightKg=None, waistCm="90")
    )
    newest = database.create_body_measurement(
        measurement_payload(date="2026-09-15", weightKg="79", waistCm=None)
    )
    page = database.body_measurement_page(None, None, 2)
    assert page["items"] == [newest, same_day]
    older = database.body_measurement_page(page["nextBeforeDate"], page["nextBeforeId"], 2)
    assert older["items"] == [first]
    assert older["nextBeforeDate"] is None
    trends = database.body_measurement_trends()
    assert trends["latest"]["weight"]["value"] == "79"
    assert trends["latest"]["waist"]["value"] == "90"
    assert len(trends["trends"]["weight"]) == 2

    for day in ("2026-09-13", "2026-09-14", "2026-09-15"):
        database.update_daily_note(day, f"Note {day}")
    daily = database.list_daily_notes(limit=2)
    assert [note["date"] for note in daily["items"]] == ["2026-09-15", "2026-09-14"]
    assert [
        note["date"] for note in database.list_daily_notes(daily["nextBeforeDate"], 2)["items"]
    ] == ["2026-09-13"]


@pytest.mark.parametrize("value", ["20260916", "2026-W38-2", "2026-13-01"])
def test_dates_require_calendar_format(database, value):
    with pytest.raises(DomainError, match="YYYY-MM-DD"):
        database.day(value)


def test_dates_are_canonical_before_persistence(database, monkeypatch):
    monkeypatch.setattr(database, "today", lambda: date(2026, 9, 17))
    pushups = next(item for item in database.list_exercises("active", "Push", None))

    with pytest.raises(DomainError, match="YYYY-MM-DD"):
        database.add_set(pushups["id"], "20260916", set_payload())
    with pytest.raises(DomainError, match="YYYY-MM-DD"):
        database.create_body_measurement(measurement_payload(date="2026-W38-2", waistCm=None))
    with pytest.raises(DomainError, match="YYYY-MM-DD"):
        database.update_profile(profile_payload(dateOfBirth="1990-W01-1"))


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity", "1e1000000"])
def test_weight_rejects_non_finite_and_extreme_values(value):
    with pytest.raises(DomainError):
        parse_weight_grams(value, allow_blank=False)


def test_numeric_limits_are_enforced(database, monkeypatch):
    monkeypatch.setattr(database, "today", lambda: date(2026, 9, 17))
    assert parse_weight_grams("10000", allow_blank=False) == 10_000_000
    with pytest.raises(DomainError, match="at most"):
        parse_weight_grams("10000.001", allow_blank=False)
    with pytest.raises(DomainError, match="negative"):
        parse_weight_grams("-1", allow_blank=False)

    profile = database.update_profile(profile_payload(heightCm="300"))
    assert profile["heightCm"] == "300"
    with pytest.raises(DomainError, match="at most"):
        database.update_profile(profile_payload(heightCm="300.1"))
    for value in ("NaN", "Infinity", "-Infinity"):
        with pytest.raises(DomainError, match="finite"):
            database.update_profile(profile_payload(heightCm=value))
    with pytest.raises(DomainError, match="at most"):
        database.update_profile(profile_payload(heightCm="1e1000000"))

    waist = database.create_body_measurement(measurement_payload(weightKg=None, waistCm="500"))
    assert waist["waistCm"] == "500"
    with pytest.raises(DomainError, match="at most"):
        database.create_body_measurement(
            measurement_payload(date="2026-09-15", weightKg=None, waistCm="500.1")
        )
    for value in ("NaN", "Infinity", "-Infinity"):
        with pytest.raises(DomainError, match="finite"):
            database.create_body_measurement(
                measurement_payload(date="2026-09-15", weightKg=None, waistCm=value)
            )
    with pytest.raises(DomainError, match="at most"):
        database.create_body_measurement(
            measurement_payload(date="2026-09-15", weightKg=None, waistCm="1e1000000")
        )

    pushups = next(item for item in database.list_exercises("active", "Push", None))
    maximum = database.add_set(pushups["id"], "2026-09-17", set_payload(repetitions=1_000_000))
    assert maximum["repetitions"] == 1_000_000
    with pytest.raises(DomainError, match="at most"):
        database.add_set(pushups["id"], "2026-09-17", set_payload(repetitions=1_000_001))


def test_occurrences_reject_nonexistent_and_ambiguous_dst_times(database, monkeypatch):
    monkeypatch.setattr(database, "today", lambda: date(2026, 9, 17))
    pushups = next(item for item in database.list_exercises("active", "Push", None))

    normal = database.add_set(pushups["id"], "2026-03-28", set_payload(time="02:30"))
    assert normal["time"] == "02:30"
    editable = database.add_set(pushups["id"], "2026-03-29", set_payload(time="01:30"))
    with pytest.raises(DomainError, match="does not exist"):
        database.add_set(pushups["id"], "2026-03-29", set_payload(time="02:30"))
    with pytest.raises(DomainError, match="does not exist"):
        database.update_set(editable["id"], set_payload(time="02:30"))
    with pytest.raises(DomainError, match="ambiguous"):
        database.add_set(pushups["id"], "2025-10-26", set_payload(time="02:30"))


def test_photo_summaries_exclude_blobs_and_photo_endpoints_return_them(database):
    assert "jpeg" not in PHOTO_SUMMARY_COLUMNS
    assert "thumbnail_jpeg" not in PHOTO_SUMMARY_COLUMNS

    photos = database.add_daily_photos(database.today().isoformat(), [image_upload()])

    assert database.list_daily_photos(database.today().isoformat()) == photos
    assert database.list_photos()["items"][0]["photos"] == photos
    assert database.photo_data(photos[0]["id"], thumbnail=False).startswith(b"\xff\xd8")
    assert database.photo_data(photos[0]["id"], thumbnail=True).startswith(b"\xff\xd8")


def test_exercise_image_is_stored_as_a_small_display_variant(database):
    output = BytesIO()
    Image.new("RGB", (1200, 600), "#995c12").save(output, format="JPEG")

    image_key = database.store_exercise_image(output.getvalue())

    with Image.open(BytesIO(database.exercise_image_data(image_key))) as stored:
        assert stored.format == "JPEG"
        assert stored.size == (512, 256)


def test_exercise_image_variant_survives_backup_and_restore(database):
    output = BytesIO()
    Image.new("RGB", (1200, 600), "#995c12").save(output, format="JPEG")
    image_key = database.store_exercise_image(output.getvalue())
    expected = database.exercise_image_data(image_key)
    backup = database.create_backup("on-demand")

    database.restore_backup(backup["id"], "RESTORE")

    assert database.exercise_image_data(image_key) == expected


def test_photo_processing_rejects_decompression_heavy_images(database, monkeypatch):
    import app.database as database_module

    monkeypatch.setattr(database_module, "MAX_DECODED_IMAGE_PIXELS", 10)
    output = BytesIO()
    Image.new("RGB", (4, 4), "#995c12").save(output, format="PNG")

    with pytest.raises(DomainError, match="80 megapixels"):
        database.add_daily_photos(database.today().isoformat(), [output.getvalue()])


def test_photo_processing_preserves_exif_orientation(database):
    output = BytesIO()
    exif = Image.Exif()
    exif[274] = 6
    Image.new("RGB", (1200, 600), "#995c12").save(output, format="JPEG", exif=exif)

    _, _, width, height = database._process_photo(output.getvalue())

    assert (width, height) == (600, 1200)


@pytest.mark.parametrize("image_format", ["JPEG", "PNG", "WEBP", "HEIF"])
def test_photo_processing_accepts_supported_image_formats(database, image_format):
    output = BytesIO()
    image = Image.new("RGB", (24, 16), "#995c12")
    if image_format == "HEIF":
        from_pillow(image).save(output, format="HEIF")
    else:
        image.save(output, format=image_format)

    jpeg, thumbnail, width, height = database._process_photo(output.getvalue())

    assert jpeg.startswith(b"\xff\xd8")
    assert thumbnail.startswith(b"\xff\xd8")
    assert (width, height) == (24, 16)


def test_daily_photo_limit_is_authoritative_and_transactional(database):
    day = database.today().isoformat()
    photos = database.add_daily_photos(day, [image_upload() for _ in range(9)])

    with pytest.raises(DomainError, match="at most 10 photos"):
        database.add_daily_photos(day, [image_upload(), image_upload()])

    assert len(database.list_daily_photos(day)) == len(photos) == 9


def test_invalid_photo_in_batch_does_not_partially_save(database):
    day = database.today().isoformat()

    with pytest.raises(DomainError, match="valid JPEG"):
        database.add_daily_photos(day, [image_upload(), b"not an image"])

    assert database.list_daily_photos(day) == []


def test_concurrent_daily_photo_uploads_cannot_exceed_limit(database):
    day = database.today().isoformat()

    def upload_six():
        try:
            database.add_daily_photos(day, [image_upload() for _ in range(6)])
            return "saved"
        except DomainError:
            return "rejected"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(executor.map(lambda _: upload_six(), range(2)))

    assert sorted(outcomes) == ["rejected", "saved"]
    assert len(database.list_daily_photos(day)) == 6


def test_photo_pages_keep_each_date_group_intact(database):
    older = database.add_daily_photos("2026-09-14", [image_upload(), image_upload()])
    newer = database.add_daily_photos("2026-09-15", [image_upload()])
    first = database.list_photos(limit=1)
    assert first["items"][0]["date"] == "2026-09-15"
    assert first["items"][0]["photos"] == newer
    older_page = database.list_photos(first["nextBeforeDate"], limit=1)
    assert older_page["items"][0]["photos"] == older
    assert older_page["nextBeforeDate"] is None


def test_archive_cursors_walk_a_three_year_synthetic_history_without_duplicates(database):
    start = date(2023, 1, 1)
    days = [(start + timedelta(days=offset)).isoformat() for offset in range(1100)]
    now = "2026-01-01T00:00:00+00:00"
    with database.connect() as connection:
        connection.executemany(
            "INSERT INTO daily_notes(entry_date, body, created_at, updated_at) VALUES (?, ?, ?, ?)",
            [(day, f"Note {day}", now, now) for day in days],
        )
        connection.executemany(
            "INSERT INTO daily_photos(entry_date, display_order, jpeg, thumbnail_jpeg, width, height, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(day, order, b"jpg", b"thumb", 1, 1, now) for day in days for order in (1, 2)],
        )
        connection.executemany(
            "INSERT INTO body_measurements(entry_date, measurement_type, weight_grams, waist_mm, created_at, updated_at) "
            "VALUES (?, 'weight', ?, NULL, ?, ?)",
            [(day, 80000 + index, now, now) for index, day in enumerate(days)],
        )
        connection.execute(
            "INSERT INTO activities(name, normalized_name, created_at) VALUES ('Archive test', 'archive-test', ?)",
            (now,),
        )
        activity_id = connection.execute("SELECT last_insert_rowid()").fetchone()[0]
        connection.executemany(
            "INSERT INTO activity_entries(activity_id, started_at, ended_at, note, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            [
                (
                    activity_id,
                    f"{day}T10:00:00.000000+00:00",
                    f"{day}T11:00:00.000000+00:00",
                    f"Activity {day}",
                    now,
                    now,
                )
                for day in days
            ],
        )
        connection.commit()

    daily_dates: list[str] = []
    cursor = None
    while True:
        page = database.list_daily_notes(cursor, 30)
        daily_dates.extend(note["date"] for note in page["items"])
        cursor = page["nextBeforeDate"]
        if cursor is None:
            break
    assert daily_dates == list(reversed(days))

    photo_dates: list[str] = []
    photo_page_bytes: list[int] = []
    cursor = None
    while True:
        page = database.list_photos(cursor, 20)
        photo_dates.extend(group["date"] for group in page["items"])
        assert all(len(group["photos"]) == 2 for group in page["items"])
        photo_page_bytes.append(len(json.dumps(page, separators=(",", ":"))))
        cursor = page["nextBeforeDate"]
        if cursor is None:
            break
    assert photo_dates == list(reversed(days))
    assert max(photo_page_bytes) < 20 * 1024
    assert sum(photo_page_bytes) > max(photo_page_bytes) * 10

    measurement_dates: list[str] = []
    before_date = before_id = None
    while True:
        page = database.body_measurement_page(before_date, before_id, 50)
        measurement_dates.extend(item["date"] for item in page["items"])
        before_date, before_id = page["nextBeforeDate"], page["nextBeforeId"]
        if before_date is None:
            break
    assert measurement_dates == list(reversed(days))
    trends = database.body_measurement_trends()
    assert len(trends["trends"]["weight"]) <= 100
    assert trends["latest"]["weight"]["date"] == days[-1]

    activity_items: list[dict] = []
    before_started_at = before_id = None
    while True:
        page = database.activity_notes(before_started_at, before_id, 30)
        activity_items.extend(page["items"])
        before_started_at = page["nextBeforeStartedAt"]
        before_id = page["nextBeforeId"]
        if before_started_at is None:
            break
    assert len(activity_items) == len(days)
    assert len({item["id"] for item in activity_items}) == len(days)
    assert [item["date"] for item in activity_items] == list(reversed(days))


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
            equipment="resistance_tube",
        )
    )

    result = database.add_set(
        exercise["id"], today, set_payload(resistanceKind="external", weightKg="17.5")
    )

    assert exercise["name"] == "Press (Resistance tubes)"
    assert "defaultWeightKg" not in exercise
    assert result["equipment"] == "resistance_tube"
    assert result["weightKg"] == "17.5"


def test_prefill_without_a_previous_set_has_no_default_weight(database):
    exercise = database.create_exercise(
        exercise_payload(
            baseName="Press",
            measurementType="repetitions",
            equipment="resistance_tube",
        )
    )

    prefill = database.prefill(exercise["id"], "2000-01-01", "12:00")

    assert prefill["source"] == "defaults"
    assert prefill["weightKg"] is None


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
    assert all(section["exercise"]["hasHistory"] for section in day["sections"])
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


def test_timed_repetitions_validate_prefill_and_total(database):
    today = (database.today() - __import__("datetime").timedelta(days=1)).isoformat()
    exercise = database.create_exercise(
        exercise_payload(baseName="Side Plank Leg Lift", measurementType="timed_repetitions")
    )
    first = database.add_set(
        exercise["id"],
        today,
        set_payload(time="08:00", repetitions=4, holdMinutes=0, holdSeconds=10),
    )
    database.add_set(
        exercise["id"],
        today,
        set_payload(time="08:30", repetitions=4, holdMinutes=1, holdSeconds=5),
    )

    assert first["holdMinutes"] == 0
    assert first["holdSeconds"] == 10
    assert database.day(today)["sections"][0]["total"] == 8
    prefill = database.prefill(exercise["id"], today, "08:45")
    assert (prefill["repetitions"], prefill["holdMinutes"], prefill["holdSeconds"]) == (4, 1, 5)
    with pytest.raises(DomainError, match="Hold duration"):
        database.add_set(exercise["id"], today, set_payload(repetitions=4))
    with pytest.raises(DomainError, match="cannot contain a duration"):
        database.add_set(
            exercise["id"],
            today,
            set_payload(repetitions=4, durationSeconds=10, holdSeconds=10),
        )


def test_measurement_types_cannot_be_mixed(database):
    today = database.today().isoformat()
    exercises = {item["name"]: item for item in database.list_exercises("active", "", None)}
    with pytest.raises(DomainError, match="cannot contain a duration"):
        database.add_set(exercises["Push-ups"]["id"], today, set_payload(durationSeconds=10))
    with pytest.raises(DomainError, match="cannot contain repetitions"):
        database.add_set(exercises["Plank"]["id"], today, set_payload(durationSeconds=10))


def test_previous_set_prefill_is_chronological(database):
    today = (database.today() - __import__("datetime").timedelta(days=1)).isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], today, set_payload(time="08:00", repetitions=10))
    database.add_set(pushups["id"], today, set_payload(time="12:00", repetitions=20))
    assert database.prefill(pushups["id"], today, "10:00")["repetitions"] == 10
    assert database.prefill(pushups["id"], today, "13:00")["repetitions"] == 20


def test_exercise_history_groups_days_and_paginates(database):
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], "2026-09-01", set_payload(time="08:00", repetitions=30))
    database.add_set(pushups["id"], "2026-09-01", set_payload(time="08:30", repetitions=50))
    database.add_set(pushups["id"], "2026-09-10", set_payload(time="09:00", repetitions=77))
    database.add_set(pushups["id"], "2026-09-17", set_payload(time="10:00", repetitions=12))

    first = database.exercise_history(pushups["id"], None, 2)
    assert [session["date"] for session in first["sessions"]] == ["2026-09-17", "2026-09-10"]
    assert first["sessions"][1]["total"] == 77
    assert [item["repetitions"] for item in first["sessions"][1]["sets"]] == [77]
    assert first["nextBeforeDate"] == "2026-09-10"

    older = database.exercise_history(pushups["id"], first["nextBeforeDate"], 2)
    assert [session["date"] for session in older["sessions"]] == ["2026-09-01"]
    assert older["nextBeforeDate"] is None

    before_day = database.exercise_history(pushups["id"], "2026-09-10", 10)
    assert [session["date"] for session in before_day["sessions"]] == ["2026-09-01"]


def test_exercise_history_rejects_invalid_limits(database):
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    with pytest.raises(DomainError, match="between 1 and 50"):
        database.exercise_history(pushups["id"], None, 0)
    with pytest.raises(DomainError, match="YYYY-MM-DD"):
        database.exercise_history(pushups["id"], "not-a-date", 10)


def test_deleting_final_set_removes_day_section(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    result = database.add_set(pushups["id"], today, set_payload())
    database.delete_set(result["id"])
    assert database.day(today)["sections"] == []


def test_used_exercise_can_be_deleted_after_typed_confirmation(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], today, set_payload())
    with pytest.raises(DomainError, match="Type DELETE"):
        database.delete_exercise(pushups["id"], "delete")

    database.delete_exercise(pushups["id"], "DELETE")

    with pytest.raises(DomainError, match="not found"):
        database.exercise(pushups["id"])
    assert database.day(today)["sections"] == []


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


def test_calendar_hides_future_exercise_records(database, monkeypatch):
    today = date(2026, 10, 27)
    monkeypatch.setattr(database, "today", lambda: today)
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    activity = database.create_activity("Future walk")
    future = datetime(2026, 10, 28, 9, tzinfo=database.settings.timezone).astimezone(
        ZoneInfo("UTC")
    )
    now = datetime.now(ZoneInfo("UTC")).isoformat()
    with database.connect() as connection:
        connection.execute(
            """INSERT INTO exercise_sets (
            exercise_id, entry_date, occurred_at, repetitions, resistance_kind,
            created_at, updated_at
            ) VALUES (?, ?, ?, 12, 'bodyweight', ?, ?)""",
            (pushups["id"], (today + timedelta(days=1)).isoformat(), future.isoformat(), now, now),
        )
        connection.execute(
            """INSERT INTO activity_entries (
            activity_id, started_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?)""",
            (activity["id"], future.isoformat(), now, now),
        )
        connection.commit()

    assert database.calendar("2026-10")["activeDates"] == []


def test_exercise_note_is_global_unrestricted_and_clearable(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], today, set_payload())
    body = "Keep elbows forward.\nhttps://example.com/technique\n" + ("x" * 10_000)

    saved = database.update_exercise_note(pushups["id"], body)

    assert saved["exerciseNote"] == body
    assert saved["hasHistory"] is True
    assert database.exercise(pushups["id"])["exerciseNote"] == body
    assert database.list_exercises("active", "Push", None)[0]["exerciseNote"] == body
    assert database.day(today)["sections"][0]["exercise"]["exerciseNote"] == body

    archived = database.archive_exercise(pushups["id"])
    assert archived["exerciseNote"] == body
    assert (
        database.update_exercise_note(pushups["id"], "Changed while archived")["exerciseNote"]
        == "Changed while archived"
    )
    assert database.update_exercise_note(pushups["id"], " \n\t")["exerciseNote"] is None


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

    migrated = RostamDatabase(
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
            SimpleNamespace(baseName="Deadlift", imageKey="deadlift"),
        )["name"]
        == "Deadlift"
    )
    assert (
        migrated.update_exercise(
            3,
            SimpleNamespace(baseName="Front Squats", imageKey="squat"),
        )["name"]
        == "Front Squats (Resistance Bands)"
    )
    with migrated.connect() as connection:
        assert connection.execute("SELECT COUNT(*) FROM exercise_sets").fetchone()[0] == 6
        assert connection.execute("SELECT SUM(repetitions) FROM exercise_sets").fetchone()[0] == 72
        assert connection.execute("PRAGMA foreign_key_check").fetchone() is None
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert [
            row[0] for row in connection.execute("SELECT version FROM schema_migrations")
        ] == list(range(1, 17))
        assert (
            connection.execute(
                "SELECT COUNT(*) FROM exercises WHERE exercise_note IS NOT NULL"
            ).fetchone()[0]
            == 0
        )
        connection.execute("UPDATE exercises SET default_weight_grams = 6000 WHERE id = 6")
        connection.execute("DELETE FROM schema_migrations WHERE version = 7")
        connection.commit()
    migrated.migrate()
    with migrated.connect() as connection:
        assert (
            connection.execute(
                "SELECT default_weight_grams FROM exercises WHERE id = 6"
            ).fetchone()[0]
            is None
        )


def test_schema_v2_migration_adds_notes_without_changing_history(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    saved_set = database.add_set(pushups["id"], today, set_payload(repetitions=17))
    with sqlite3.connect(database.path) as connection:
        connection.execute("DELETE FROM schema_migrations WHERE version = 3")
        connection.execute("ALTER TABLE exercises DROP COLUMN exercise_note")
        connection.commit()

    migrated = RostamDatabase(database.settings)

    assert migrated.exercise(pushups["id"])["exerciseNote"] is None
    assert migrated.day(today)["sections"][0]["sets"][0]["id"] == saved_set["id"]
    with migrated.connect() as connection:
        assert [
            row[0] for row in connection.execute("SELECT version FROM schema_migrations")
        ] == list(range(1, 17))
        assert connection.execute("PRAGMA foreign_key_check").fetchone() is None
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_backup_retention_is_per_category_and_on_demand_is_unlimited(database):
    for _ in range(7):
        database.create_backup("daily")
        database.create_backup("weekly")
        database.create_backup("on-demand")
    backups = database.list_backups()
    assert sum(item["category"] == "daily" for item in backups) == 7
    assert sum(item["category"] == "weekly" for item in backups) == 7
    assert sum(item["category"] == "on-demand" for item in backups) == 7


def test_restore_replaces_live_data_and_keeps_a_safety_backup(database):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], today, set_payload(repetitions=10))
    database.update_exercise_note(pushups["id"], "Original cue")
    source = database.create_backup("on-demand")
    database.add_set(pushups["id"], today, set_payload(time="09:12", repetitions=20))
    database.update_exercise_note(pushups["id"], "Changed cue")

    result = database.restore_backup(source["id"], "RESTORE")

    assert database.day(today)["sections"][0]["total"] == 10
    assert database.exercise(pushups["id"])["exerciseNote"] == "Original cue"
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


def test_restore_validates_staged_database_before_atomic_replacement(database, monkeypatch):
    today = database.today().isoformat()
    pushups = next(item for item in database.list_exercises("active", "Push", None))
    database.add_set(pushups["id"], today, set_payload(repetitions=10))
    source = database.create_backup("on-demand")
    database.add_set(pushups["id"], today, set_payload(time="09:12", repetitions=20))

    def fail_staged(_):
        raise DomainError("simulated staged validation failure")

    monkeypatch.setattr(RostamDatabase, "_verify_live_database", fail_staged)
    with pytest.raises(DomainError, match="staged validation"):
        database.restore_backup(source["id"], "RESTORE")

    assert database.day(today)["sections"][0]["total"] == 30


@pytest.mark.parametrize(
    ("statement", "message"),
    [
        ("UPDATE backup_metadata SET app_id = 'other-app' WHERE id = 1", "not a Rostam"),
        ("INSERT INTO schema_migrations(version) VALUES (17)", "schema is newer"),
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


def test_restore_schema_v7_backup_migrates_side_plank_history(database):
    today = (database.today() - __import__("datetime").timedelta(days=1)).isoformat()
    exercise = database.create_exercise(
        exercise_payload(baseName="Side Plank Leg Lift", measurementType="repetitions")
    )
    for time_value in ("08:00", "08:30"):
        database.add_set(exercise["id"], today, set_payload(time=time_value, repetitions=4))
    source = database.create_backup("on-demand")
    with sqlite3.connect(database.backup_path(source["id"])) as connection:
        connection.execute("DELETE FROM schema_migrations WHERE version IN (8, 9, 10)")
        connection.commit()

    database.restore_backup(source["id"], "RESTORE")

    restored = database.exercise(exercise["id"])
    assert restored["measurementType"] == "timed_repetitions"
    sets = database.day(today)["sections"][0]["sets"]
    assert [(item["repetitions"], item["holdMinutes"], item["holdSeconds"]) for item in sets] == [
        (4, 0, 10),
        (4, 0, 10),
    ]


def test_restore_keeps_current_backup_policy_and_import_creates_safety_copy(database):
    source = database.create_backup("on-demand")
    policy = database.backup_settings()
    policy["dailyRetention"] = 13
    database.update_backup_settings(policy)

    database.restore_backup(source["id"], "RESTORE")
    assert database.backup_settings()["dailyRetention"] == 13

    legacy = database.path.parent / "legacy.sqlite3"
    database._copy_database(database.path, legacy)
    with sqlite3.connect(legacy) as connection:
        connection.execute("DROP TABLE backup_metadata")
        connection.commit()
    result = database.import_path(legacy, "IMPORT", source="legacy.sqlite3")
    assert result["safetyBackup"]["category"] == "pre-import"
    with database.connect() as connection:
        assert connection.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        assert connection.execute("PRAGMA foreign_key_check").fetchone() is None


def test_rotation_activation_cycles_skip_and_break(database, monkeypatch):
    day = date(2026, 10, 20)
    monkeypatch.setattr(
        database,
        "now_local",
        lambda: datetime.combine(day, datetime.min.time()).replace(
            hour=20, tzinfo=database.settings.timezone
        ),
    )
    exercises = database.list_exercises("active", "", None)
    a, b, c = [
        item["id"]
        for item in exercises
        if item["equipment"] is None and item["measurementType"] == "repetitions"
    ]
    first = database.create_rotation("Morning")
    second = database.create_rotation("Evening")
    database.set_rotation_members(first["id"], [a, b, c])
    database.set_rotation_members(second["id"], [b])
    assert database.activate_rotation(first["id"], a)["dueExerciseId"] == a
    assert sum(item["active"] for item in database.rotations()) == 1
    database.add_set(a, day.isoformat(), set_payload(enrollInRotation=None))
    database.add_set(a, day.isoformat(), set_payload(time="09:00"))
    assert database.rotations()[0]["resolvedToday"] == "completed"
    day += timedelta(days=1)
    assert database.rotations()[0]["dueExerciseId"] == b
    day += timedelta(days=1)
    assert database.rotations()[0]["dueExerciseId"] == b
    database.skip_rotation_today(first["id"])
    assert database.rotations()[0]["resolvedToday"] == "skipped"
    database.skip_rotation_today(first["id"], undo=True)
    assert database.rotations()[0]["resolvedToday"] is None
    database.skip_rotation_today(first["id"])
    day += timedelta(days=1)
    assert database.rotations()[0]["dueExerciseId"] == c
    database.activate_rotation(second["id"], b)
    assert [item["active"] for item in database.rotations()] == [False, True]
    assert database.activate_rotation(first["id"], a)["dueExerciseId"] == a


def test_rotation_enrollment_order_and_time_correction(database, monkeypatch):
    day = date(2026, 10, 20)
    monkeypatch.setattr(
        database,
        "now_local",
        lambda: datetime.combine(day, datetime.min.time()).replace(
            hour=20, tzinfo=database.settings.timezone
        ),
    )
    ids = [
        item["id"]
        for item in database.list_exercises("active", "", None)
        if item["equipment"] is None and item["measurementType"] == "repetitions"
    ]
    ids += [
        database.create_exercise(
            exercise_payload(baseName=f"New {index}", measurementType="repetitions")
        )["id"]
        for index in range(2)
    ]
    due, early, newcomer_a, newcomer_b = ids[:4]
    rotation = database.create_rotation("Cycle")
    rotation_id = rotation["id"]
    database.set_rotation_members(rotation_id, [due, early])
    database.activate_rotation(rotation_id, due)
    database.add_set(early, day.isoformat(), set_payload())
    assert database.rotations()[0]["dueExerciseId"] == due
    with pytest.raises(DomainError, match="Choose Add"):
        database.add_set(newcomer_a, day.isoformat(), set_payload())
    database.add_set(newcomer_b, day.isoformat(), set_payload(enrollInRotation=False))
    assert [item["exercise"]["id"] for item in database.rotations()[0]["members"]] == [due, early]
    first = database.add_set(
        newcomer_a, day.isoformat(), set_payload(time="12:00", enrollInRotation=True)
    )
    # An exercise explicitly recorded without enrolling is not prompted again today.
    assert newcomer_b not in [item["exercise"]["id"] for item in database.rotations()[0]["members"]]
    another = ids[4]
    next_set = database.add_set(
        another, day.isoformat(), set_payload(time="13:00", enrollInRotation=True)
    )
    assert [item["exercise"]["id"] for item in database.rotations()[0]["members"]] == [
        due,
        newcomer_a,
        another,
        early,
    ]
    database.update_set(next_set["id"], set_payload(time="10:00"))
    assert [item["exercise"]["id"] for item in database.rotations()[0]["members"]] == [
        due,
        another,
        newcomer_a,
        early,
    ]
    database.set_rotation_members(rotation_id, [due, newcomer_a, early, another])
    database.update_set(next_set["id"], set_payload(time="09:00"))
    assert [item["exercise"]["id"] for item in database.rotations()[0]["members"]] == [
        due,
        newcomer_a,
        early,
        another,
    ]
    database.add_set(due, day.isoformat(), set_payload())
    day += timedelta(days=1)
    assert database.rotations()[0]["dueExerciseId"] == early
    assert first["id"] != next_set["id"]


def test_rotation_state_survives_backup_restore_and_archive_removes_member(database):
    exercise = next(item for item in database.list_exercises("active", "Push-ups", None))
    rotation = database.create_rotation("Cycle")
    database.set_rotation_members(rotation["id"], [exercise["id"]])
    database.activate_rotation(rotation["id"], exercise["id"])
    backup = database.create_backup("on-demand")
    database.delete_rotation(rotation["id"])
    database.restore_backup(backup["id"], "RESTORE")
    restored = database.rotations()[0]
    assert restored["name"] == "Cycle"
    assert restored["active"] is True
    assert restored["members"][0]["exercise"]["id"] == exercise["id"]
    database.archive_exercise(exercise["id"])
    assert database.rotations()[0]["members"] == []
    assert database.rotations()[0]["dueExerciseId"] is None


def test_rotation_archive_and_restore_preserve_members_and_deactivate(database):
    exercise = database.list_exercises("active", "Push", None)[0]
    rotation = database.create_rotation("Archived cycle")
    database.set_rotation_members(rotation["id"], [exercise["id"]])
    database.activate_rotation(rotation["id"], exercise["id"])

    archived = database.archive_rotation(rotation["id"])

    assert archived["active"] is False
    assert archived["archivedAt"]
    assert database.rotations() == []
    assert database.rotations("archived")[0]["members"][0]["exercise"]["id"] == exercise["id"]

    restored = database.archive_rotation(rotation["id"], archived=False)
    assert restored["archivedAt"] is None
    assert [item["id"] for item in database.rotations()] == [rotation["id"]]


def test_logging_skipped_due_exercise_marks_it_completed_today(database):
    exercise = next(item for item in database.list_exercises("active", "Push-ups", None))
    rotation = database.create_rotation("Cycle")
    database.set_rotation_members(rotation["id"], [exercise["id"]])
    database.activate_rotation(rotation["id"], exercise["id"])
    database.skip_rotation_today(rotation["id"])
    database.add_set(exercise["id"], database.today().isoformat(), set_payload())
    assert database.rotations()[0]["resolvedToday"] == "completed"


def test_rotation_allows_duplicate_slots_and_advances_one_slot_at_a_time(database, monkeypatch):
    day = date(2026, 10, 20)
    monkeypatch.setattr(
        database,
        "now_local",
        lambda: datetime.combine(day, datetime.min.time()).replace(
            hour=20, tzinfo=database.settings.timezone
        ),
    )
    exercise = next(item for item in database.list_exercises("active", "Squats", None))
    rotation = database.create_rotation("Repeat squats")
    database.set_rotation_members(rotation["id"], [exercise["id"], exercise["id"]])
    assert [member["position"] for member in database.rotations()[0]["members"]] == [0, 1]
    database.activate_rotation(rotation["id"], first_position=0)
    database.add_set(exercise["id"], day.isoformat(), set_payload())
    day += timedelta(days=1)
    rotated = database.rotations()[0]
    assert rotated["duePosition"] == 1
    assert rotated["dueExerciseId"] == exercise["id"]
    database.add_set(exercise["id"], day.isoformat(), set_payload())
    day += timedelta(days=1)
    assert database.rotations()[0]["duePosition"] == 0


def test_rotation_recommendations_return_one_occurrence_per_exercise_day(database, monkeypatch):
    today = date(2026, 10, 20)
    monkeypatch.setattr(
        database,
        "now_local",
        lambda: datetime.combine(today, datetime.min.time()).replace(
            hour=20, tzinfo=database.settings.timezone
        ),
    )
    exercise = next(item for item in database.list_exercises("active", "Squats", None))
    database.add_set(exercise["id"], (today - timedelta(days=7)).isoformat(), set_payload())
    database.add_set(
        exercise["id"], (today - timedelta(days=7)).isoformat(), set_payload(time="09:00")
    )
    database.add_set(exercise["id"], (today - timedelta(days=6)).isoformat(), set_payload())
    assert [item["date"] for item in database.rotation_recommendations(7)] == [
        (today - timedelta(days=6)).isoformat()
    ]
    assert [item["date"] for item in database.rotation_recommendations(8)] == [
        (today - timedelta(days=7)).isoformat(),
        (today - timedelta(days=6)).isoformat(),
    ]
    with pytest.raises(DomainError, match="at least one day"):
        database.rotation_recommendations(0)
