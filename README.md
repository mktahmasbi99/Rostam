# Rostam

Rostam is a private, observational daily exercise ledger. Record a set when it happens—or reconstruct the day later—without starting a workout session, chasing a goal, or carrying unfinished work into tomorrow.

## Why Rostam?

Rostam is named after the legendary hero of Ferdowsi’s *Shahnameh* (*Book of Kings*).

## What V1 does

- Logs repetition- and duration-based sets against a server-authoritative day and time.
- Treats bodyweight as an explicit resistance state. Entering `0` in the kg field is a shortcut that saves as Bodyweight, never as `0 kg`.
- Supports resistance bands, dumbbells, barbells, kettlebells, cables, weight machines, weighted vests, plates, ankle weights, sandbags, and custom equipment.
- Remembers the latest chronologically preceding set for each exercise and prefills its measurement and resistance.
- Keeps exercise type immutable, supports archive/restore for used exercises, and requires typing `DELETE` before permanently removing an unused exercise.
- Shows a neutral calendar dot for any day containing at least one set.
- Creates daily and weekly rotating backups (five of each), plus on-demand backups that persist until manually deleted.
- Installs as a connected-only PWA from the Settings page, with browser-specific guidance when a native install prompt is unavailable.

There are deliberately no goals, reminders, streaks, notes, perceived-effort fields, workout timers, or offline write queue in V1.

## Run locally

Requirements: Python 3.12+, Node.js 24+, and npm.

```sh
python3 -m venv .venv
.venv/bin/pip install -e './backend[dev]'
cd frontend
npm ci
npm run build
cd ..
TZ=Europe/Warsaw ROSTAM_DB=./data/rostam.sqlite3 \
  .venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`.

## Verify

```sh
.venv/bin/pytest backend/tests
.venv/bin/ruff check backend
.venv/bin/ruff format --check backend
cd frontend
npm test -- --run
npm run typecheck
npm run lint
npm run build
```

## Docker and NAS

The container stores the SQLite database and all backups under `/data`. The sample Compose file mounts that directory from `deploy/data` and expects the private GHCR image.

```sh
cd deploy
docker compose pull
docker compose up -d
```

Keep the service private behind Tailscale or another trusted network boundary; Rostam intentionally has no authentication in V1.

### Manual restore

Stop the container, make a safety copy of `deploy/data`, replace `rostam.sqlite3` with the chosen downloaded backup, then start the container again. Do not replace a live SQLite database.

## Data conventions

- Dumbbell kg means weight per dumbbell.
- Barbell kg means total loaded bar weight.
- Weighted bodyweight movements store added external load only.
- Resistance-band kg follows the value convention chosen by the user.
- Unilateral repetitions are recorded per side.
- Duration uses minutes and seconds; time means when the set occurred.

## Artwork and licenses

Rostam is MIT licensed. Exercise artwork comes from Bryl Lim's Workout Guide and is CC BY-SA 4.0; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for full attribution.
