# Batch 2 verification — 25 October 2026

## Local implementation evidence

- Production build succeeds with no Workbox warnings. Essential precache: **10 files, 389,066 uncompressed bytes**, below the 1 MiB target. The build output reports the count and byte total and writes `precache-report.json` under ignored `frontend/dist/`.
- Playwright measured **419,940 bytes** across the initial page's completed browser requests for a cold fixture load. This included the 232,920-byte entry JS response, CSS, shared static JS, 306,801-byte desktop WebP background, 19,106-byte logo, initial API reads, and the first visible note chunk. The entry JS was **75.04 KB gzip**; the CSS was **9.11 KB gzip**.
- Fresh live NAS cold load (25 October 2026): a new Chromium context reached build `03bdca65db558e847169` (`index-B4Dh2xei.js`) through the Tailscale HTTPS endpoint, installed and controlled by the service worker, and issued the precache requests. Browser-accounted positive response bodies totaled **531,308 bytes**. Playwright did not expose body sizes for the worker-import requests, so NAS-side gzip responses added `/sw.js` (**1,288 bytes**), Workbox (**7,445 bytes**), and the update coordinator (**1,125 bytes**). This gives a **minimum of 541,166 bytes (528.5 KiB) before HTTP headers**, exceeding the proposed 500,000-byte budget by at least **41,166 bytes (8.2%)**. Request and response headers add further transfer. The exact wire total was not captured; the budget exception is confirmed regardless. The 10-file essential precache remains **389,066 uncompressed bytes**, within the 1 MiB limit.
- Artwork catalog generation yields 302 `{slug, name}` records. A focused equivalence test checks the generated catalog against the package source; versioned illustration URLs retain existing stored image keys.
- Two-build Chromium coverage passes for deferred navigation, failed-chunk guarded reload, first install without a reload loop, waiting-worker behavior, clean multi-tab activation, dirty-tab blocking, requester discard cancellation/confirmation, pending writes, simultaneous restart requests, five-second unresponsive-tab abort, and cache exclusions.
- Cache inspection confirms API and custom exercise-photo URLs are not cached, and no write queue is created. Generated cache routes cap public artwork at 100 entries and deferred JS/CSS at 32 entries, each with a 30-day lifetime.
- Checks passed: backend **70 tests**, Ruff check/format; frontend **80 tests**, typecheck, lint, production build; Playwright **10 scenarios**; `git diff --check`. The two-build fixture covers the waiting update prompt, clean and dirty tabs, pending writes, requester cancel/discard, timeouts, and simultaneous restart requests.

## Screenshots

Loading and error states were captured at 390×844 and 1440×1000 in light and dark color schemes. Update-ready is shown in dark phone layout; the dirty-other-tab blocker is shown in dark desktop layout.

- `loading-light-phone.png`, `loading-dark-phone.png`, `loading-light-desktop.png`, `loading-dark-desktop.png`
- `error-light-phone.png`, `error-dark-phone.png`, `error-light-desktop.png`, `error-dark-desktop.png`
- `update-dark-phone.png`, `blocked-dark-desktop.png`

## Not yet verified

- Live NAS HTTPS delivery was verified against the running `dev` image: the container, direct port, public URL, and fresh browser context all reported build `03bdca65db558e847169` and entry bundle `index-B4Dh2xei.js`. A real old-to-new update has not been performed on the NAS because only one build is deployed; update coordination was tested with the two-build production fixture.
- No installed iPhone or Android verification has been performed.
- The cold-load response-body lower bound exceeds the 500 KB transfer target; optimize the initial artwork/icon transfer or revise the budget based on product priorities. Exact wire bytes, throttled cold/warm timings, and CPU-throttled performance remain unmeasured.
- The update screenshot and blocked screenshot each show one representative theme/viewport; only loading and error have the full light/dark phone/desktop matrix.
