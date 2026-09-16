# Repository Guidelines

## Project Structure & Module Organization

MonsterSets is a private daily exercise ledger with a FastAPI backend and React single-page frontend. Backend code lives in `backend/app/`: `main.py` defines HTTP routes, `schemas.py` defines request/response models, `database.py` owns SQLite persistence and domain rules, and `config.py` reads environment settings. Backend tests are in `backend/tests/`.

The frontend is in `frontend/src/`. Put page-level UI in `components/`, API calls and shared TypeScript types in `lib/`, and global styling in `styles.css`. Public PWA files live in `frontend/public/`; build and asset scripts are in `frontend/scripts/`. Deployment configuration is under `deploy/`.

## Build, Test, and Development Commands

Use Python 3.12+ and Node 24+.

- `python3 -m venv .venv && .venv/bin/pip install -e './backend[dev]'` creates the backend development environment.
- `TZ=Europe/Warsaw ROSTAM_DB=./data/rostam.sqlite3 .venv/bin/python -m uvicorn app.main:app --app-dir backend --reload` runs the API locally.
- `cd frontend && npm ci && npm run dev` starts Vite; `/api` is proxied to port 8000.
- `cd frontend && npm run build` type-checks, syncs exercise assets, and creates the production/PWA bundle.
- `cd deploy && docker compose up -d` runs the published container using `deploy/data` for persistent SQLite data.

## Coding Style & Naming Conventions

Use four spaces and Ruff for Python; keep lines within the configured 100-character limit. Use `snake_case` for Python functions and test names. TypeScript/TSX uses two-space indentation, `PascalCase` components (for example, `ExercisePicker.tsx`), and camelCase values and helpers. Run `npm run lint` and `npm run typecheck`; do not hand-edit generated assets or `frontend/package-lock.json` except through npm.

## Testing Guidelines

Run the full checks before opening a PR:

```sh
.venv/bin/pytest backend/tests
.venv/bin/ruff check backend && .venv/bin/ruff format --check backend
cd frontend && npm test -- --run && npm run typecheck && npm run lint && npm run build
```

Add backend tests as `test_*.py` and frontend tests as `*.test.ts` or `*.test.tsx`. Cover changed domain behavior, API-facing UI states, and edge cases; use Playwright via `npm run test:e2e` when a workflow needs browser-level coverage.

## Commit & Pull Request Guidelines

The existing history uses short, imperative summaries (for example, `Initial MonsterSets implementation`). Follow that style, keeping each commit focused. PRs should explain the user-visible change and implementation rationale, link relevant issues, list validation commands, and include screenshots for UI changes. Do not commit SQLite databases, backups, or local secrets; configure `TZ` and `ROSTAM_DB` through the environment.
