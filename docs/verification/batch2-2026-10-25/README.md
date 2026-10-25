# Batch 2 verification — 25 October 2026

## Local implementation evidence

- Production build succeeds with no Workbox warnings. Essential precache: **10 files, 389,066 uncompressed bytes**, below the 1 MiB target. The build output reports the count and byte total and writes `precache-report.json` under ignored `frontend/dist/`.
- Playwright measured **419,940 bytes** across the initial page's completed browser requests for a cold fixture load. This included the 232,920-byte entry JS response, CSS, shared static JS, 306,801-byte desktop WebP background, 19,106-byte logo, initial API reads, and the first visible note chunk. The entry JS was **75.04 KB gzip**; the CSS was **9.11 KB gzip**.
- The Playwright page request events do not include requests owned by the service worker during its installation/precache. Therefore 419,869 bytes is the observed page waterfall, not a complete end-to-end cold-install transfer total. The strict ≤500 KB whole-install transfer budget remains unverified; the independent essential-precache budget passes.
- Artwork catalog generation yields 302 `{slug, name}` records. A focused equivalence test checks the generated catalog against the package source; versioned illustration URLs retain existing stored image keys.
- Two-build Chromium coverage passes for deferred navigation, failed-chunk guarded reload, first install without a reload loop, waiting-worker behavior, clean multi-tab activation, dirty-tab blocking, requester discard cancellation/confirmation, pending writes, simultaneous restart requests, five-second unresponsive-tab abort, and cache exclusions.
- Cache inspection confirms API and custom exercise-photo URLs are not cached, and no write queue is created. Generated cache routes cap public artwork at 100 entries and deferred JS/CSS at 32 entries, each with a 30-day lifetime.
- Checks passed: backend **70 tests**, Ruff check/format; frontend **80 tests**, typecheck, lint, production build; Playwright **10 scenarios**; `git diff --check`.

## Screenshots

Loading and error states were captured at 390×844 and 1440×1000 in light and dark color schemes. Update-ready is shown in dark phone layout; the dirty-other-tab blocker is shown in dark desktop layout.

- `loading-light-phone.png`, `loading-dark-phone.png`, `loading-light-desktop.png`, `loading-dark-desktop.png`
- `error-light-phone.png`, `error-dark-phone.png`, `error-light-desktop.png`, `error-dark-desktop.png`
- `update-dark-phone.png`, `blocked-dark-desktop.png`

## Not yet verified

- Local browser fixtures validate the two-build update protocol, not the actual NAS HTTPS deployment. Repeat delivery, worker update, and cache checks after deployment.
- No installed iPhone or Android verification has been performed.
- A complete service-worker-inclusive network waterfall, throttled cold/warm timings, and CPU-throttled performance were not measured.
- The update screenshot and blocked screenshot each show one representative theme/viewport; only loading and error have the full light/dark phone/desktop matrix.
