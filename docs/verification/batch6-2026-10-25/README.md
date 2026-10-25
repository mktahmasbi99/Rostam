# Batch 6 — upload safeguards and image variants

Date: 25 October 2026

## Chosen limits

- Maximum 10 daily photos per day and per upload request.
- Maximum 50 MiB for each source image and 100 MiB total source bytes in one daily-photo request.
- Maximum 80 megapixels after reading source dimensions, before full decode.
- Daily photo storage remains a JPEG no larger than a 2560px edge and 5 MiB, plus a 480px thumbnail.
- Custom exercise images are stored as a JPEG with a 512px maximum edge. The current app displays them at 52–68 CSS pixels and offers no detailed image editor, so it does not retain a larger second variant.
- At most two image decodes/encodes may run concurrently. Upload bytes are read in 1 MiB chunks; image processing runs in a worker thread.

The 10-photo/day and 50 MiB/file policies were already present and remain unchanged. The aggregate request cap, decoded-pixel cap, and worker concurrency bound are new and documented here and in `docs/IMPROVEMENT_PLAN.md`.

## Verification

Automated tests cover early rejection of over-count requests, streamed per-file and aggregate caps, invalid images, a batch that fails before any rows are inserted, simulated request interruption before processing, a nearly full day, concurrent uploads that could otherwise exceed the day limit, JPEG/PNG/WebP/HEIF decoding, EXIF orientation, decompression-heavy dimensions, and a health request completing while upload processing runs in a worker. Exercise-image storage is checked at 512×256 for a 1200×600 source; its image survives a SQLite backup and restore.

Required checks:

- `.venv/bin/pytest backend/tests` — passed (89 tests; 2 upstream Starlette/httpx deprecation warnings).
- `.venv/bin/ruff check backend` — passed.
- `.venv/bin/ruff format --check backend` — passed.
- `cd frontend && npm test -- --run` — passed (96 tests across 23 files).
- `cd frontend && npm run typecheck` — passed.
- `cd frontend && npm run lint` — passed.
- `cd frontend && npm run build` — passed; essential PWA precache is 10 files / 395,719 uncompressed bytes.

## Remaining acceptance

Local test coverage does not verify actual browser uploads from installed iPhone/Android devices, reverse-proxy request-body limits, or production server memory/latency under large concurrent uploads. Verify those against the deployed service before marking overall final acceptance complete. No client-side image conversion was added.
