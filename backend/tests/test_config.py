from pathlib import Path

from app.config import load_settings


def test_local_database_path_is_writable_by_default(monkeypatch):
    monkeypatch.delenv("ROSTAM_DB", raising=False)

    settings = load_settings()

    assert settings.database_path == Path("data/rostam.sqlite3")


def test_database_path_can_use_the_container_mount(monkeypatch):
    monkeypatch.setenv("ROSTAM_DB", "/data/rostam.sqlite3")

    settings = load_settings()

    assert settings.database_path == Path("/data/rostam.sqlite3")
