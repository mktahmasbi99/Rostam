from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.gzip import GZipMiddleware
from starlette.staticfiles import StaticFiles

from app import main
from app.main import load_hashed_assets, response_cache_control


def test_manifest_selects_only_hashed_built_assets(tmp_path: Path):
    manifest = tmp_path / ".vite" / "manifest.json"
    manifest.parent.mkdir()
    manifest.write_text(
        json.dumps(
            {
                "src/main.tsx": {
                    "file": "assets/index-1234abcd.js",
                    "css": ["assets/index-1234abcd.css"],
                    "assets": ["assets/logo-1234abcd.webp"],
                },
                "index.html": {"file": "index.html"},
            }
        )
    )
    assert load_hashed_assets(tmp_path) == frozenset(
        {
            "/assets/index-1234abcd.js",
            "/assets/index-1234abcd.css",
            "/assets/logo-1234abcd.webp",
        }
    )


def test_cache_policy_keeps_errors_uncached_and_api_private():
    hashed = frozenset({"/assets/app-1234abcd.js"})
    assert response_cache_control("/assets/app-1234abcd.js", 200, hashed) == (
        "public, max-age=31536000, immutable"
    )
    assert response_cache_control("/index.html", 200, hashed) == "no-cache"
    assert response_cache_control("/api/health", 200, hashed) == "no-store"
    assert response_cache_control("/missing.js", 404, hashed) is None


def test_gzip_and_static_revalidation_with_fixture(tmp_path: Path):
    asset_dir = tmp_path / "assets"
    asset_dir.mkdir()
    content = ("const payload = 'rostam';\n" * 300).encode()
    (asset_dir / "app-1234abcd.js").write_bytes(content)
    (asset_dir / "background-1234abcd.webp").write_bytes(b"webp" * 1000)
    (tmp_path / "index.html").write_text("<!doctype html><title>Rostam</title>")
    app = FastAPI()
    app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)

    @app.middleware("http")
    async def cache_headers(request, call_next):
        response = await call_next(request)
        cache_control = response_cache_control(
            request.url.path,
            response.status_code,
            frozenset({"/assets/app-1234abcd.js", "/assets/background-1234abcd.webp"}),
        )
        if cache_control:
            response.headers["Cache-Control"] = cache_control
        return response

    app.mount("/", StaticFiles(directory=tmp_path, html=True), name="fixture")
    client = TestClient(app)
    response = client.get("/assets/app-1234abcd.js", headers={"Accept-Encoding": "gzip"})
    assert response.status_code == 200
    assert response.headers["Content-Type"].startswith("text/javascript")
    assert response.headers["Cache-Control"] == "public, max-age=31536000, immutable"
    assert response.headers["Content-Encoding"] == "gzip"
    assert "accept-encoding" in response.headers["Vary"].lower()
    assert response.content == content

    identity = client.get("/assets/app-1234abcd.js", headers={"Accept-Encoding": "identity"})
    assert "Content-Encoding" not in identity.headers
    assert identity.content == content

    image = client.get("/assets/background-1234abcd.webp", headers={"Accept-Encoding": "gzip"})
    assert image.headers["Content-Type"] == "image/webp"
    assert "Content-Encoding" not in image.headers
    assert image.headers["Cache-Control"] == "public, max-age=31536000, immutable"

    html = client.get("/")
    assert html.headers["Content-Type"].startswith("text/html")
    assert html.headers["Cache-Control"] == "no-cache"
    etag = html.headers["ETag"]
    unchanged = client.get("/", headers={"If-None-Match": etag})
    assert unchanged.status_code == 304
    assert unchanged.headers["Cache-Control"] == "no-cache"

    missing = client.get("/missing.js")
    assert missing.status_code == 404
    assert "Cache-Control" not in missing.headers


def test_api_success_and_validation_errors_are_never_cached(database, monkeypatch):
    monkeypatch.setattr(main, "database", database)
    client = TestClient(main.app)
    assert client.get("/api/config").headers["Cache-Control"] == "no-store"
    invalid = client.get("/api/rotation-recommendations?days=0")
    assert invalid.status_code == 422
    assert invalid.headers["Cache-Control"] == "no-store"
