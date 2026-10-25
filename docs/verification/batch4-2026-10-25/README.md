# Batch 4 — responsive and consistent shared GUI verification

Date: 25 October 2026  
Branch: `codex/batch-4-dialog-theme`  
Base: freshly fetched `origin/master` at `29a38243edc85924fb328a3ad9467083e4c95294`  
Implementation commits: `d7c4caf` (R5), `91d200e` (R6/R10)  
Status: verified locally; not merged or deployed.

## Changes

- R5: measurement summary and history forms fit narrow screens, long values wrap, and edit fields adapt to narrow widths.
- R6: standard modals and the calendar use a shared dialog layer with initial focus, Tab/Shift+Tab containment, Escape dismissal, inert background and lower dialogs, body scroll locking, and focus restoration. Nested dialogs are ordered by React nesting depth.
- R10: dark-mode inversion applies only to bundled exercise artwork. Uploaded custom exercise photos retain their colors. Save, success, switch, and error styling uses semantic theme tokens; text fields and search inputs retain visible keyboard focus indicators.
- The Today action row wraps when enlarged text would otherwise push controls beyond the viewport.

## Verification

- Backend: `.venv/bin/pytest backend/tests` — 70 passed (two upstream deprecation warnings).
- Ruff: `.venv/bin/ruff check backend` and `.venv/bin/ruff format --check backend` — passed.
- Frontend unit tests: `npm test -- --run` — 22 files, 90 tests passed.
- Frontend: `npm run typecheck`, `npm run lint`, and `npm run build` — passed. Build reports a 10-file, 394,710-byte essential precache.
- Batch 4 Playwright checks — 3 passed: R5 measurement layouts; calendar keyboard focus, containment, Escape, and focus restoration; responsive light/dark rendering with custom-photo color preservation.
- Viewports: 320, 360, 390, 430, and 1440 CSS pixels in both themes. A 200% root text-size check at 320px passed without horizontal overflow. Playwright also checked custom and bundled image filters and saved screenshots below.
- Component tests cover initial focus, forward and reverse Tab wrap, inert background, topmost nested-dialog Escape handling, body scroll lock, and focus/scroll restoration.
- Screenshots were visually inspected at 390px in light and dark themes, for the light and dark calendar, and at 320px with 200% text. All screenshots are stored alongside this report.

## Remaining acceptance

- The browser checks ran in desktop Chromium. Installed iOS/Android behavior and real device text scaling remain part of final acceptance.
- No PR, merge, or deployment has been performed.
