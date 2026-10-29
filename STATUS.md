# STATUS — Weekly Triage Board

## What was built

A single-file, offline, ADHD-friendly weekly triage board for the Sunday reset,
in `index.html` (pure HTML/JS/CSS, no build step, runs from `file://`, no
accounts, no network). State lives in `localStorage` under `triage-board-v1`.

Features:

- **Brain dump box** — one thought per line; Enter or "Catch it" lands thoughts
  in a "Fresh catches" tray (my fifth area above the four columns, so dump and
  sort stay separate steps).
- **Four triage columns** — Do / Drop / Delegate / Someday, with HTML5 drag &
  drop plus a per-card move dropdown (touch/screen-reader friendly fallback).
- **Energy tags** (low / medium / high) and **time tags** (quick ~5m /
  ~30m focus / 1h+ big chunk) — tap a chip to cycle through the values.
- **Pick your three** — star up to three tasks, highlighted strip summarizes
  them with their energy/time; a fourth star is refused gently ("swap first").
- **Wins** — ✓ moves a task to a "Wins this week" list; restore-back button for
  "actually not done yet" moments.
- **Gentle carry-over review** — a banner notices a new Sunday (dismissable),
  a dialog reviews the Do pile task-by-task (keep / someday / delegate / let
  go), "carried ×N" tags and a nudge for tasks that keep returning (framed as
  data, never shame), finishing clears the Drop pile, unstars, and stamps the
  fresh week with a kind summary.
- **Backup** — copy/paste JSON export/import for browser resets.
- First run seeds six clearly-labeled `(example)` tasks showing how each column
  is meant to feel.

Supporting files: `tests.mjs` (26 logic tests), `ui.test.mjs` (9 jsdom smoke
tests), `README.md`, `LICENSE` (MIT, "Copyright (c) 2026 Asdale Dynamics, LLC"),
`package.json` (npm test script).

## How to run it

- App: open `index.html` in any modern browser (double-click works; `file://` OK).
- Tests: `npm test` (or `node tests.mjs && node --test`). `npm install` first if
  you want the `ui.test.mjs` smoke tests (jsdom is the only dev dependency;
  otherwise those nine tests skip — `tests.mjs` needs no dependencies).

## Verification results (2026-10-29)

- `node tests.mjs` → **26/26 pass** (board-state logic: normalize/repair of
  corrupt state, brain-dump parsing, column moves, tag cycles, pick-limit and
  gentle refusal, wins + restore, Sunday anchor math (`mostRecentSunday`,
  `needsReset`), review decisions, forgiving reset, backup round-trip, and a
  full dump→triage→pick→done→review→fresh-week journey test).
- `node --test` → **9/9 pass** with jsdom: real click-through of the UI —
  seed render, brain dump, move select, star limit, win/restore, the review
  dialog end-to-end (including `Drop` pile clearing and star clearing on
  finish), new-week banner dismiss persisting across sessions, board
  persistence across sessions, and backup export.
- Bugs found and fixed by the tests: first-run `load()` was clobbering the
  seeded example board (board would render empty on first launch); cached DOM
  nodes after re-renders in the smoke tests (app itself rebuilds HTML
  correctly — test-side issue); test-side date-math corrections for the
  Sunday anchor.

## Known gaps / next steps

- No keyboard-only drag alternative beyond the move dropdown (no arrow-key
  reordering of cards within a column).
- No per-task due dates or recurring tasks — intentional scope choice.
- Wins ledger is capped at 50 entries (oldest trimmed) to keep storage small.
- Backup import trusts the JSON shape via `normalizeState`; a maliciously
  large paste could bloat storage (guarded only by browser storage limits).
  `delete localStorage['triage-board-v1']` always gives a clean slate.
- Dark mode not implemented; the palette is a fixed warm light theme.
- `document.execCommand('copy')` fallback for backup export is deprecated
  though widely supported; manual select-and-copy always works.
- Review dialog uses `<dialog>`; on very old browsers the button degrades
  with a notice while the rest of the board still works.
