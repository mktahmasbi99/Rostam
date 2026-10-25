# Batch 5 — bounded archive loading

Verified locally on 25 October 2026. Implementation commit: `19696ec182b0c2b83ce53c10ae6ef1de640b967b`. PR: none; this batch has not been merged or deployed.

## Implementation

- Photos return the newest 20 date groups by default (server cap 100). A page includes every photo for each selected date, uses a date cursor, and the archive renders thumbnails with native lazy loading. Full-size images are still opened only when selected.
- Daily notes and activity notes have independent 30-record pages (server cap 100), loading and error states, retryable “Load older” controls, and independent cursors. Activity notes use the raw stored timestamp plus ID so timestamp precision and ties cannot skip or repeat entries.
- Measurement history returns 50 rows per request (server cap 100) and uses a `(date, id)` cursor. A separate summary/trend endpoint supplies the latest value and up to 100 chronological average buckets per metric across the full measurement range. Loading older history does not alter the displayed latest values or trend range. A save, edit, or delete refreshes the first page and summary.

## Evidence

- Backend: 73 tests pass. The synthetic archive test inserts 1,100 consecutive dates from 2023-01-01 across daily notes, two photos per date, body measurements, and activity notes. It walks each cursor to exhaustion, checks descending chronology and no missing or duplicate dates/IDs, verifies each photo group remains whole, and confirms the trend response is capped at 100 points per metric while retaining the latest date. Each photo page stays below 20 KiB in this fixture; the serialized collection is more than ten times the largest page.
- Frontend: 94 unit tests pass, including cursor-based older-page loading, lazy thumbnail attributes, and retrying a failed later page from the same cursor.
- Browser: all 16 Playwright scenarios pass, including the new Batch 5 scenario that loads older daily/activity notes, photo groups, and measurement rows on demand. Existing responsive, connection, dialog, and PWA scenarios also pass.
- Required repository checks pass: backend pytest, Ruff check/format; frontend unit tests, typecheck, lint, and production build. Build output includes a 10-file, 395,719-byte essential precache.

## Remaining acceptance

Production deployment and installed iPhone/Android checks are pending. The Playwright fixture confirms UI request behavior and the backend synthetic archive confirms bounded database pages; payload sizes, image request counts, render responsiveness, and latency should still be measured on the target deployment/device and network conditions.
