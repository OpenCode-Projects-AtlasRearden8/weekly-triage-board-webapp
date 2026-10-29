# Weekly Triage Board 🧺

An ADHD-friendly, offline weekly triage board for the **Sunday reset**. One place to
dump everything out of your head, sort it kindly, pick just three things, and start
each week without shame.

Built by **Asdale Dynamics, LLC** as part of a low-energy productivity set that
pairs well with the *Low-Energy Chore Planner* and the *Gentle Productivity Manual*.

## Why it exists

Traditional to-do apps ask for streaks, due dates, and guilt. This board asks
gentler questions:

- **What's in your head right now?** → the brain dump box, no sorting required
- **What do you actually want to carry this week?** → pick your three
- **What can wait, be handed off, or be let go?** → someday / delegate / drop
- **What did you finish?** → wins, so zero-doubt proof shows up even on foggy weeks
- **What kept coming back?** → carried-weeks shown as data, not failure

Carrying a task for six weeks isn't a streak of failures — it's information.
Maybe it matters (make it smaller). Maybe it doesn't (set it free). Both win.

## How to run it

No install, no build, no accounts, no network. It's one file.

1. Download or clone this folder.
2. Double-click `index.html` (or open it in any modern browser via `file://`).
3. That's it. Everything is saved automatically to your browser's localStorage,
   on your device only.

### Features

- **Brain dump box** — type one thought per line, hit Enter or "Catch it".
  Sorting can wait.
- **Fresh catches tray** — dumped thoughts rest here until you drag them into a
  column (works on desktop drag & drop; on touch, use the arrow dropdown on each card).
- **Four columns** — Do / Drop / Delegate / Someday. Letting go is a decision too.
- **Energy tags** — low / medium / high, tap to cycle. Match tasks to the day you
  actually have, not the day you wish you had.
- **Time tags** — quick (~5 min) / some focus (~30 min) / big chunk (1h+), tap to cycle.
- **Pick your three** — star the tasks that would make the week *gentle but real*.
  A fourth star politely asks you to swap first.
- **Wins** — hit ✓ and the task moves to a wins list. Judged zero times.
- **Gentle week review** — a banner notices a new week (it never demands anything).
  The review walks your Do pile one task at a time: still a yes? Keep, park,
  hand off, or kindly let go. Tasks that keep coming back get framed as data:
  "make it smaller, name the first tiny step, or set it free. Both choices win."
- **Reset** — finishing the review clears the Drop pile, clears stars, and stamps
  the fresh week. Wins just quietly count up. No streaks to break.
- **Backup** — copy your board as JSON text and paste it back later. Still just
  text on your device. (Useful before clearing your browser data!)

### Keyboard & a11y notes

- Every card movement is possible without dragging (the arrow dropdown per card).
- Double-click a task title to edit it; Enter saves, Escape cancels.
- Tags and buttons have tooltips explaining what they do.

## Privacy & data

- 100% local: no accounts, no servers, no analytics, no network calls.
- Your board lives in `localStorage` under the key `triage-board-v1`.
- Clearing browser data deletes it — use the Backup tool if the board matters.
- The seed content on first run consists of labeled `(example)` tasks you can
  triage, star, or delete like anything else.

## Development & tests

The board logic is deliberately separated from the DOM code inside
`index.html` (two script blocks), so it can be tested headlessly:

```bash
npm test        # or: node tests.mjs && node --test
```

- `tests.mjs` — 26 tests for the pure board-state logic (extraction from
  `index.html` → Node `vm` sandbox: triage moves, tag cycling, pick limit,
  Sunday anchor math, review decisions, reset, persistence round-trip).
- `ui.test.mjs` — 9 DOM smoke tests (uses the optional `jsdom` dev dependency;
  click-through of brain dump, moves, stars, wins, the review dialog, and
  localStorage persistence across sessions). Skips automatically if jsdom
  isn't installed.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Asdale Dynamics, LLC.
Credit: built by **Asdale Dynamics, LLC** · dylanasdale.github.io
