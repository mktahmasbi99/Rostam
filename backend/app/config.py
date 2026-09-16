from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass(frozen=True)
class Settings:
    database_path: Path
    timezone_name: str
    timezone: ZoneInfo

    @property
    def backup_directory(self) -> Path:
        return self.database_path.parent / "backups"


def load_settings() -> Settings:
    timezone_name = os.environ.get("TZ", "Europe/Warsaw")
    try:
        timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise RuntimeError(f"TZ must be a valid IANA timezone; got {timezone_name!r}") from exc
    database_path = Path(os.environ.get("ROSTAM_DB", "./data/rostam.sqlite3"))
    return Settings(database_path=database_path, timezone_name=timezone_name, timezone=timezone)
