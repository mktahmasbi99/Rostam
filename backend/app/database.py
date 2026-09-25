from __future__ import annotations

import os
import re
import sqlite3
import tempfile
import threading
import unicodedata
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from .config import Settings

EQUIPMENT = {
    "resistance_band",
    "resistance_tube",
    "dumbbell",
    "barbell",
    "kettlebell",
    "cable",
    "weight_machine",
    "weighted_vest",
    "weight_plate",
    "ankle_weights",
    "sandbag",
    "other",
}

EQUIPMENT_TITLES = {
    "resistance_band": "Resistance Bands",
    "resistance_tube": "Resistance tubes",
    "dumbbell": "Dumbbells",
    "barbell": "Barbell",
    "kettlebell": "Kettlebell",
    "cable": "Cable",
    "weight_machine": "Weight Machine",
    "weighted_vest": "Weighted Vest",
    "weight_plate": "Weight Plate",
    "ankle_weights": "Ankle Weights",
    "sandbag": "Sandbag",
}

SEED_EXERCISES = (
    ("squats", "Squats", "repetitions", "bodyweight", None, "bodyweight-squat"),
    ("push-ups", "Push-ups", "repetitions", "bodyweight", None, "push-up"),
    ("pull-ups", "Pull-ups", "repetitions", "bodyweight", None, "pull-up"),
    ("bicep-curls", "Bicep curls", "repetitions", "external", "dumbbell", "bicep-curl"),
    (
        "band-pull-aparts",
        "Band pull-aparts",
        "repetitions",
        "external",
        "resistance_band",
        "band-pull-apart",
    ),
    ("deadlifts", "Deadlifts", "repetitions", "external", "barbell", "deadlift"),
    ("plank", "Plank", "duration", "bodyweight", None, "plank"),
    (
        "hollow-body-hold",
        "Hollow-body hold",
        "duration",
        "bodyweight",
        None,
        "hollow-body-hold",
    ),
)

BACKUP_APP_ID = "monster-sets"
BACKUP_FORMAT_VERSION = 1
SCHEMA_VERSION = 10
MUSCLE_GROUPS = (
    ("abs", "Abs"),
    ("back", "Back"),
    ("biceps", "Biceps"),
    ("calves", "Calves"),
    ("chest", "Chest"),
    ("forearms", "Forearms"),
    ("glutes", "Glutes"),
    ("hamstrings", "Hamstrings"),
    ("hip_flexors", "Hip Flexors"),
    ("quadriceps", "Quadriceps"),
    ("shoulders", "Shoulders"),
    ("triceps", "Triceps"),
)
MUSCLE_SLUGS = {slug for slug, _ in MUSCLE_GROUPS}
MAX_DAILY_NOTE_LENGTH = 20_000
MAX_PHOTOS_PER_DAY = 10
MAX_REPETITIONS = 1_000_000
MAX_WEIGHT_KG = Decimal(10000)
MAX_HEIGHT_CM = Decimal(300)
MAX_WAIST_CM = Decimal(500)
# Source files may be large camera originals. The stored JPEG is capped separately.
MAX_PHOTO_BYTES = 50 * 1024 * 1024
MAX_STORED_PHOTO_BYTES = 5 * 1024 * 1024
MAX_PHOTO_EDGE = 2560
THUMBNAIL_EDGE = 480
PHOTO_SUMMARY_COLUMNS = (
    "id",
    "entry_date",
    "display_order",
    "width",
    "height",
    "created_at",
)
PHOTO_SUMMARY_SELECT = ", ".join(PHOTO_SUMMARY_COLUMNS)

register_heif_opener()


class DomainError(ValueError):
    pass


def normalize_name(value: str) -> tuple[str, str]:
    display = " ".join(unicodedata.normalize("NFKC", value).strip().split())
    if not display:
        raise DomainError("Exercise name is required.")
    if len(display) > 100:
        raise DomainError("Exercise name must be at most 100 characters.")
    return display, display.casefold()


def exercise_title(base_name: str, equipment: str | None, custom_equipment: str | None) -> str:
    base, _ = normalize_name(base_name)
    if equipment is None:
        return base
    suffix = custom_equipment if equipment == "other" else EQUIPMENT_TITLES[equipment]
    return normalize_name(f"{base} ({suffix})")[0]


def parse_weight_grams(value: str | None, *, allow_blank: bool) -> int | None:
    if value is None or not value.strip():
        if allow_blank:
            return None
        raise DomainError("Weight is required for external resistance.")
    try:
        kilograms = Decimal(value.strip().replace(",", "."))
    except InvalidOperation as exc:
        raise DomainError("Weight must be a valid number.") from exc
    if not kilograms.is_finite():
        raise DomainError("Weight must be a finite number.")
    if kilograms == 0:
        return 0
    if kilograms < 0:
        raise DomainError("Weight cannot be negative.")
    if kilograms > MAX_WEIGHT_KG:
        raise DomainError(f"Weight must be at most {MAX_WEIGHT_KG:,} kg.")
    grams = int((kilograms * 1000).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    if grams <= 0:
        raise DomainError("Weight is too small.")
    return grams


def format_weight(grams: int | None) -> str | None:
    if grams is None:
        return None
    value = Decimal(grams) / Decimal(1000)
    return format(value.normalize(), "f")


class MonsterSetsDatabase:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.path = settings.database_path
        self._backup_lock = threading.RLock()
        self._database_lock = threading.RLock()
        self._backup_notifications: list[dict[str, str]] = []
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.migrate()

    @contextmanager
    def connect(self, path: Path | None = None) -> Iterator[sqlite3.Connection]:
        with self._database_lock:
            connection = sqlite3.connect(path or self.path, timeout=5)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute("PRAGMA busy_timeout = 5000")
            connection.execute(
                "PRAGMA journal_mode = WAL" if path is None else "PRAGMA journal_mode = DELETE"
            )
            try:
                yield connection
            finally:
                connection.close()

    def migrate(self) -> None:
        with self.connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS exercises (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    seed_key TEXT UNIQUE,
                    name TEXT NOT NULL,
                    normalized_name TEXT NOT NULL UNIQUE,
                    measurement_type TEXT NOT NULL
                        CHECK (measurement_type IN ('repetitions', 'duration')),
                    default_resistance_kind TEXT NOT NULL
                        CHECK (default_resistance_kind IN ('bodyweight', 'external')),
                    default_equipment TEXT,
                    default_custom_equipment TEXT,
                    default_weight_grams INTEGER CHECK (default_weight_grams > 0),
                    image_key TEXT,
                    archived_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS day_exercises (
                    entry_date TEXT NOT NULL,
                    exercise_id INTEGER NOT NULL,
                    display_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (entry_date, exercise_id),
                    UNIQUE (entry_date, display_order),
                    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
                );
                CREATE TABLE IF NOT EXISTS exercise_sets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    exercise_id INTEGER NOT NULL,
                    entry_date TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    repetitions INTEGER CHECK (repetitions > 0),
                    duration_seconds INTEGER CHECK (duration_seconds > 0),
                    resistance_kind TEXT NOT NULL
                        CHECK (resistance_kind IN ('bodyweight', 'external')),
                    weight_grams INTEGER CHECK (weight_grams > 0),
                    equipment TEXT,
                    custom_equipment TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    CHECK ((repetitions IS NOT NULL) != (duration_seconds IS NOT NULL)),
                    FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
                );
                CREATE INDEX IF NOT EXISTS idx_sets_day_exercise_order
                    ON exercise_sets(entry_date, exercise_id, occurred_at, created_at, id);
                CREATE INDEX IF NOT EXISTS idx_sets_exercise_order
                    ON exercise_sets(exercise_id, occurred_at, created_at, id);
                CREATE INDEX IF NOT EXISTS idx_sets_day ON exercise_sets(entry_date);
                CREATE TABLE IF NOT EXISTS backup_runs (
                    category TEXT PRIMARY KEY,
                    last_scheduled_date TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS backup_settings (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    daily_enabled INTEGER NOT NULL DEFAULT 1 CHECK (daily_enabled IN (0, 1)),
                    daily_time TEXT NOT NULL DEFAULT '01:00',
                    daily_retention INTEGER NOT NULL DEFAULT 7 CHECK (daily_retention BETWEEN 1 AND 365),
                    weekly_enabled INTEGER NOT NULL DEFAULT 1 CHECK (weekly_enabled IN (0, 1)),
                    weekly_weekday INTEGER NOT NULL DEFAULT 6 CHECK (weekly_weekday BETWEEN 0 AND 6),
                    weekly_time TEXT NOT NULL DEFAULT '01:00',
                    weekly_retention INTEGER NOT NULL DEFAULT 8 CHECK (weekly_retention BETWEEN 1 AND 365),
                    safety_retention INTEGER NOT NULL DEFAULT 8 CHECK (safety_retention BETWEEN 1 AND 365)
                );
                CREATE TABLE IF NOT EXISTS system_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS backup_metadata (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    app_id TEXT NOT NULL,
                    format_version INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    category TEXT NOT NULL
                );
                """
            )
            if (
                connection.execute("SELECT 1 FROM schema_migrations WHERE version = 1").fetchone()
                is None
            ):
                now = self._utc_now()
                for seed_key, name, measurement, resistance, equipment, image_key in SEED_EXERCISES:
                    display, normalized = normalize_name(name)
                    connection.execute(
                        """
                        INSERT INTO exercises(
                            seed_key, name, normalized_name, measurement_type,
                            default_resistance_kind, default_equipment, image_key,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            seed_key,
                            display,
                            normalized,
                            measurement,
                            resistance,
                            equipment,
                            image_key,
                            now,
                            now,
                        ),
                    )
                connection.execute("INSERT INTO schema_migrations(version) VALUES (1)")
            if (
                connection.execute("SELECT 1 FROM schema_migrations WHERE version = 2").fetchone()
                is None
            ):
                connection.executescript(
                    """
                    ALTER TABLE exercises ADD COLUMN base_name TEXT;
                    ALTER TABLE exercises ADD COLUMN equipment TEXT;
                    ALTER TABLE exercises ADD COLUMN custom_equipment TEXT;
                    ALTER TABLE exercises ADD COLUMN allow_bodyweight INTEGER
                        NOT NULL DEFAULT 0 CHECK (allow_bodyweight IN (0, 1));

                    UPDATE exercises SET
                        base_name = name,
                        equipment = CASE
                            WHEN default_resistance_kind = 'external' THEN default_equipment
                            ELSE NULL
                        END,
                        custom_equipment = CASE
                            WHEN default_resistance_kind = 'external'
                                THEN default_custom_equipment
                            ELSE NULL
                        END,
                        allow_bodyweight = CASE
                            WHEN default_resistance_kind = 'bodyweight' THEN 1
                            ELSE 0
                        END;
                    """
                )
                special_exercises = (
                    ("overhead press rb", "Overhead Press", "Overhead Press (Resistance Bands)"),
                    ("squats", "Squats", "Squats (Resistance Bands)"),
                    (
                        "band pull-aparts",
                        "Band pull-aparts",
                        "Band pull-aparts (Resistance Bands)",
                    ),
                    ("bicep curls", "Bicep curls", "Bicep curls (Resistance Bands)"),
                )
                now = self._utc_now()
                for old_normalized, base_name, name in special_exercises:
                    row = connection.execute(
                        """
                        SELECT id FROM exercises
                        WHERE normalized_name = ? AND EXISTS(
                            SELECT 1 FROM exercise_sets WHERE exercise_id = exercises.id
                        )
                        """,
                        (old_normalized,),
                    ).fetchone()
                    if row is None:
                        continue
                    connection.execute(
                        """
                        UPDATE exercises SET base_name = ?, name = ?, normalized_name = ?,
                            equipment = 'resistance_band', custom_equipment = NULL,
                            allow_bodyweight = 1, updated_at = ? WHERE id = ?
                        """,
                        (base_name, name, name.casefold(), now, row["id"]),
                    )
                    connection.execute(
                        """
                        UPDATE exercise_sets SET equipment = 'resistance_band',
                            custom_equipment = NULL
                        WHERE exercise_id = ? AND resistance_kind = 'external'
                        """,
                        (row["id"],),
                    )
                connection.execute(
                    """
                    UPDATE exercises SET base_name = 'Ab Rollouts', equipment = NULL,
                        custom_equipment = NULL, allow_bodyweight = 1, updated_at = ?
                    WHERE normalized_name = 'ab rollouts'
                    """,
                    (now,),
                )
                connection.execute("INSERT INTO schema_migrations(version) VALUES (2)")
            if (
                connection.execute("SELECT 1 FROM schema_migrations WHERE version = 3").fetchone()
                is None
            ):
                connection.execute("ALTER TABLE exercises ADD COLUMN exercise_note TEXT")
                connection.execute("INSERT INTO schema_migrations(version) VALUES (3)")
            if (
                connection.execute("SELECT 1 FROM schema_migrations WHERE version = 4").fetchone()
                is None
            ):
                connection.executescript(
                    """
                    CREATE TABLE daily_notes (
                        entry_date TEXT PRIMARY KEY,
                        body TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                    CREATE TABLE daily_photos (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        entry_date TEXT NOT NULL,
                        display_order INTEGER NOT NULL,
                        jpeg BLOB NOT NULL,
                        thumbnail_jpeg BLOB NOT NULL,
                        width INTEGER NOT NULL,
                        height INTEGER NOT NULL,
                        created_at TEXT NOT NULL,
                        UNIQUE(entry_date, display_order)
                    );
                    CREATE INDEX idx_daily_notes_date ON daily_notes(entry_date DESC);
                    CREATE INDEX idx_daily_photos_date_order
                        ON daily_photos(entry_date DESC, display_order ASC);
                    """
                )
                connection.execute("INSERT INTO schema_migrations(version) VALUES (4)")
            if (
                connection.execute("SELECT 1 FROM schema_migrations WHERE version = 5").fetchone()
                is None
            ):
                connection.executescript(
                    """
                    CREATE TABLE profile_settings (
                        id INTEGER PRIMARY KEY CHECK (id = 1),
                        height_mm INTEGER CHECK (height_mm > 0),
                        date_of_birth TEXT
                    );
                    CREATE TABLE body_measurements (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        entry_date TEXT NOT NULL UNIQUE,
                        weight_grams INTEGER CHECK (weight_grams > 0),
                        waist_mm INTEGER CHECK (waist_mm > 0),
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        CHECK (weight_grams IS NOT NULL OR waist_mm IS NOT NULL)
                    );
                    CREATE INDEX idx_body_measurements_date
                        ON body_measurements(entry_date DESC);
                    """
                )
                connection.execute("INSERT INTO schema_migrations(version) VALUES (5)")
            if (
                connection.execute("SELECT 1 FROM schema_migrations WHERE version = 6").fetchone()
                is None
            ):
                connection.executescript(
                    """
                    CREATE TABLE body_measurements_v6 (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        entry_date TEXT NOT NULL,
                        measurement_type TEXT NOT NULL CHECK (measurement_type IN ('weight', 'waist')),
                        weight_grams INTEGER CHECK (weight_grams > 0),
                        waist_mm INTEGER CHECK (waist_mm > 0),
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        UNIQUE(entry_date, measurement_type),
                        CHECK (
                            (measurement_type = 'weight' AND weight_grams IS NOT NULL AND waist_mm IS NULL)
                            OR (measurement_type = 'waist' AND waist_mm IS NOT NULL AND weight_grams IS NULL)
                        )
                    );
                    INSERT INTO body_measurements_v6(
                        id, entry_date, measurement_type, weight_grams, created_at, updated_at
                    ) SELECT id, entry_date, 'weight', weight_grams, created_at, updated_at
                    FROM body_measurements WHERE weight_grams IS NOT NULL;
                    INSERT INTO body_measurements_v6(
                        entry_date, measurement_type, waist_mm, created_at, updated_at
                    ) SELECT entry_date, 'waist', waist_mm, created_at, updated_at
                    FROM body_measurements WHERE waist_mm IS NOT NULL;
                    DROP TABLE body_measurements;
                    ALTER TABLE body_measurements_v6 RENAME TO body_measurements;
                    CREATE INDEX idx_body_measurements_date
                        ON body_measurements(entry_date DESC);
                    """
                )
                connection.execute("INSERT INTO schema_migrations(version) VALUES (6)")
            if (
                connection.execute("SELECT 1 FROM schema_migrations WHERE version = 7").fetchone()
                is None
            ):
                connection.execute("UPDATE exercises SET default_weight_grams = NULL")
                connection.execute("INSERT INTO schema_migrations(version) VALUES (7)")
            if (
                connection.execute("SELECT 1 FROM schema_migrations WHERE version = 8").fetchone()
                is None
            ):
                connection.commit()
                connection.execute("PRAGMA foreign_keys = OFF")
                connection.executescript(
                    """
                    CREATE TABLE exercises_v8 (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        seed_key TEXT UNIQUE,
                        name TEXT NOT NULL,
                        normalized_name TEXT NOT NULL UNIQUE,
                        measurement_type TEXT NOT NULL CHECK (
                            measurement_type IN ('repetitions', 'duration', 'timed_repetitions')
                        ),
                        default_resistance_kind TEXT NOT NULL
                            CHECK (default_resistance_kind IN ('bodyweight', 'external')),
                        default_equipment TEXT,
                        default_custom_equipment TEXT,
                        default_weight_grams INTEGER CHECK (default_weight_grams > 0),
                        image_key TEXT,
                        archived_at TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        base_name TEXT,
                        equipment TEXT,
                        custom_equipment TEXT,
                        allow_bodyweight INTEGER NOT NULL DEFAULT 0
                            CHECK (allow_bodyweight IN (0, 1)),
                        exercise_note TEXT
                    );
                    INSERT INTO exercises_v8(
                        id, seed_key, name, normalized_name, measurement_type,
                        default_resistance_kind, default_equipment, default_custom_equipment,
                        default_weight_grams, image_key, archived_at, created_at, updated_at,
                        base_name, equipment, custom_equipment, allow_bodyweight, exercise_note
                    ) SELECT
                        id, seed_key, name, normalized_name, measurement_type,
                        default_resistance_kind, default_equipment, default_custom_equipment,
                        default_weight_grams, image_key, archived_at, created_at, updated_at,
                        base_name, equipment, custom_equipment, allow_bodyweight, exercise_note
                    FROM exercises;
                    CREATE TABLE exercise_sets_v8 (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        exercise_id INTEGER NOT NULL,
                        entry_date TEXT NOT NULL,
                        occurred_at TEXT NOT NULL,
                        repetitions INTEGER CHECK (repetitions > 0),
                        duration_seconds INTEGER CHECK (duration_seconds > 0),
                        hold_seconds INTEGER CHECK (hold_seconds > 0),
                        resistance_kind TEXT NOT NULL
                            CHECK (resistance_kind IN ('bodyweight', 'external')),
                        weight_grams INTEGER CHECK (weight_grams > 0),
                        equipment TEXT,
                        custom_equipment TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL,
                        CHECK (
                            (repetitions IS NOT NULL AND duration_seconds IS NULL)
                            OR (
                                repetitions IS NULL AND duration_seconds IS NOT NULL
                                AND hold_seconds IS NULL
                            )
                        ),
                        FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE RESTRICT
                    );
                    INSERT INTO exercise_sets_v8(
                        id, exercise_id, entry_date, occurred_at, repetitions, duration_seconds,
                        resistance_kind, weight_grams, equipment, custom_equipment, created_at,
                        updated_at
                    ) SELECT
                        id, exercise_id, entry_date, occurred_at, repetitions, duration_seconds,
                        resistance_kind, weight_grams, equipment, custom_equipment, created_at,
                        updated_at
                    FROM exercise_sets;
                    DROP TABLE exercise_sets;
                    DROP TABLE exercises;
                    ALTER TABLE exercises_v8 RENAME TO exercises;
                    ALTER TABLE exercise_sets_v8 RENAME TO exercise_sets;
                    CREATE INDEX idx_sets_day_exercise_order
                        ON exercise_sets(entry_date, exercise_id, occurred_at, created_at, id);
                    CREATE INDEX idx_sets_exercise_order
                        ON exercise_sets(exercise_id, occurred_at, created_at, id);
                    CREATE INDEX idx_sets_day ON exercise_sets(entry_date);
                    """
                )
                connection.execute(
                    """
                    UPDATE exercises SET measurement_type = 'timed_repetitions', updated_at = ?
                    WHERE normalized_name = 'side plank leg lift' AND measurement_type = 'repetitions'
                    """,
                    (self._utc_now(),),
                )
                connection.execute(
                    """
                    UPDATE exercise_sets SET hold_seconds = 10
                    WHERE exercise_id IN (
                        SELECT id FROM exercises WHERE normalized_name = 'side plank leg lift'
                    ) AND repetitions IS NOT NULL
                    """
                )
                connection.execute("INSERT INTO schema_migrations(version) VALUES (8)")
                connection.commit()
                connection.execute("PRAGMA foreign_keys = ON")
            if (
                connection.execute("SELECT 1 FROM schema_migrations WHERE version = 9").fetchone()
                is None
            ):
                connection.execute("INSERT OR IGNORE INTO backup_settings(id) VALUES (1)")
                connection.execute("INSERT INTO schema_migrations(version) VALUES (9)")
            if (
                connection.execute("SELECT 1 FROM schema_migrations WHERE version = 10").fetchone()
                is None
            ):
                connection.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS muscle_groups (
                        slug TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        display_order INTEGER NOT NULL UNIQUE
                    );
                    CREATE TABLE IF NOT EXISTS exercise_muscles (
                        exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
                        muscle_slug TEXT NOT NULL REFERENCES muscle_groups(slug) ON DELETE RESTRICT,
                        role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
                        PRIMARY KEY (exercise_id, muscle_slug)
                    );
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_one_primary
                        ON exercise_muscles(exercise_id) WHERE role = 'primary';
                    CREATE INDEX IF NOT EXISTS idx_exercise_muscles_lookup
                        ON exercise_muscles(muscle_slug, role, exercise_id);
                    """
                )
                columns = {
                    row["name"] for row in connection.execute("PRAGMA table_info(exercises)")
                }
                if "recommendation_paused_until" not in columns:
                    connection.execute(
                        "ALTER TABLE exercises ADD COLUMN recommendation_paused_until TEXT"
                    )
                if "recommendation_paused_forever" not in columns:
                    connection.execute(
                        "ALTER TABLE exercises ADD COLUMN recommendation_paused_forever INTEGER "
                        "NOT NULL DEFAULT 0 CHECK (recommendation_paused_forever IN (0, 1))"
                    )
                for index, (slug, name) in enumerate(MUSCLE_GROUPS):
                    connection.execute(
                        "INSERT OR IGNORE INTO muscle_groups(slug, name, display_order) VALUES (?, ?, ?)",
                        (slug, name, index),
                    )
                seed_muscles = {
                    "band-pull-aparts": ("back", ("shoulders",)),
                    "bicep-curls": ("biceps", ("forearms",)),
                    "deadlifts": ("hamstrings", ("glutes", "back", "forearms")),
                    "hollow-body-hold": ("abs", ("hip_flexors",)),
                    "plank": ("abs", ("shoulders", "glutes")),
                    "pull-ups": ("back", ("biceps", "forearms")),
                    "push-ups": ("chest", ("triceps", "shoulders", "abs")),
                    "squats": ("quadriceps", ("glutes", "hamstrings", "abs")),
                }
                for seed_key, (primary, secondary) in seed_muscles.items():
                    exercise = connection.execute(
                        "SELECT id FROM exercises WHERE seed_key = ?", (seed_key,)
                    ).fetchone()
                    if exercise is None:
                        continue
                    connection.execute(
                        "INSERT OR IGNORE INTO exercise_muscles(exercise_id, muscle_slug, role) VALUES (?, ?, 'primary')",
                        (exercise["id"], primary),
                    )
                    connection.executemany(
                        "INSERT OR IGNORE INTO exercise_muscles(exercise_id, muscle_slug, role) VALUES (?, ?, 'secondary')",
                        [(exercise["id"], slug) for slug in secondary],
                    )
                connection.execute("INSERT INTO schema_migrations(version) VALUES (10)")
            connection.execute(
                """
                INSERT OR IGNORE INTO backup_metadata(
                    id, app_id, format_version, created_at, category
                ) VALUES (1, ?, ?, ?, 'live')
                """,
                (BACKUP_APP_ID, BACKUP_FORMAT_VERSION, self._utc_now()),
            )
            connection.commit()

    def _utc_now(self) -> str:
        return datetime.now(UTC).isoformat(timespec="microseconds")

    def now_local(self) -> datetime:
        return datetime.now(self.settings.timezone)

    def today(self) -> date:
        return self.now_local().date()

    def _parse_day(self, value: str) -> date:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise DomainError("Date must use YYYY-MM-DD.")
        try:
            parsed = date.fromisoformat(value)
        except ValueError as exc:
            raise DomainError("Date must use YYYY-MM-DD.") from exc
        if parsed > self.today():
            raise DomainError("Future dates cannot contain journal entries or exercise sets.")
        return parsed

    @staticmethod
    def _parse_positive_millimetres(
        value: str | None, label: str, maximum_centimetres: Decimal
    ) -> int | None:
        if value is None or not value.strip():
            return None
        try:
            centimetres = Decimal(value.strip().replace(",", "."))
        except InvalidOperation as exc:
            raise DomainError(f"{label} must be a valid number.") from exc
        if not centimetres.is_finite():
            raise DomainError(f"{label} must be a finite number.")
        if centimetres <= 0:
            raise DomainError(f"{label} must be positive.")
        if centimetres > maximum_centimetres:
            raise DomainError(f"{label} must be at most {maximum_centimetres:,} cm.")
        millimetres = int((centimetres * 10).quantize(Decimal(1), rounding=ROUND_HALF_UP))
        if millimetres <= 0:
            raise DomainError(f"{label} is too small.")
        return millimetres

    @staticmethod
    def _format_millimetres(value: int | None) -> str | None:
        if value is None:
            return None
        return format((Decimal(value) / Decimal(10)).normalize(), "f")

    def profile(self) -> dict:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT height_mm, date_of_birth FROM profile_settings WHERE id = 1"
            ).fetchone()
        birth_date = (
            date.fromisoformat(row["date_of_birth"]) if row and row["date_of_birth"] else None
        )
        age = None
        if birth_date:
            today = self.today()
            age = (
                today.year
                - birth_date.year
                - ((today.month, today.day) < (birth_date.month, birth_date.day))
            )
        return {
            "heightCm": self._format_millimetres(row["height_mm"]) if row else None,
            "dateOfBirth": birth_date.isoformat() if birth_date else None,
            "age": age,
        }

    def update_profile(self, payload) -> dict:
        height_mm = self._parse_positive_millimetres(payload.heightCm, "Height", MAX_HEIGHT_CM)
        birth_date = None
        if payload.dateOfBirth:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", payload.dateOfBirth):
                raise DomainError("Date of birth must use YYYY-MM-DD.")
            try:
                birth_date = date.fromisoformat(payload.dateOfBirth)
            except ValueError as exc:
                raise DomainError("Date of birth must use YYYY-MM-DD.") from exc
            if birth_date > self.today():
                raise DomainError("Date of birth cannot be in the future.")
        with self.connect() as connection:
            connection.execute(
                """INSERT INTO profile_settings(id, height_mm, date_of_birth) VALUES (1, ?, ?)
                ON CONFLICT(id) DO UPDATE SET height_mm=excluded.height_mm,
                    date_of_birth=excluded.date_of_birth""",
                (height_mm, birth_date.isoformat() if birth_date else None),
            )
            connection.commit()
        return self.profile()

    @staticmethod
    def _measurement_summary(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "date": row["entry_date"],
            "measurementType": row["measurement_type"],
            "weightKg": format_weight(row["weight_grams"]),
            "waistCm": MonsterSetsDatabase._format_millimetres(row["waist_mm"]),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def list_body_measurements(self) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM body_measurements ORDER BY entry_date DESC"
            ).fetchall()
        return [self._measurement_summary(row) for row in rows]

    def create_body_measurement(self, payload) -> dict:
        self._parse_day(payload.date)
        weight_grams = parse_weight_grams(payload.weightKg, allow_blank=True)
        if weight_grams == 0:
            raise DomainError("Weight must be positive.")
        waist_mm = self._parse_positive_millimetres(
            payload.waistCm, "Waist circumference", MAX_WAIST_CM
        )
        if (weight_grams is None) == (waist_mm is None):
            raise DomainError("Record exactly one measurement.")
        measurement_type = "weight" if weight_grams is not None else "waist"
        now = self._utc_now()
        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """INSERT INTO body_measurements(
                        entry_date, measurement_type, weight_grams, waist_mm, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?)""",
                    (payload.date, measurement_type, weight_grams, waist_mm, now, now),
                )
                connection.commit()
                row = connection.execute(
                    "SELECT * FROM body_measurements WHERE id = ?", (cursor.lastrowid,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise DomainError(
                f"A {measurement_type} measurement already exists for this date."
            ) from exc
        return self._measurement_summary(row)

    def update_body_measurement(self, measurement_id: int, payload) -> dict:
        self._parse_day(payload.date)
        weight_grams = parse_weight_grams(payload.weightKg, allow_blank=True)
        if weight_grams == 0:
            raise DomainError("Weight must be positive.")
        waist_mm = self._parse_positive_millimetres(
            payload.waistCm, "Waist circumference", MAX_WAIST_CM
        )
        if (weight_grams is None) == (waist_mm is None):
            raise DomainError("Record exactly one measurement.")
        measurement_type = "weight" if weight_grams is not None else "waist"
        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """UPDATE body_measurements SET entry_date = ?, measurement_type = ?, weight_grams = ?,
                    waist_mm = ?, updated_at = ? WHERE id = ?""",
                    (
                        payload.date,
                        measurement_type,
                        weight_grams,
                        waist_mm,
                        self._utc_now(),
                        measurement_id,
                    ),
                )
                if cursor.rowcount == 0:
                    raise DomainError("Measurement not found.")
                connection.commit()
                row = connection.execute(
                    "SELECT * FROM body_measurements WHERE id = ?", (measurement_id,)
                ).fetchone()
        except sqlite3.IntegrityError as exc:
            raise DomainError(
                f"A {measurement_type} measurement already exists for this date."
            ) from exc
        return self._measurement_summary(row)

    def delete_body_measurement(self, measurement_id: int) -> None:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM body_measurements WHERE id = ?", (measurement_id,)
            )
            if cursor.rowcount == 0:
                raise DomainError("Measurement not found.")
            connection.commit()

    @staticmethod
    def _photo_summary(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "date": row["entry_date"],
            "displayOrder": row["display_order"],
            "width": row["width"],
            "height": row["height"],
            "createdAt": row["created_at"],
            "thumbnailUrl": f"/api/photos/{row['id']}/thumbnail",
            "url": f"/api/photos/{row['id']}",
        }

    def update_daily_note(self, day_value: str, body: str) -> dict:
        self._parse_day(day_value)
        if len(body) > MAX_DAILY_NOTE_LENGTH:
            raise DomainError(f"Daily notes must be at most {MAX_DAILY_NOTE_LENGTH:,} characters.")
        with self.connect() as connection:
            if not body.strip():
                connection.execute("DELETE FROM daily_notes WHERE entry_date = ?", (day_value,))
                connection.commit()
                return {"date": day_value, "dailyNote": None}
            now = self._utc_now()
            connection.execute(
                """INSERT INTO daily_notes(entry_date, body, created_at, updated_at) VALUES (?, ?, ?, ?)
                ON CONFLICT(entry_date) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at""",
                (day_value, body, now, now),
            )
            connection.commit()
        return {"date": day_value, "dailyNote": body}

    def delete_daily_note(self, day_value: str) -> None:
        self._parse_day(day_value)
        with self.connect() as connection:
            connection.execute("DELETE FROM daily_notes WHERE entry_date = ?", (day_value,))
            connection.commit()

    def list_daily_notes(self) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM daily_notes ORDER BY entry_date DESC"
            ).fetchall()
        return [
            {
                "date": row["entry_date"],
                "body": row["body"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
            for row in rows
        ]

    def _process_photo(self, source: bytes) -> tuple[bytes, bytes, int, int]:
        if not source:
            raise DomainError("Choose an image to upload.")
        if len(source) > MAX_PHOTO_BYTES:
            raise DomainError("Each source photo must be 50 MB or smaller.")
        try:
            with Image.open(BytesIO(source)) as opened:
                if opened.format not in {"JPEG", "PNG", "HEIF", "WEBP"}:
                    raise DomainError("Photos must be JPEG, PNG, HEIC, or WebP images.")
                image = ImageOps.exif_transpose(opened)
                if image.mode in {"RGBA", "LA"} or "transparency" in image.info:
                    background = Image.new("RGB", image.size, "#fffaf0")
                    alpha = image.convert("RGBA")
                    background.paste(alpha, mask=alpha.getchannel("A"))
                    image = background
                else:
                    image = image.convert("RGB")
                image.thumbnail((MAX_PHOTO_EDGE, MAX_PHOTO_EDGE), Image.Resampling.LANCZOS)
                width, height = image.size
                full = BytesIO()
                image.save(full, format="JPEG", quality=82, optimize=True)
                if full.tell() > MAX_STORED_PHOTO_BYTES:
                    raise DomainError("This photo is still too large after compression.")
                thumbnail = image.copy()
                thumbnail.thumbnail((THUMBNAIL_EDGE, THUMBNAIL_EDGE), Image.Resampling.LANCZOS)
                thumb = BytesIO()
                thumbnail.save(thumb, format="JPEG", quality=82, optimize=True)
                return full.getvalue(), thumb.getvalue(), width, height
        except (UnidentifiedImageError, OSError, ValueError) as exc:
            raise DomainError("Photos must be valid JPEG, PNG, HEIC, or WebP images.") from exc

    def add_daily_photos(self, day_value: str, uploads: list[bytes]) -> list[dict]:
        self._parse_day(day_value)
        if not uploads:
            raise DomainError("Choose at least one photo.")
        processed = [self._process_photo(upload) for upload in uploads]
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            count = connection.execute(
                "SELECT COUNT(*) FROM daily_photos WHERE entry_date = ?", (day_value,)
            ).fetchone()[0]
            if count + len(processed) > MAX_PHOTOS_PER_DAY:
                raise DomainError(f"A day can contain at most {MAX_PHOTOS_PER_DAY} photos.")
            now = self._utc_now()
            for offset, (jpeg, thumbnail, width, height) in enumerate(processed):
                connection.execute(
                    """INSERT INTO daily_photos(entry_date, display_order, jpeg, thumbnail_jpeg, width, height, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (day_value, count + offset + 1, jpeg, thumbnail, width, height, now),
                )
            connection.commit()
            rows = connection.execute(
                f"SELECT {PHOTO_SUMMARY_SELECT} FROM daily_photos "
                "WHERE entry_date = ? ORDER BY display_order",
                (day_value,),
            ).fetchall()
        return [self._photo_summary(row) for row in rows]

    def list_daily_photos(self, day_value: str) -> list[dict]:
        self._parse_day(day_value)
        with self.connect() as connection:
            rows = connection.execute(
                f"SELECT {PHOTO_SUMMARY_SELECT} FROM daily_photos "
                "WHERE entry_date = ? ORDER BY display_order",
                (day_value,),
            ).fetchall()
        return [self._photo_summary(row) for row in rows]

    def list_photos(self) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute(
                f"SELECT {PHOTO_SUMMARY_SELECT} FROM daily_photos "
                "ORDER BY entry_date DESC, display_order"
            ).fetchall()
        grouped: dict[str, list[dict]] = {}
        for row in rows:
            grouped.setdefault(row["entry_date"], []).append(self._photo_summary(row))
        return [{"date": day, "photos": photos} for day, photos in grouped.items()]

    def photo_data(self, photo_id: int, *, thumbnail: bool) -> bytes:
        column = "thumbnail_jpeg" if thumbnail else "jpeg"
        with self.connect() as connection:
            row = connection.execute(
                f"SELECT {column} FROM daily_photos WHERE id = ?", (photo_id,)
            ).fetchone()
        if row is None:
            raise DomainError("Photo not found.")
        return row[column]

    def delete_daily_photo(self, photo_id: int) -> None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT entry_date, display_order FROM daily_photos WHERE id = ?", (photo_id,)
            ).fetchone()
            if row is None:
                raise DomainError("Photo not found.")
            self._parse_day(row["entry_date"])
            connection.execute("DELETE FROM daily_photos WHERE id = ?", (photo_id,))
            connection.execute(
                "UPDATE daily_photos SET display_order = display_order - 1 WHERE entry_date = ? AND display_order > ?",
                (row["entry_date"], row["display_order"]),
            )
            connection.commit()

    def _resolve_local_occurrence(self, day: date, parsed_time: time) -> datetime:
        naive = datetime.combine(day, parsed_time)
        candidates: dict[datetime, datetime] = {}
        for fold in (0, 1):
            candidate = naive.replace(tzinfo=self.settings.timezone, fold=fold)
            round_trip = candidate.astimezone(UTC).astimezone(self.settings.timezone)
            if round_trip.replace(tzinfo=None) == naive:
                candidates[candidate.astimezone(UTC)] = candidate
        if not candidates:
            raise DomainError("Time does not exist in the configured timezone on this date.")
        if len(candidates) > 1:
            raise DomainError("Time is ambiguous in the configured timezone on this date.")
        return next(iter(candidates.values()))

    def _occurrence(self, day_value: str, time_value: str | None) -> str:
        day = self._parse_day(day_value)
        now = self.now_local()
        if time_value is None:
            local = now if day == now.date() else self._resolve_local_occurrence(day, now.time())
        else:
            if not re.fullmatch(r"\d{2}:\d{2}", time_value):
                raise DomainError("Time must use HH:MM.")
            try:
                parsed_time = time.fromisoformat(time_value)
            except ValueError as exc:
                raise DomainError("Time must be valid.") from exc
            local = self._resolve_local_occurrence(day, parsed_time)
        if local > now:
            raise DomainError("Exercise sets cannot occur in the future.")
        return local.astimezone(UTC).isoformat(timespec="microseconds")

    def _local_time(self, occurred_at: str) -> str:
        parsed = datetime.fromisoformat(occurred_at)
        return parsed.astimezone(self.settings.timezone).strftime("%H:%M")

    def _exercise_row(self, connection: sqlite3.Connection, exercise_id: int) -> sqlite3.Row:
        row = connection.execute("SELECT * FROM exercises WHERE id = ?", (exercise_id,)).fetchone()
        if row is None:
            raise DomainError("Exercise not found.")
        return row

    def _validate_exercise_features(
        self,
        equipment: str | None,
        custom_equipment: str | None,
        allow_bodyweight: bool,
    ) -> tuple[str | None, str | None]:
        if equipment is None:
            if not allow_bodyweight:
                raise DomainError("An exercise must allow bodyweight or use equipment.")
            return None, None
        if equipment not in EQUIPMENT:
            raise DomainError("Choose equipment.")
        custom = " ".join((custom_equipment or "").split()) or None
        if equipment == "other" and custom is None:
            raise DomainError("Name the custom equipment.")
        if equipment != "other":
            custom = None
        return equipment, custom

    def _validate_set(
        self,
        exercise: sqlite3.Row,
        repetitions: int | None,
        duration_minutes: int | None,
        duration_seconds: int | None,
        hold_minutes: int | None,
        hold_seconds: int | None,
        resistance_kind: str,
        weight_kg: str | None,
    ) -> tuple[int | None, int | None, int | None, str, int | None, str | None, str | None]:
        if exercise["measurement_type"] == "repetitions":
            if any(
                value is not None
                for value in (duration_minutes, duration_seconds, hold_minutes, hold_seconds)
            ):
                raise DomainError("A repetition exercise cannot contain a duration.")
            if repetitions is None or repetitions <= 0:
                raise DomainError("Repetitions must be a positive whole number.")
            if repetitions > MAX_REPETITIONS:
                raise DomainError(f"Repetitions must be at most {MAX_REPETITIONS:,}.")
            measured_reps, measured_duration, measured_hold = repetitions, None, None
        elif exercise["measurement_type"] == "duration":
            if repetitions is not None or hold_minutes is not None or hold_seconds is not None:
                raise DomainError("A duration exercise cannot contain repetitions.")
            minutes = duration_minutes or 0
            seconds = duration_seconds or 0
            if minutes < 0 or seconds < 0 or seconds > 59:
                raise DomainError("Duration seconds must be between 0 and 59.")
            total = minutes * 60 + seconds
            if total <= 0 or total > 86400:
                raise DomainError("Duration must be between 1 second and 24 hours.")
            measured_reps, measured_duration, measured_hold = None, total, None
        else:
            if duration_minutes is not None or duration_seconds is not None:
                raise DomainError("A timed repetition exercise cannot contain a duration.")
            if repetitions is None or repetitions <= 0:
                raise DomainError("Repetitions must be a positive whole number.")
            if repetitions > MAX_REPETITIONS:
                raise DomainError(f"Repetitions must be at most {MAX_REPETITIONS:,}.")
            minutes = hold_minutes or 0
            seconds = hold_seconds or 0
            if minutes < 0 or seconds < 0 or seconds > 59:
                raise DomainError("Hold seconds must be between 0 and 59.")
            total = minutes * 60 + seconds
            if total <= 0 or total > 86400:
                raise DomainError("Hold duration must be between 1 second and 24 hours.")
            measured_reps, measured_duration, measured_hold = repetitions, None, total

        if resistance_kind == "bodyweight":
            if not exercise["allow_bodyweight"]:
                raise DomainError("Bodyweight is not allowed for this exercise.")
            return measured_reps, measured_duration, measured_hold, "bodyweight", None, None, None
        equipment = exercise["equipment"]
        custom = exercise["custom_equipment"]
        if equipment is None:
            raise DomainError("This exercise does not use equipment.")
        weight = parse_weight_grams(weight_kg, allow_blank=False)
        if weight == 0:
            if not exercise["allow_bodyweight"]:
                raise DomainError("Weight must be greater than zero for this exercise.")
            return measured_reps, measured_duration, measured_hold, "bodyweight", None, None, None
        return (
            measured_reps,
            measured_duration,
            measured_hold,
            "external",
            weight,
            equipment,
            custom,
        )

    def _exercise_muscles(
        self, connection: sqlite3.Connection, exercise_id: int
    ) -> tuple[str | None, list[str]]:
        rows = connection.execute(
            "SELECT muscle_slug, role FROM exercise_muscles "
            "WHERE exercise_id = ? ORDER BY role, muscle_slug",
            (exercise_id,),
        ).fetchall()
        primary = next((row["muscle_slug"] for row in rows if row["role"] == "primary"), None)
        return primary, [row["muscle_slug"] for row in rows if row["role"] == "secondary"]

    def _validate_muscles(
        self, primary: str | None, secondary: list[str]
    ) -> tuple[str | None, list[str]]:
        primary = primary or None
        if primary is not None and primary not in MUSCLE_SLUGS:
            raise DomainError("Choose a valid primary muscle group.")
        if any(muscle not in MUSCLE_SLUGS for muscle in secondary):
            raise DomainError("Choose valid secondary muscle groups.")
        if len(set(secondary)) != len(secondary):
            raise DomainError("Secondary muscle groups must be unique.")
        if primary in secondary:
            raise DomainError("A primary muscle group cannot also be secondary.")
        return primary, sorted(secondary)

    def _replace_exercise_muscles(
        self,
        connection: sqlite3.Connection,
        exercise_id: int,
        primary: str | None,
        secondary: list[str],
    ) -> None:
        primary, secondary = self._validate_muscles(primary, secondary)
        connection.execute("DELETE FROM exercise_muscles WHERE exercise_id = ?", (exercise_id,))
        if primary:
            connection.execute(
                "INSERT INTO exercise_muscles(exercise_id, muscle_slug, role) VALUES (?, ?, 'primary')",
                (exercise_id, primary),
            )
        connection.executemany(
            "INSERT INTO exercise_muscles(exercise_id, muscle_slug, role) "
            "VALUES (?, ?, 'secondary')",
            [(exercise_id, muscle) for muscle in secondary],
        )

    def _serialize_exercise(self, row: sqlite3.Row, connection: sqlite3.Connection) -> dict:
        try:
            has_history = bool(row["has_history"])
        except IndexError:
            has_history = False
        primary, secondary = self._exercise_muscles(connection, row["id"])
        return {
            "id": row["id"],
            "name": row["name"],
            "baseName": row["base_name"],
            "measurementType": row["measurement_type"],
            "equipment": row["equipment"],
            "customEquipment": row["custom_equipment"],
            "allowBodyweight": bool(row["allow_bodyweight"]),
            "imageKey": row["image_key"],
            "exerciseNote": row["exercise_note"],
            "archivedAt": row["archived_at"],
            "hasHistory": has_history,
            "primaryMuscle": primary,
            "secondaryMuscles": secondary,
            "recommendationPausedUntil": row["recommendation_paused_until"],
            "recommendationPausedForever": bool(row["recommendation_paused_forever"]),
        }

    def _serialize_set(self, row: sqlite3.Row) -> dict:
        duration = row["duration_seconds"]
        hold = row["hold_seconds"]
        return {
            "id": row["id"],
            "exerciseId": row["exercise_id"],
            "date": row["entry_date"],
            "occurredAt": row["occurred_at"],
            "time": self._local_time(row["occurred_at"]),
            "repetitions": row["repetitions"],
            "durationMinutes": None if duration is None else duration // 60,
            "durationSeconds": None if duration is None else duration % 60,
            "holdMinutes": None if hold is None else hold // 60,
            "holdSeconds": None if hold is None else hold % 60,
            "resistanceKind": row["resistance_kind"],
            "weightKg": format_weight(row["weight_grams"]),
            "equipment": row["equipment"],
            "customEquipment": row["custom_equipment"],
            "createdAt": row["created_at"],
        }

    def list_exercises(self, status: str, query: str, measurement_type: str | None) -> list[dict]:
        if status not in {"active", "archived", "all"}:
            raise DomainError("Invalid exercise status.")
        clauses: list[str] = []
        params: list[str] = []
        if status == "active":
            clauses.append("archived_at IS NULL")
        elif status == "archived":
            clauses.append("archived_at IS NOT NULL")
        if query.strip():
            clauses.append("normalized_name LIKE ?")
            params.append(f"%{normalize_name(query)[1]}%")
        if measurement_type:
            if measurement_type not in {"repetitions", "duration", "timed_repetitions"}:
                raise DomainError("Invalid measurement type.")
            clauses.append("measurement_type = ?")
            params.append(measurement_type)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT e.*, EXISTS(
                    SELECT 1 FROM exercise_sets s WHERE s.exercise_id = e.id
                ) AS has_history
                FROM exercises e {where} ORDER BY normalized_name
                """,
                params,
            ).fetchall()
            return [self._serialize_exercise(row, connection) for row in rows]

    def exercise_recommendations(
        self,
        day_value: str,
        query: str,
        measurement_type: str | None,
        muscle_group: str | None,
        muscle_role: str,
        include_paused: bool,
        sort: str,
    ) -> dict:
        day = self._parse_day(day_value)
        if measurement_type and measurement_type not in {
            "repetitions",
            "duration",
            "timed_repetitions",
        }:
            raise DomainError("Invalid measurement type.")
        if muscle_group and muscle_group not in MUSCLE_SLUGS:
            raise DomainError("Invalid muscle group.")
        if muscle_role not in {"any", "primary", "secondary"}:
            raise DomainError("Invalid muscle role.")
        if sort not in {"recommended", "muscle", "exercise"}:
            raise DomainError("Invalid recommendation sort.")
        normalized_query = normalize_name(query)[1] if query.strip() else ""
        today = self.today()
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT e.*, MAX(s.entry_date) AS last_done_date,
                    EXISTS(SELECT 1 FROM exercise_sets h WHERE h.exercise_id = e.id) AS has_history
                FROM exercises e LEFT JOIN exercise_sets s
                    ON s.exercise_id = e.id AND s.entry_date <= ?
                WHERE e.archived_at IS NULL
                GROUP BY e.id
                """,
                (day_value,),
            ).fetchall()
            items = []
            for row in rows:
                exercise = self._serialize_exercise(row, connection)
                primary, secondary = exercise["primaryMuscle"], exercise["secondaryMuscles"]
                if normalized_query and normalized_query not in row["normalized_name"]:
                    continue
                if measurement_type and exercise["measurementType"] != measurement_type:
                    continue
                matches_muscle = (
                    not muscle_group
                    or (muscle_role in {"any", "primary"} and primary == muscle_group)
                    or (muscle_role in {"any", "secondary"} and muscle_group in secondary)
                )
                if not matches_muscle:
                    continue
                paused_until = exercise["recommendationPausedUntil"]
                paused = exercise["recommendationPausedForever"] or (
                    paused_until is not None and date.fromisoformat(paused_until) > today
                )
                if paused and not (include_paused or normalized_query):
                    continue
                last_done = row["last_done_date"]
                items.append(
                    {
                        "exercise": exercise,
                        "lastDoneDate": last_done,
                        "daysSinceLastDone": (day - date.fromisoformat(last_done)).days
                        if last_done
                        else None,
                        "paused": paused,
                    }
                )
            primary_dates = {
                row["muscle_slug"]: row["last_date"]
                for row in connection.execute(
                    """
                    SELECT em.muscle_slug, MAX(s.entry_date) AS last_date
                    FROM exercise_muscles em JOIN exercise_sets s ON s.exercise_id = em.exercise_id
                    WHERE em.role = 'primary' AND s.entry_date <= ?
                    GROUP BY em.muscle_slug
                    """,
                    (day_value,),
                )
            }
        performed = [item for item in items if item["lastDoneDate"]]
        never_tried = [item for item in items if not item["lastDoneDate"]]
        by_primary: dict[str, list[dict]] = {}
        unclassified: list[dict] = []
        for item in performed:
            primary = item["exercise"]["primaryMuscle"]
            (unclassified if primary is None else by_primary.setdefault(primary, [])).append(item)
        item_key = lambda item: (-item["daysSinceLastDone"], item["exercise"]["name"].casefold())
        for group_items in by_primary.values():
            group_items.sort(key=item_key)
        unclassified.sort(key=item_key)
        never_tried.sort(key=lambda item: item["exercise"]["name"].casefold())
        names = dict(MUSCLE_GROUPS)
        groups = [
            {
                "muscle": slug,
                "muscleName": names[slug],
                "lastTrainedDate": primary_dates.get(slug),
                "daysSinceLastTrained": (
                    (day - date.fromisoformat(primary_dates[slug])).days
                    if slug in primary_dates
                    else None
                ),
                "exercises": group_items,
            }
            for slug, group_items in by_primary.items()
        ]
        if sort == "muscle":
            groups.sort(key=lambda group: group["muscleName"])
        else:
            groups.sort(
                key=lambda group: (
                    group["daysSinceLastTrained"] is None,
                    -(group["daysSinceLastTrained"] or 0),
                    group["muscleName"],
                )
            )
        all_exercises = (
            [item for group in groups for item in group["exercises"]] + unclassified + never_tried
        )
        if sort == "exercise":
            all_exercises.sort(key=lambda item: item["exercise"]["name"].casefold())
        return {
            "groups": groups,
            "unclassified": unclassified,
            "neverTried": never_tried,
            "allExercises": all_exercises,
            "muscleGroups": [{"slug": slug, "name": name} for slug, name in MUSCLE_GROUPS],
        }

    @staticmethod
    def _add_calendar_months(value: date, months: int) -> date:
        month_index = value.month - 1 + months
        year, month = value.year + month_index // 12, month_index % 12 + 1
        next_month = date(year + (month == 12), 1 if month == 12 else month + 1, 1)
        return date(year, month, min(value.day, (next_month - timedelta(days=1)).day))

    def update_recommendation_pause(self, exercise_id: int, period: str) -> dict:
        periods = {"week", "month", "six_months", "year", "forever", "resume"}
        if period not in periods:
            raise DomainError("Invalid recommendation pause period.")
        today = self.today()
        if period == "week":
            until = today + timedelta(days=7)
        elif period == "month":
            until = self._add_calendar_months(today, 1)
        elif period == "six_months":
            until = self._add_calendar_months(today, 6)
        elif period == "year":
            until = self._add_calendar_months(today, 12)
        else:
            until = None
        with self.connect() as connection:
            self._exercise_row(connection, exercise_id)
            connection.execute(
                "UPDATE exercises SET recommendation_paused_until = ?, "
                "recommendation_paused_forever = ?, updated_at = ? WHERE id = ?",
                (
                    until.isoformat() if until else None,
                    int(period == "forever"),
                    self._utc_now(),
                    exercise_id,
                ),
            )
            connection.commit()
            return self._serialize_exercise(self._exercise_row(connection, exercise_id), connection)

    def exercise(self, exercise_id: int) -> dict:
        with self.connect() as connection:
            self._exercise_row(connection, exercise_id)
            row = connection.execute(
                """
                SELECT e.*, EXISTS(
                    SELECT 1 FROM exercise_sets s WHERE s.exercise_id = e.id
                ) AS has_history FROM exercises e WHERE e.id = ?
                """,
                (exercise_id,),
            ).fetchone()
            return self._serialize_exercise(row, connection)

    def create_exercise(self, payload) -> dict:
        base_name, _ = normalize_name(payload.baseName)
        equipment, custom = self._validate_exercise_features(
            payload.equipment,
            payload.customEquipment,
            payload.allowBodyweight,
        )
        name, normalized = normalize_name(exercise_title(base_name, equipment, custom))
        resistance = "external" if equipment is not None else "bodyweight"
        now = self._utc_now()
        try:
            with self.connect() as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO exercises(
                        name, normalized_name, base_name, measurement_type,
                        default_resistance_kind, default_equipment,
                        default_custom_equipment, image_key,
                        equipment, custom_equipment, allow_bodyweight,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        name,
                        normalized,
                        base_name,
                        payload.measurementType,
                        resistance,
                        equipment,
                        custom,
                        payload.imageKey,
                        equipment,
                        custom,
                        int(payload.allowBodyweight),
                        now,
                        now,
                    ),
                )
                self._replace_exercise_muscles(
                    connection,
                    cursor.lastrowid,
                    getattr(payload, "primaryMuscle", None),
                    getattr(payload, "secondaryMuscles", []),
                )
                connection.commit()
                row = self._exercise_row(connection, cursor.lastrowid)
                return self._serialize_exercise(row, connection)
        except sqlite3.IntegrityError as exc:
            raise DomainError("An exercise with this name already exists.") from exc

    def update_exercise(self, exercise_id: int, payload) -> dict:
        try:
            with self.connect() as connection:
                current = self._exercise_row(connection, exercise_id)
                base_name, _ = normalize_name(payload.baseName)
                current_generated_title = exercise_title(
                    current["base_name"], current["equipment"], current["custom_equipment"]
                )
                updated_title = (
                    exercise_title(base_name, current["equipment"], current["custom_equipment"])
                    if current["name"] == current_generated_title
                    else base_name
                )
                name, normalized = normalize_name(updated_title)
                self._validate_exercise_features(
                    current["equipment"],
                    current["custom_equipment"],
                    bool(current["allow_bodyweight"]),
                )
                connection.execute(
                    """
                    UPDATE exercises SET name = ?, normalized_name = ?, base_name = ?,
                        image_key = ?, updated_at = ? WHERE id = ?
                    """,
                    (
                        name,
                        normalized,
                        base_name,
                        payload.imageKey,
                        self._utc_now(),
                        exercise_id,
                    ),
                )
                if hasattr(payload, "primaryMuscle"):
                    self._replace_exercise_muscles(
                        connection,
                        exercise_id,
                        payload.primaryMuscle,
                        payload.secondaryMuscles,
                    )
                connection.commit()
                return self._serialize_exercise(
                    self._exercise_row(connection, exercise_id), connection
                )
        except sqlite3.IntegrityError as exc:
            raise DomainError("An exercise with this name already exists.") from exc

    def update_exercise_note(self, exercise_id: int, body: str) -> dict:
        note = None if not body.strip() else body
        with self.connect() as connection:
            self._exercise_row(connection, exercise_id)
            connection.execute(
                "UPDATE exercises SET exercise_note = ?, updated_at = ? WHERE id = ?",
                (note, self._utc_now(), exercise_id),
            )
            connection.commit()
            row = connection.execute(
                """
                SELECT e.*, EXISTS(
                    SELECT 1 FROM exercise_sets s WHERE s.exercise_id = e.id
                ) AS has_history FROM exercises e WHERE e.id = ?
                """,
                (exercise_id,),
            ).fetchone()
            return self._serialize_exercise(row, connection)

    def archive_exercise(self, exercise_id: int) -> dict:
        with self.connect() as connection:
            row = self._exercise_row(connection, exercise_id)
            if row["archived_at"] is None:
                connection.execute(
                    "UPDATE exercises SET archived_at = ?, updated_at = ? WHERE id = ?",
                    (self._utc_now(), self._utc_now(), exercise_id),
                )
                connection.commit()
            return self._serialize_exercise(self._exercise_row(connection, exercise_id), connection)

    def restore_exercise(self, exercise_id: int) -> dict:
        with self.connect() as connection:
            self._exercise_row(connection, exercise_id)
            connection.execute(
                "UPDATE exercises SET archived_at = NULL, updated_at = ? WHERE id = ?",
                (self._utc_now(), exercise_id),
            )
            connection.commit()
            return self._serialize_exercise(self._exercise_row(connection, exercise_id), connection)

    def delete_exercise(self, exercise_id: int, confirmation: str) -> None:
        if confirmation != "DELETE":
            raise DomainError("Type DELETE to permanently delete this exercise.")
        with self._backup_lock:
            with self.connect() as connection:
                self._exercise_row(connection, exercise_id)
                if connection.execute(
                    "SELECT 1 FROM exercise_sets WHERE exercise_id = ? LIMIT 1", (exercise_id,)
                ).fetchone():
                    raise DomainError(
                        "Exercises with history cannot be deleted; archive it instead."
                    )
            self.create_backup("pre-delete")
            with self.connect() as connection:
                connection.execute("DELETE FROM exercises WHERE id = ?", (exercise_id,))
                connection.commit()

    def _set_rows(
        self, connection: sqlite3.Connection, day: str, exercise_id: int
    ) -> list[sqlite3.Row]:
        return connection.execute(
            """
            SELECT * FROM exercise_sets
            WHERE entry_date = ? AND exercise_id = ?
            ORDER BY occurred_at, created_at, id
            """,
            (day, exercise_id),
        ).fetchall()

    def day(self, day_value: str) -> dict:
        self._parse_day(day_value)
        with self.connect() as connection:
            note = connection.execute(
                "SELECT body FROM daily_notes WHERE entry_date = ?", (day_value,)
            ).fetchone()
            photo_count = connection.execute(
                "SELECT COUNT(*) FROM daily_photos WHERE entry_date = ?", (day_value,)
            ).fetchone()[0]
            rows = connection.execute(
                """
                SELECT e.*, d.display_order
                FROM day_exercises d JOIN exercises e ON e.id = d.exercise_id
                WHERE d.entry_date = ? ORDER BY d.display_order
                """,
                (day_value,),
            ).fetchall()
            sections = []
            for exercise in rows:
                sets = [
                    self._serialize_set(row)
                    for row in self._set_rows(connection, day_value, exercise["id"])
                ]
                total = sum(
                    (item["repetitions"] or 0)
                    if exercise["measurement_type"] in {"repetitions", "timed_repetitions"}
                    else (item["durationMinutes"] or 0) * 60 + (item["durationSeconds"] or 0)
                    for item in sets
                )
                sections.append(
                    {
                        "exercise": self._serialize_exercise(exercise, connection),
                        "displayOrder": exercise["display_order"],
                        "total": total,
                        "sets": sets,
                    }
                )
        return {
            "date": day_value,
            "sections": sections,
            "dailyNote": note["body"] if note else None,
            "photoCount": photo_count,
        }

    def calendar(self, month: str) -> dict:
        if not re.fullmatch(r"\d{4}-\d{2}", month):
            raise DomainError("Month must use YYYY-MM.")
        try:
            first = date.fromisoformat(f"{month}-01")
        except ValueError as exc:
            raise DomainError("Month must be valid.") from exc
        next_month = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT DISTINCT entry_date FROM exercise_sets
                WHERE entry_date >= ? AND entry_date < ? ORDER BY entry_date
                """,
                (first.isoformat(), next_month.isoformat()),
            ).fetchall()
        return {"month": month, "activeDates": [row["entry_date"] for row in rows]}

    def prefill(self, exercise_id: int, day_value: str, time_value: str | None) -> dict:
        before = self._occurrence(day_value, time_value)
        with self.connect() as connection:
            exercise = self._exercise_row(connection, exercise_id)
            row = connection.execute(
                """
                SELECT * FROM exercise_sets
                WHERE exercise_id = ? AND occurred_at < ?
                ORDER BY occurred_at DESC, created_at DESC, id DESC LIMIT 1
                """,
                (exercise_id, before),
            ).fetchone()
            if row:
                result = self._serialize_set(row)
                if result["resistanceKind"] == "bodyweight" and not exercise["allow_bodyweight"]:
                    result["resistanceKind"] = "external"
                    result["weightKg"] = None
                elif result["resistanceKind"] == "external" and exercise["equipment"] is None:
                    result["resistanceKind"] = "bodyweight"
                    result["weightKg"] = None
                result["source"] = "previous"
                return result
            return {
                "source": "defaults",
                "repetitions": None,
                "durationMinutes": None,
                "durationSeconds": None,
                "holdMinutes": None,
                "holdSeconds": None,
                "resistanceKind": (
                    "external" if exercise["equipment"] is not None else "bodyweight"
                ),
                "weightKg": None,
            }

    def add_set(self, exercise_id: int, day_value: str, payload) -> dict:
        occurred_at = self._occurrence(day_value, payload.time)
        now = self._utc_now()
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            exercise = self._exercise_row(connection, exercise_id)
            if exercise["archived_at"] is not None:
                raise DomainError("Restore this exercise before adding a set.")
            reps, duration, hold, resistance, weight, equipment, custom = self._validate_set(
                exercise,
                payload.repetitions,
                payload.durationMinutes,
                payload.durationSeconds,
                payload.holdMinutes,
                payload.holdSeconds,
                payload.resistanceKind,
                payload.weightKg,
            )
            if (
                connection.execute(
                    "SELECT 1 FROM day_exercises WHERE entry_date = ? AND exercise_id = ?",
                    (day_value, exercise_id),
                ).fetchone()
                is None
            ):
                display_order = connection.execute(
                    "SELECT COALESCE(MAX(display_order), 0) + 1 FROM day_exercises WHERE entry_date = ?",
                    (day_value,),
                ).fetchone()[0]
                connection.execute(
                    "INSERT INTO day_exercises VALUES (?, ?, ?, ?)",
                    (day_value, exercise_id, display_order, now),
                )
            cursor = connection.execute(
                """
                INSERT INTO exercise_sets(
                    exercise_id, entry_date, occurred_at, repetitions,
                    duration_seconds, hold_seconds, resistance_kind, weight_grams, equipment,
                    custom_equipment, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    exercise_id,
                    day_value,
                    occurred_at,
                    reps,
                    duration,
                    hold,
                    resistance,
                    weight,
                    equipment,
                    custom,
                    now,
                    now,
                ),
            )
            connection.commit()
            row = connection.execute(
                "SELECT * FROM exercise_sets WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
            return self._serialize_set(row)

    def update_set(self, set_id: int, payload) -> dict:
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            current = connection.execute(
                "SELECT * FROM exercise_sets WHERE id = ?", (set_id,)
            ).fetchone()
            if current is None:
                raise DomainError("Set not found.")
            exercise = self._exercise_row(connection, current["exercise_id"])
            occurred_at = (
                current["occurred_at"]
                if payload.time is None
                else self._occurrence(current["entry_date"], payload.time)
            )
            reps, duration, hold, resistance, weight, equipment, custom = self._validate_set(
                exercise,
                payload.repetitions,
                payload.durationMinutes,
                payload.durationSeconds,
                payload.holdMinutes,
                payload.holdSeconds,
                payload.resistanceKind,
                payload.weightKg,
            )
            connection.execute(
                """
                UPDATE exercise_sets SET occurred_at = ?, repetitions = ?,
                    duration_seconds = ?, hold_seconds = ?, resistance_kind = ?, weight_grams = ?,
                    equipment = ?, custom_equipment = ?, updated_at = ? WHERE id = ?
                """,
                (
                    occurred_at,
                    reps,
                    duration,
                    hold,
                    resistance,
                    weight,
                    equipment,
                    custom,
                    self._utc_now(),
                    set_id,
                ),
            )
            connection.commit()
            return self._serialize_set(
                connection.execute("SELECT * FROM exercise_sets WHERE id = ?", (set_id,)).fetchone()
            )

    def delete_set(self, set_id: int) -> None:
        with self.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT * FROM exercise_sets WHERE id = ?", (set_id,)
            ).fetchone()
            if row is None:
                raise DomainError("Set not found.")
            connection.execute("DELETE FROM exercise_sets WHERE id = ?", (set_id,))
            if (
                connection.execute(
                    "SELECT 1 FROM exercise_sets WHERE entry_date = ? AND exercise_id = ? LIMIT 1",
                    (row["entry_date"], row["exercise_id"]),
                ).fetchone()
                is None
            ):
                connection.execute(
                    "DELETE FROM day_exercises WHERE entry_date = ? AND exercise_id = ?",
                    (row["entry_date"], row["exercise_id"]),
                )
            connection.commit()

    def create_backup(self, category: str) -> dict:
        """Take a consistent online snapshot; never copy a WAL database on disk."""
        if category not in {
            "daily",
            "weekly",
            "on-demand",
            "pre-restore",
            "pre-import",
            "pre-delete",
        }:
            raise DomainError("Invalid backup category.")
        with self._backup_lock:
            directory = self.settings.backup_directory
            directory.mkdir(parents=True, exist_ok=True)
            stamp = self.now_local().strftime("%Y%m%dT%H%M%S%z")
            path = directory / f"{category}-{stamp}.sqlite3"
            number = 1
            while path.exists():
                path = directory / f"{category}-{stamp}-{number}.sqlite3"
                number += 1
            try:
                # Deliberately fresh connections, not a request/transaction connection.
                source = sqlite3.connect(self.path, timeout=5)
                target = sqlite3.connect(path, timeout=5)
                try:
                    source.execute("PRAGMA foreign_keys = ON")
                    source.execute("PRAGMA busy_timeout = 5000")
                    target.execute("PRAGMA foreign_keys = ON")
                    target.execute("PRAGMA busy_timeout = 5000")
                    source.backup(target)
                    target.execute(
                        """
                        INSERT INTO backup_metadata(id, app_id, format_version, created_at, category)
                        VALUES (1, ?, ?, ?, ?)
                        ON CONFLICT(id) DO UPDATE SET app_id=excluded.app_id,
                            format_version=excluded.format_version,
                            created_at=excluded.created_at, category=excluded.category
                        """,
                        (
                            BACKUP_APP_ID,
                            BACKUP_FORMAT_VERSION,
                            self.now_local().isoformat(),
                            category,
                        ),
                    )
                    target.commit()
                    if target.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                        raise DomainError("Backup integrity check failed.")
                finally:
                    target.close()
                    source.close()
            except Exception:
                path.unlink(missing_ok=True)
                raise
            if category in {"daily", "weekly"}:
                self._prune(category, self.backup_settings()[f"{category}Retention"])
            elif category.startswith("pre-"):
                self._prune_safety()
            return self._backup_info(path)

    def _prune(self, category: str, retention: int) -> None:
        files = sorted(
            self.settings.backup_directory.glob(f"{category}-*.sqlite3"),
            key=lambda item: item.stat().st_mtime_ns,
            reverse=True,
        )
        for path in files[retention:]:
            path.unlink()

    def _prune_safety(self) -> None:
        paths = sorted(
            (
                path
                for category in ("pre-restore", "pre-import", "pre-delete")
                for path in self.settings.backup_directory.glob(f"{category}-*.sqlite3")
            ),
            key=lambda item: item.stat().st_mtime_ns,
            reverse=True,
        )
        for path in paths[self.backup_settings()["safetyRetention"] :]:
            path.unlink()

    def _backup_info(self, path: Path) -> dict:
        stat = path.stat()
        with sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True) as connection:
            row = connection.execute(
                "SELECT category, created_at FROM backup_metadata WHERE id = 1"
            ).fetchone()
        category, created_at = (
            row if row else ("unknown", datetime.fromtimestamp(stat.st_mtime, UTC).isoformat())
        )
        return {
            "id": path.name,
            "category": category,
            "createdAt": created_at,
            "sizeBytes": stat.st_size,
            "isSafety": category.startswith("pre-"),
        }

    def list_backups(self) -> list[dict]:
        directory = self.settings.backup_directory
        if not directory.exists():
            return []
        return [
            self._backup_info(path)
            for path in sorted(
                directory.glob("*.sqlite3"), key=lambda item: item.stat().st_mtime_ns, reverse=True
            )
        ]

    def backup_path(self, backup_id: str) -> Path:
        if Path(backup_id).name != backup_id:
            raise DomainError("Invalid backup identifier.")
        path = (self.settings.backup_directory / backup_id).resolve()
        directory = self.settings.backup_directory.resolve()
        if path.parent != directory or not path.is_file():
            raise DomainError("Backup not found.")
        return path

    def delete_backup(self, backup_id: str) -> None:
        with self._backup_lock:
            self.backup_path(backup_id).unlink()

    def _validate_restore_source(self, path: Path, *, marked: bool = True) -> None:
        try:
            source = sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)
            source.row_factory = sqlite3.Row
            try:
                if source.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                    raise DomainError("Backup integrity check failed.")
                if source.execute("PRAGMA foreign_key_check").fetchone() is not None:
                    raise DomainError("Backup foreign key check failed.")
                if marked:
                    metadata = source.execute(
                        "SELECT app_id, format_version FROM backup_metadata WHERE id = 1"
                    ).fetchone()
                    if metadata is None or metadata["app_id"] != BACKUP_APP_ID:
                        raise DomainError("Backup is not a Rostam database.")
                    if metadata["format_version"] != BACKUP_FORMAT_VERSION:
                        raise DomainError("Backup format is not supported.")
                elif (
                    source.execute(
                        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='exercises'"
                    ).fetchone()
                    is None
                ):
                    raise DomainError("Import is not a compatible Rostam database.")
                newest = source.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
                if newest is not None and newest > SCHEMA_VERSION:
                    raise DomainError("Backup schema is newer than this Rostam version.")
            finally:
                source.close()
        except (sqlite3.Error, OSError) as exc:
            raise DomainError("Backup is not a valid SQLite database.") from exc

    def _copy_database(self, source_path: Path, destination: Path) -> None:
        source = sqlite3.connect(f"{source_path.resolve().as_uri()}?mode=ro", uri=True)
        target = sqlite3.connect(destination, timeout=5)
        try:
            source.backup(target)
        finally:
            target.close()
            source.close()

    def _verify_live_database(self) -> None:
        with self.connect() as connection:
            if connection.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise DomainError("Restored database integrity check failed.")
            if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise DomainError("Restored database foreign key check failed.")
            connection.execute(
                """
                UPDATE backup_metadata
                SET app_id = ?, format_version = ?, created_at = ?, category = 'live'
                WHERE id = 1
                """,
                (BACKUP_APP_ID, BACKUP_FORMAT_VERSION, self._utc_now()),
            )
            connection.commit()

    def restore_backup(self, backup_id: str, confirmation: str) -> dict:
        with self._backup_lock:
            source_path = self.backup_path(backup_id)
            return self.restore_path(source_path, confirmation, source=backup_id)

    def _stage_database(self, source_path: Path) -> Path:
        with tempfile.NamedTemporaryFile(
            prefix="rostam-stage-", suffix=".sqlite3", dir=self.path.parent, delete=False
        ) as temporary:
            staged = Path(temporary.name)
        try:
            self._copy_database(source_path, staged)
            return staged
        except (sqlite3.Error, OSError) as exc:
            staged.unlink(missing_ok=True)
            raise DomainError("Backup is not a valid SQLite database.") from exc

    def _replacement(
        self, source_path: Path, confirmation: str, *, source: str, marked: bool, category: str
    ) -> dict:
        if confirmation != "RESTORE":
            raise DomainError("Type RESTORE to replace the live database.")
        with self._backup_lock, self._database_lock:
            staged = self._stage_database(source_path)
            try:
                self._validate_restore_source(staged, marked=marked)
                current_settings = self.backup_settings()
                staged_db = MonsterSetsDatabase(
                    Settings(staged, self.settings.timezone_name, self.settings.timezone)
                )
                staged_db._verify_live_database()
                self._validate_restore_source(staged)
                safety_backup = self.create_backup(category)
                # Keep policy owned by the live server, never by historical data.
                staged_db.update_backup_settings(current_settings)
                os.replace(staged, self.path)
                for suffix in ("-wal", "-shm"):
                    Path(f"{self.path}{suffix}").unlink(missing_ok=True)
            finally:
                staged.unlink(missing_ok=True)
            return {"source": source, "safetyBackup": safety_backup}

    def restore_path(self, source_path: Path, confirmation: str, *, source: str) -> dict:
        return self._replacement(
            source_path, confirmation, source=source, marked=True, category="pre-restore"
        )

    def import_path(self, source_path: Path, confirmation: str, *, source: str) -> dict:
        if confirmation != "IMPORT":
            raise DomainError("Type IMPORT to replace the live database.")
        return self._replacement(
            source_path, "RESTORE", source=source, marked=False, category="pre-import"
        )

    def backup_settings(self) -> dict:
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM backup_settings WHERE id = 1").fetchone()
        return {
            "dailyEnabled": bool(row["daily_enabled"]),
            "dailyTime": row["daily_time"],
            "dailyRetention": row["daily_retention"],
            "weeklyEnabled": bool(row["weekly_enabled"]),
            "weeklyWeekday": row["weekly_weekday"],
            "weeklyTime": row["weekly_time"],
            "weeklyRetention": row["weekly_retention"],
            "safetyRetention": row["safety_retention"],
        }

    def record_backup_failure(self, message: str) -> None:
        notification = {"message": message, "createdAt": self.now_local().isoformat()}
        try:
            with self.connect() as connection:
                connection.execute(
                    "INSERT INTO system_notifications(message, created_at) VALUES (?, ?)",
                    (notification["message"], notification["createdAt"]),
                )
                connection.commit()
        except (sqlite3.Error, OSError):
            self._backup_notifications.append(notification)

    def backup_notifications(self) -> list[dict[str, str]]:
        try:
            with self.connect() as connection:
                saved = [
                    {"message": row["message"], "createdAt": row["created_at"]}
                    for row in connection.execute(
                        "SELECT message, created_at FROM system_notifications ORDER BY id DESC LIMIT 20"
                    )
                ]
            return self._backup_notifications + saved
        except (sqlite3.Error, OSError):
            return self._backup_notifications.copy()

    def update_backup_settings(self, payload: dict) -> dict:
        required = set(self.backup_settings())
        if (
            set(payload) != required
            or any(
                not isinstance(payload[key], int) or not 1 <= payload[key] <= 365
                for key in ("dailyRetention", "weeklyRetention", "safetyRetention")
            )
            or not isinstance(payload["dailyEnabled"], bool)
            or not isinstance(payload["weeklyEnabled"], bool)
            or not isinstance(payload["weeklyWeekday"], int)
            or not 0 <= payload["weeklyWeekday"] <= 6
            or any(
                not isinstance(payload[key], str)
                or not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", payload[key])
                for key in ("dailyTime", "weeklyTime")
            )
        ):
            raise DomainError("Invalid backup schedule settings.")
        with self.connect() as connection:
            connection.execute(
                "UPDATE backup_settings SET daily_enabled=?, daily_time=?, daily_retention=?, weekly_enabled=?, weekly_weekday=?, weekly_time=?, weekly_retention=?, safety_retention=? WHERE id=1",
                (
                    payload["dailyEnabled"],
                    payload["dailyTime"],
                    payload["dailyRetention"],
                    payload["weeklyEnabled"],
                    payload["weeklyWeekday"],
                    payload["weeklyTime"],
                    payload["weeklyRetention"],
                    payload["safetyRetention"],
                ),
            )
            connection.commit()
        self._prune("daily", payload["dailyRetention"])
        self._prune("weekly", payload["weeklyRetention"])
        self._prune_safety()
        return self.backup_settings()

    def run_scheduled_backups(self) -> None:
        now = self.now_local()
        config = self.backup_settings()
        today = now.date()
        with self.connect() as connection:
            runs = {
                row["category"]: row["last_scheduled_date"]
                for row in connection.execute("SELECT * FROM backup_runs")
            }
        schedules = (
            ("daily", config["dailyEnabled"], today, config["dailyTime"]),
            ("weekly", config["weeklyEnabled"], today, config["weeklyTime"]),
        )
        for category, enabled, logical_date, scheduled_time in schedules:
            if (
                not enabled
                or now.strftime("%H:%M") < scheduled_time
                or (category == "weekly" and today.weekday() != config["weeklyWeekday"])
            ):
                continue
            if runs.get(category) == logical_date.isoformat():
                continue
            self.create_backup(category)
            with self.connect() as connection:
                connection.execute(
                    """
                    INSERT INTO backup_runs(category, last_scheduled_date) VALUES (?, ?)
                    ON CONFLICT(category) DO UPDATE SET last_scheduled_date=excluded.last_scheduled_date
                    """,
                    (category, logical_date.isoformat()),
                )
                connection.commit()
