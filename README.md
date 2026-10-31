# Rostam

Rostam is a private, observational exercise ledger. Record individual sets throughout the day, track timed activities, or group exercises into a gym workout. Log as you go or reconstruct the day later.

## Why Rostam?

Rostam is named after the legendary hero of Ferdowsi’s *Shahnameh* (*Book of Kings*).

## What Rostam 2.0 does

- Logs repetition-, duration-, and timed-repetition sets against a server-authoritative day and time.
- Groups exercises and sets into live or backfilled workouts, with ordering, server-saved resumption, editable history, and start/end times. Workout sets share exercise history but do not advance daily rotations.
- Supports timed activities and daily exercise rotations.
- Treats bodyweight as an explicit resistance state when the exercise permits it. Entering `0` in the kg field is a shortcut that saves as Bodyweight, never as `0 kg`.
- Locks equipment and bodyweight eligibility when an exercise is created, then derives titles such as `Squats (Resistance Bands)` and uses that equipment automatically while logging.
- Supports resistance bands, dumbbells, barbells, kettlebells, cables, weight machines, weighted vests, plates, ankle weights, sandbags, and custom equipment.
- Remembers the latest chronologically preceding set for each exercise and prefills its measurement and resistance.
- Keeps one current plaintext reference note per exercise for technique cues, video links, and progression reminders, shown directly on daily exercise cards.
- Keeps private day-level notes and compressed JPEG photos (up to 10 per date) inside SQLite, so downloads and restores include them without affecting exercise calculations. Camera originals may be up to 50 MiB; processed stored photos are capped at 5 MiB each.
- Keeps measurement type, equipment, and bodyweight eligibility immutable; supports archive/restore for used exercises; and requires typing `DELETE` before permanently removing an unused exercise.
- Shows a green calendar dot for any day containing a saved set or logged activity. Workout sets count immediately; empty workouts do not.
- Creates WAL-safe SQLite snapshots in `/data/backups`: daily (7 retained), weekly (8 retained), safety snapshots (8 shared across restore/import/delete), and on-demand backups that persist until manually deleted.
- Installs as a connected-only PWA from the Settings page, with browser-specific guidance when a native install prompt is unavailable.

Reusable workout routines and rest timers are deferred; supersets are excluded. There are no goals, reminders, streaks, perceived-effort fields, or offline write queue. See [the 2.0.0 release notes](docs/RELEASE_2.0.0.md) for workout behavior and compatibility.

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

## Install on Android and iOS

Build the frontend with `npm run build` and serve it through the backend at a
trusted HTTPS address reachable from your phone. A plain HTTP LAN IP address
does not support service workers; localhost is only a development exception.
Keep the existing private network boundary when configuring HTTPS.

- **Android:** Open the HTTPS address in Chrome, open the browser menu, and choose
  **Install app** or **Add to Home screen**.
- **iPhone / iPad:** Open the address in Safari, choose **Share → Add to Home
  Screen**, keep **Open as Web App** enabled if shown, and tap **Add**.

The home-screen icon launches Rostam in a standalone window. The production
service worker caches the app shell, but ledger data and writes require a live
connection to the server. Installation does not copy the database to the phone.
Vite development mode does not register the service worker.

To verify a deployment, check that `/manifest.webmanifest`, its icons, and
`/sw.js` return successfully over HTTPS. Install and launch from the home screen
on each target device, then log a set and reopen the app to confirm it persists.

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

The container stores the SQLite database and all backups under `/data`. Photos are compressed JPEG BLOBs in that database, so photo-containing backups are larger but remain self-contained. The sample Compose file mounts that directory from `deploy/data` and expects the private GHCR image.

```sh
cd deploy
docker compose pull
docker compose up -d
```

Keep the service private behind Tailscale or another trusted network boundary; Rostam intentionally has no authentication in V1.

### Restore

Settings can restore a server-held backup or an uploaded `.sqlite3` backup. Rostam validates SQLite integrity, foreign keys, identifier, format, and schema in a staged file before changing live data. Every restore requires typing `RESTORE`, then creates a `pre-restore` safety snapshot before an atomic replacement. Uploaded restore/import files are limited to 100 MiB and are temporary.

Legacy database import is intentionally separate from restore and is an Advanced operation requiring `IMPORT`; it accepts only compatible older Rostam database shapes. Do not manually copy a live `rostam.sqlite3` while WAL is active: use the in-app backup download, which uses SQLite's online backup API. A downloaded backup is a full database snapshot, but does not include files outside SQLite or server configuration other than the backup policy retained during restore.

If the app cannot start or an in-app restore is unavailable, stop the container, make a safety copy of `deploy/data`, replace `rostam.sqlite3` with the chosen downloaded backup, then start the container again. Do not replace a live SQLite database while the service is running.

## Data conventions

- Dumbbell kg means weight per dumbbell.
- Barbell kg means total loaded bar weight.
- Weighted bodyweight movements store added external load only.
- Resistance-band kg follows the value convention chosen by the user.
- Unilateral repetitions are recorded per side.
- Duration uses minutes and seconds; time means when the set occurred.

## Artwork and licenses

Rostam is MIT licensed. Exercise artwork comes from Bryl Lim's Workout Guide and is CC BY-SA 4.0; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for full attribution.
