from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from zoneinfo import ZoneInfo

import pytest

from app.config import Settings
from app.database import RostamDatabase


def pytest_configure(config: pytest.Config) -> None:
    # Importing app.main during collection initializes its configured database.
    directory = TemporaryDirectory(prefix="rostam-test-app-")
    environment = pytest.MonkeyPatch()
    environment.setenv("ROSTAM_DB", str(Path(directory.name) / "rostam.sqlite3"))
    config.add_cleanup(directory.cleanup)
    config.add_cleanup(environment.undo)


@pytest.fixture
def database(tmp_path: Path) -> RostamDatabase:
    return RostamDatabase(
        Settings(
            database_path=tmp_path / "rostam.sqlite3",
            timezone_name="Europe/Warsaw",
            timezone=ZoneInfo("Europe/Warsaw"),
        )
    )
