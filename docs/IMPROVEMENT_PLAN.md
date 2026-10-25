# Performance and GUI improvement plan

Planning baseline: 25 October 2026, commit `6723c90`.

This document tracks the agreed work across chats, commits, and pull requests. Planning only: no application fixes have been implemented by creating this document.

## Agreed scope

- Implement R1–R11 from the performance and GUI audit.
- R9 archive pagination is explicitly confirmed: apply it to Photos, daily/activity Notes, and Measurements history, preserving the existing paginated per-exercise history and correct measurement summaries/trends.
- Exclude R12. GitHub protection was verified: required GitHub Actions `test`, strict up-to-date checks, required PRs, administrator enforcement, and no force pushes/deletion. Keep PR validation and post-merge publishing without duplicate full tests.
- Include the agreed disconnected warning and user-controlled app-update prompt, tracked as C1 and U1 below.
- Other optional audit suggestions are outside this plan unless needed for these changes or subsequently approved.

### Connection and storage contract

- Require a reachable Rostam server for edits and saves. Browser `online` status alone is insufficient.
- Detect disconnection, show a clear persistent warning, and disable editing and mutation actions while disconnected or while initial reachability is unconfirmed.
- Do not persist ledger changes/drafts to localStorage, IndexedDB, service-worker caches, or an offline write queue. Do not replay or automatically retry writes after reconnection.
- Existing unsaved input may remain in the currently open form's memory, with editing blocked while disconnected. It is not saved locally and must not be silently submitted on reconnect. Warn before a user-requested reload would discard it.
- Report a save as successful only after the server confirms it. An interrupted response can leave the result uncertain: refresh/reconcile from the server before offering a retry that could duplicate a record.
- Static app files and bundled illustrations may be cached for delivery efficiency. Do not add an offline ledger-data cache or precache private uploaded photos.
- When an update is ready, offer “Restart to update”; do not force a reload over unsaved input or a pending write.

## How to track progress

Use the checklist below as the source of truth. Preserve the IDs in commit messages/PR descriptions so the original audit remains traceable.

Statuses: **Planned → In progress → Verified → Merged**. Use **Blocked** only with a concrete reason and next step. Check a task's box when implementation and its acceptance checks pass; record merge status separately so “works locally” is never confused with “released.”

For each batch, fill in its evidence row: commit SHA, PR link, tests/measurements/screenshots, outstanding limitations, and merge status. Update this file alongside the code in that batch. Commits are implementation checkpoints; PRs carry review/CI evidence; this document gives the overall view. No external issue tracker is required.

## Batch 1 — smaller images and efficient HTTP delivery

- [x] **R1 — Optimize global artwork.** Generate appropriately sized modern-format background/logo assets through scripts, retain required icons/fallbacks and attribution, and preserve the visual identity. Compare light/dark desktop and phone views.
- [x] **R2 — Compression and caching.** Compress compressible responses; cache content-hashed assets with immutable headers; revalidate HTML and the service worker. Version image URLs where necessary. Keep API ledger responses uncached and check actual deployment-proxy behavior when accessible.

Acceptance: record before/after cold-transfer sizes; verify compression with GET responses, MIME types, cache headers, and conditional requests; inspect images visually. Avoid claiming deployment verification from localhost headers alone.

Status: Verified and merged; R1/R2 visual and HTTPS endpoint acceptance passed on 25 October 2026. Commits: `5233f8d` (R1/R2 implementation), `def68ad` and `6f98383` (delivery evidence), `c40f058` and `511a86e` (navigation and field-focus polish). PR: [#6](https://github.com/mktahmasbi99/Rostam/pull/6), merged into `master` as `76487f1` on 25 October 2026; GitHub reported two checks passed after merge. Evidence: baseline frontend build 13,896,801 bytes; updated build 12,358,927 bytes (1,537,874 bytes smaller, 11.1%). Original background+logo: 3,110,365 bytes; generated background+logo variants: 1,356,048 bytes (56.4% smaller across all fallbacks). Summed direct-response `Content-Length` for the cold app shell, API reads, SW install/precache, and first background image: baseline 13,693,583 bytes; updated 12,092,390 bytes (1,601,193 bytes smaller, 11.7%). This is an ASGI response-size estimate without TLS/TCP overhead or network throttling. Backend delivery tests and frontend tests, typecheck, lint, and build passed; local checks confirm gzip, MIME types, immutable hashed assets, revalidated HTML/service worker, API no-store, and conditional HTML revalidation. A fresh-origin browser load installed the service worker. Baseline/current screenshots were visually compared at 390px and 1440px in the system-selected dark theme; composition and layout remain consistent, and the phone selects the 768px WebP background and 112px WebP logo. The follow-up UI changes hide forward-day navigation on Today and remove yellow field outlines while retaining a subtle focus-border cue. They were visually checked in the localhost preview; the full test suite was not rerun after these follow-ups. Light/dark phone and desktop screenshots were subsequently saved and compared; see the verification evidence below.

Post-merge HTTPS probe (25 October 2026, 14:08 UTC): the NAS homepage returned HTTP 200. `/api/config` returned HTTP 200 with `Cache-Control: no-store`. A GET for `/assets/index-BjDes3Y3.js`, sent with `Accept-Encoding: gzip`, returned HTTP 200 but no `Content-Encoding`, `Vary: Accept-Encoding`, or `Cache-Control: public, max-age=31536000, immutable`. This endpoint therefore does not yet verify the merged build's static-delivery behavior; the deployed build identity was not confirmed, so the missing headers cannot be attributed conclusively to the application or proxy. Repeat this probe after the merged build is deployed. Merged: Yes (`76487f1`).

Follow-up acceptance (25 October 2026): saved and visually inspected baseline/current Today screenshots at 390px and 1440px in both themes, plus four focused-search screenshots. No horizontal overflow or JavaScript page errors; artwork composition and logo appearance remain consistent. Actual NAS HTTPS GETs now verify gzip and immutable caching for the current JS/CSS, correct WebP/JPEG MIME types and immutable artwork caching, revalidated HTML/service worker, API `no-store`, and conditional HTML `304`. Served CSS matches the local build; served JS matches after normalizing three generated artwork filename hashes. Exact running container digest/revision was not inspected; user reports latest commit deployed. Full evidence, scope and remaining final-release limitations: [R1/R2 verification report](verification/batch1-2026-10-25/README.md). R1/R2 acceptance is complete; broader final acceptance below remains pending.

## Batch 2 — lighter loading and controlled PWA updates

- [x] **R4 — Split deferred UI and trim the picture catalog.** Lazy-load secondary pages/editor content with consistent fallbacks. Generate only the artwork metadata actually used. Keep navigation usable during chunk loading and handle failed chunk loads.
- [x] **R3 — Small precache.** Precache the essential shell rather than every illustration/deferred feature. Load public illustration assets as needed with bounded caching. Surface Workbox warnings and intentionally support new image formats.
- [x] **U1 — Update prompt.** Keep a new service worker waiting until the user chooses to restart. Show a version-ready notification and avoid duplicate prompts/reload loops. Coordinate activation across open tabs and protect unsaved forms/pending writes.

Acceptance: measure initial JS and precache bytes/file count; verify cold/warm navigation; upgrade an already-open old version with and without a dirty form and with multiple tabs. Confirm no API/private-ledger write queue or cache exists. Proposed budgets: initial essential shell ≤500 KB transferred and essential precache ≤1 MB; report exceptions rather than hiding assets from the measurements.

Status: R3 and R4 implementation verified locally; U1 update coordination verified in the two-build production fixture. R3's 10-file essential precache is 392,120 bytes; production Playwright page-observed cold-install transfer is 344,747 bytes including response headers, within the proposed limits. The 1214px desktop WebP is 230,228 bytes, down from 306,578. The deployed NAS build has not been refreshed, and browser page events may omit service-worker import/precache traffic; verify transfer and old-to-new update against the deployed build as part of final acceptance. Commit: —. PR: —. Evidence: [Batch 2 verification report](verification/batch2-2026-10-25/README.md), including prior live NAS build identity and screenshots plus updated local R3 measurements and 12 passing production Playwright scenarios. Backend 70 tests, Ruff check/format, frontend 86 tests, typecheck/lint/build, Playwright 12 scenarios, and `git diff --check` passed on this branch. Installed-device checks, throttled timings, and NAS update verification remain pending. Merged: No.

## Batch 3 — shared request states and connection safety

- [x] **R7 — Search requests.** Debounce text changes around 250–300ms, cancel obsolete reads, and ignore out-of-order results. Filters may apply immediately. Avoid eagerly fetching archived results unnecessarily.
- [x] **R8 — Loading/error/empty states.** Distinguish these states consistently, offer retry for reads, retain visible data during refresh where appropriate, and protect a dirty draft from late responses. Load a note independently before editing it rather than assuming absence from a paginated list means no note exists.
- [x] **C1 — Connection warnings and mutation blocking.** Centralize server reachability checks and request-failure handling; distinguish a lost connection from validation/auth/server errors. Block all mutation entry points, including open forms, uploads, restores, and deletes, when disconnected. Resume only after the server is confirmed reachable. No automatic write replay.

Acceptance: delayed and out-of-order replies; server unavailable while the device still has internet; offline startup; disconnect with an open form; interrupted save response; reconnect without replay; no false “saved” message; no locally persisted draft. Classify HTTP errors correctly so a validation error does not make the whole app appear offline.

Status: Verified locally; not merged. Commit: `0e942c3`. PR: —. Evidence: backend 70 tests, Ruff check/format, frontend 86 tests, typecheck, lint, and production build passed; Playwright 12 scenarios passed, including delayed/out-of-order exercise searches, offline startup while the browser remains online, disconnect with an open draft, interrupted-save reconciliation, and no write replay or locally persisted note. The 10-file essential precache is 392,120 uncompressed bytes. Reads now share loading/refresh/error/retry behavior on the ledger, search, notes, photo, calendar, measurement, rotation, backup, and history views; note drafts remain intact when a late response arrives. HTTP responses, including validation/server errors, confirm reachability; network loss blocks editing and all writes. A lost write response locks the app until a user-requested reload reconciles server data. Deployment and installed-device checks remain pending. Merged: No.

## Batch 4 — responsive and consistent shared GUI

- [ ] **R5 — Measurement layout.** Fix summary cards and single-metric/history-edit forms at narrow widths; accommodate long values and enlarged text.
- [ ] **R6 — Dialog behavior.** Share accessible initial focus, contained Tab/Shift+Tab, Escape dismissal, inert background, scroll locking, and focus restoration; include the calendar and nested-dialog cases.
- [ ] **R10 — Theme consistency.** Limit inversion to bundled monochrome exercise art, preserve custom photo colors, and unify save/success/switch/error tokens. Preserve familiar action meanings and assess light/dark contrast.

Acceptance: 320/360/390/430px and desktop checks; keyboard operation; text enlargement; both themes; custom photos; clean form exit and confirmation before destructive/reload actions where relevant. Save screenshots for visible changes. Include required focus indicators on the search controls affected by R6/R7 accessibility checks without silently expanding cosmetic scope.

Status: Planned. Commit: —. PR: —. Evidence: —. Merged: No.

## Batch 5 — bounded archive loading

- [ ] **R9a — Photos.** Return recent date groups first, add “Load older photos,” and lazy-load thumbnails. Keep a day's group intact where practical; do not retrieve full-size photos until requested.
- [ ] **R9b — Notes.** Paginate daily notes and activity notes with independent cursors/loading/error states and “Load older” controls. Use a stable date/time-plus-ID cursor where multiple entries share a timestamp.
- [ ] **R9c — Measurements.** Paginate the History list while keeping latest values and trend calculations based on the intended full data/date range via a separate bounded summary/trend response. Loading older rows must not silently change the meaning of a chart or latest value.

Existing per-exercise session history already requests 10 session dates at a time, with a cursor and a separate one-session previous-workout preview. Preserve that behavior; this task is not a rewrite of exercise history or pagination of today's exercise cards.

Start with explicit “Load older” controls rather than infinite scrolling. Proposed batch sizes: photos by recent date groups, notes around 30 records per section, measurements around 50 rows. Final sizes should follow payload/large-data measurements and remain capped server-side.

Acceptance: synthetic multi-year archives; bounded initial API payloads and image requests; correct chronological ordering; no dropped/duplicated entries between pages; error/retry for later pages; reset after edits/deletes/filter changes; today-note editing unaffected by pagination; measurement latest/trends remain correct before and after loading older history. There is no universal record count at which pagination becomes necessary: compare bytes, request counts, render time, and responsiveness under the target network/device conditions.

Status: Planned. Commit: —. PR: —. Evidence: —. Merged: No.

## Batch 6 — bounded image uploads and processing

- [ ] **R11 — Upload safeguards and image variants.** Check selected count early, cap per-file and aggregate streamed reads, enforce authoritative per-day limits transactionally, handle invalid/decompression-heavy images, and run blocking image processing outside the async event loop with bounded concurrency. Add a small exercise-image display variant while retaining any image detail needed by the editor. Preserve EXIF orientation, supported phone image formats, and backup self-containment.

Acceptance: excessive count/size, invalid image, existing nearly-full day, concurrent uploads, interrupted upload, supported formats/orientation, and a health/read request during processing. Do not silently change upload limits without documenting the chosen limits. Verify display variants and backup/restore behavior. Optional client-side conversion remains a separate decision unless server-side work proves insufficient.

Status: Planned. Commit: —. PR: —. Evidence: —. Merged: No.

## Final acceptance and release

- [ ] Every scoped ID has evidence and no unfinished dependency.
- [ ] Full backend tests, Ruff lint/format, frontend tests/typecheck/lint/build pass before opening each PR, as required by repository guidelines.
- [ ] Add focused browser regression coverage for responsive forms, dialogs, connection handling, archive loading, and service-worker updates as part of the relevant batches. This does not require changing the existing PR-versus-publish policy.
- [ ] Compare cold/warm production loads under shared-bandwidth throttling at 400 Kbps and 1 Mbps with latency; record time to usable Today and transfer sizes. Add CPU throttling when supported.
- [ ] Validate the actual private HTTPS deployment and installed iPhone/Android behavior when available. Mark these Pending until performed; a desktop viewport is not real-device verification.
- [ ] PR checks pass and the branch is up to date; merge through existing protections. Verify the container publish and post-deployment connection/update flow. Do not repeat full tests after merge solely for redundancy.

Merge/deployment is a separate step from local verification. Do not mark deployment complete without observing the actual published/deployed version. Preserve the user's configured Git author identity and the required Codex co-author trailer on contributed commits.
