# R1/R2 visual and HTTPS acceptance evidence

Verified 25 October 2026. Current local source: `511a86e`; original baseline: `6723c90`.

## Visual verification

Headless Chromium, device scale factor 1, viewports 390×900 and 1440×900, explicitly emulated light and dark color schemes. Service workers were blocked to avoid stale delivery. Baseline and current used the same fresh temporary local database, with seeded default exercises and an empty Today. No NAS ledger data was changed or included in screenshots.

The existing baseline build under `/tmp/rostam-batch1-cdRoqY/baseline/frontend/dist` was reused. Its App.tsx, styles.css, original logo and original background were checked byte-for-byte against Git baseline `6723c90`. The current production build was regenerated using `npm run build` (passed; existing large-JS-chunk warning remains for R4).

| Viewport/theme | Before | After | Focused search |
| --- | --- | --- | --- |
| Phone/light | [Baseline](baseline-light-390.png) | [Current](current-light-390.png) | [Search](focus-light-390.png) |
| Phone/dark | [Baseline](baseline-dark-390.png) | [Current](current-dark-390.png) | [Search](focus-dark-390.png) |
| Desktop/light | [Baseline](baseline-light-1440.png) | [Current](current-light-1440.png) | [Search](focus-light-1440.png) |
| Desktop/dark | [Baseline](baseline-dark-1440.png) | [Current](current-dark-1440.png) | [Search](focus-dark-1440.png) |

All twelve screenshots were visually inspected. Composition, logo transparency, colors and layout remain consistent; the resized background is slightly softer on phone, as expected, without objectionable artifacts at the tested viewport. No horizontal document overflow or JavaScript page errors were observed. The current app selects the 768px WebP background on phone, 1214px WebP on desktop, and the 112px WebP logo asset at scale factor 1. Today's forward arrow is absent; navigating back shows it and returns to Today. Focused search fields have a distinct border in both themes and no yellow outline. Full details are in `visual-results.json`.

Scope: Today/empty state, artwork and exercise-picker focus. This is not a full-page workflow audit, high-density screen test, keyboard accessibility audit, or installed iPhone/Android verification. Those broader checks remain in later batches/final acceptance.

## Actual NAS HTTPS delivery

Origin: `https://mosvault.taild64a6.ts.net:9445/`. Fresh curl GETs at approximately 14:14–14:18 UTC, without browser or service-worker caches. TLS verification was enabled. Header captures are saved beside this report.

| Request | Result | Evidence |
| --- | --- | --- |
| `/` | 200, HTML MIME, `Cache-Control: no-cache`, ETag | [Headers](html-headers.txt) |
| `/assets/index-UgFe52UZ.js`, accepting gzip | 200, JavaScript MIME, gzip, `Vary: Accept-Encoding`, immutable one-year cache | [Headers](js-headers.txt) |
| `/assets/index-BI4ZrNFB.css`, accepting gzip | 200, CSS MIME, gzip, `Vary: Accept-Encoding`, immutable one-year cache | [Headers](css-headers.txt) |
| `/sw.js` | 200, JavaScript MIME, `Cache-Control: no-cache` | [Headers](service-worker-headers.txt) |
| `/api/config` | 200, JSON MIME, `Cache-Control: no-store` | [Headers](api-config-headers.txt) |
| `/` with matching `If-None-Match` | 304, `Cache-Control: no-cache` | [Headers](conditional-html-headers.txt) |
| `/assets/background-768-BCq_uF21.webp` | 200, WebP MIME, immutable; decoded dimensions 768×819 | [Headers](phone-background-headers.txt) |
| `/assets/background-1214-yYasFyga.webp` | 200, WebP MIME, immutable; decoded dimensions 1214×1295 | [Headers](desktop-background-headers.txt) |
| `/assets/logo-112-Dk2pMw8Q.webp` | 200, WebP MIME, immutable; decoded dimensions 112×112 | [Headers](logo-headers.txt) |
| `/assets/background-768-B_CyOCXk.jpg` | 200, JPEG MIME, immutable; decoded dimensions 768×819 | [Headers](jpeg-fallback-headers.txt) |

The served CSS is byte-identical to the current local production build. The served JS is byte-identical after normalizing three generated artwork filename hashes (768px JPEG/WebP background and 1214px JPEG background); both JS files are 677,302 bytes uncompressed. Thus the previously missing compression/caching behavior is now verified at the actual HTTPS endpoint, and the served frontend code corresponds to the checked local code with these generated-asset differences. The precise reason for encoder/hash differences was not investigated.

Exact running OCI image digest/revision was not inspected; that would require NAS Docker/terminal access or supplied inspect output. The user reports the latest commit deployed. R1/R2 endpoint acceptance passes independently of exact image identity. This does not assert completion of final release acceptance, installed-device checks, service-worker update flows, or throttled production performance tests.

Example repeatable GET checks (use asset URLs from the current homepage):

```sh
curl -sS -D - -o /dev/null https://mosvault.taild64a6.ts.net:9445/
curl -sS -H 'Accept-Encoding: gzip' -D - -o /dev/null https://mosvault.taild64a6.ts.net:9445/assets/index-UgFe52UZ.js
curl -sS -D - -o /dev/null https://mosvault.taild64a6.ts.net:9445/sw.js
curl -sS -D - -o /dev/null https://mosvault.taild64a6.ts.net:9445/api/config
```
