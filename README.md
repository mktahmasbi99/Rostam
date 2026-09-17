# Rostam

Rostam is a private, observational daily exercise ledger. Record a set when it happens—or reconstruct the day later—without starting a workout session, chasing a goal, or carrying unfinished work into tomorrow.

## Why Rostam?

Rostam is named after the legendary hero of Ferdowsi’s *Shahnameh* (*Book of Kings*).

## What V1 does

- Logs repetition- and duration-based sets against a server-authoritative day and time.
- Treats bodyweight as an explicit resistance state when the exercise permits it. Entering `0` in the kg field is a shortcut that saves as Bodyweight, never as `0 kg`.
- Locks equipment and bodyweight eligibility when an exercise is created, then derives titles such as `Squats (Resistance Bands)` and uses that equipment automatically while logging.
- Supports resistance bands, dumbbells, barbells, kettlebells, cables, weight machines, weighted vests, plates, ankle weights, sandbags, and custom equipment.
- Remembers the latest chronologically preceding set for each exercise and prefills its measurement and resistance.
- Keeps one current plaintext reference note per exercise for technique cues, video links, and progression reminders, shown directly on daily exercise cards.
- Keeps measurement type, equipment, and bodyweight eligibility immutable; supports archive/restore for used exercises; and requires typing `DELETE` before permanently removing an unused exercise.
- Shows a neutral calendar dot for any day containing at least one set.
- Creates daily and weekly rotating backups (five of each), plus on-demand backups that persist until manually deleted.
- Installs as a connected-only PWA from the Settings page, with browser-specific guidance when a native install prompt is unavailable.

There are deliberately no goals, reminders, streaks, date- or set-associated notes, perceived-effort fields, workout timers, or offline write queue in V1.

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

The container stores the SQLite database and all backups under `/data`. The sample Compose file mounts that directory from `deploy/data` and expects the private GHCR image.

```sh
cd deploy
docker compose pull
docker compose up -d
```

Keep the service private behind Tailscale or another trusted network boundary; Rostam intentionally has no authentication in V1.

### Restore

Settings can restore a server-held backup or an uploaded `.sqlite3` backup. Rostam validates the SQLite integrity, foreign keys, backup identifier, format, and schema before changing live data. Every restore requires typing `RESTORE` and first creates an on-demand safety backup of the current ledger. Uploaded files are temporary and are deleted after the operation.

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
