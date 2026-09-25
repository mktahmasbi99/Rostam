from __future__ import annotations

from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from app.config import Settings
from app.database import RostamDatabase


@pytest.fixture
def database(tmp_path: Path) -> RostamDatabase:
    return RostamDatabase(
        Settings(
            database_path=tmp_path / "rostam.sqlite3",
            timezone_name="Europe/Warsaw",
            timezone=ZoneInfo("Europe/Warsaw"),
        )
    )
