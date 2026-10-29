'use strict';
/**
 * Tests for the Weekly Triage Board's pure state logic.
 *
 * The board's logic lives in the <script id="logic"> block of index.html so the
 * app stays a single self-contained file. These tests extract that script,
 * evaluate it in a Node vm sandbox, and exercise it end to end. The UI script
 * is syntax-checked (but not executed, since it needs a DOM).
 *
 * Run:  node tests.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const HTML_PATH = path.join(HERE, 'index.html');

// ---------------------------------------------------------------------------
// Load & evaluate the logic script out of index.html
// ---------------------------------------------------------------------------
const html = fs.readFileSync(HTML_PATH, 'utf8');

function extractScript(id) {
  const re = new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>');
  const m = html.match(re);
  if (!m) throw new Error('Could not find <script id="' + id + '"> in index.html');
  return m[1];
}

const logicCode = extractScript('logic');
const sandbox = { console, Math, Date, JSON, globalThis: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(logicCode, sandbox, { filename: 'index.html#logic' });
const L = sandbox.TriageLogic;
assert.ok(L && typeof L.addTask === 'function', 'TriageLogic must be exported from the logic script');

// The UI script must at least parse (it can't run without a DOM).
new vm.Script(extractScript('ui'), { filename: 'index.html#ui' });

// Values created inside the vm sandbox carry that realm's prototypes, so they
// must be re-materialized in this realm before deepStrictEqual comparisons.
const plain = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------------------
// Constants & fixtures
// ---------------------------------------------------------------------------
const NOW = new Date('2026-10-14T12:00:00').getTime(); // a Wednesday
const SAT_10 = new Date('2026-10-10T00:00:00').getTime(); // Saturday
const SUN_11 = new Date('2026-10-11T00:00:00').getTime(); // Sunday anchor week oct 11-17
const SUN_04 = new Date('2026-10-04T00:00:00').getTime();

function mkTask(over) {
  return Object.assign(
    {
      id: 'x1',
      title: 'A task',
      column: 'do',
      energy: 'medium',
      time: 'quick',
      picked: false,
      carried: 0,
      createdAt: NOW,
      updatedAt: NOW
    },
    over
  );
}

// ---------------------------------------------------------------------------
// Constants & shape
// ---------------------------------------------------------------------------
test('exposes expected API surface', () => {
  ['addTask', 'moveTask', 'cycleEnergy', 'cycleTime', 'togglePick', 'markDone',
    'reviewDecision', 'finishReset', 'needsReset', 'mostRecentSunday', 'loadState',
    'normalizeState', 'serializeState', 'stats'].forEach((fn) =>
    assert.equal(typeof L[fn], 'function', fn + ' should be a function')
  );
  assert.deepEqual(plain(L.BOARD_COLUMNS), ['do', 'drop', 'delegate', 'someday']);
  assert.deepEqual(plain(L.ENERGIES), ['low', 'medium', 'high']);
  assert.deepEqual(plain(L.TIMES), ['quick', 'medium', 'long']);
  assert.equal(L.MAX_PICKS, 3);
});

// ---------------------------------------------------------------------------
// normalize / load
// ---------------------------------------------------------------------------
test('normalizeState returns a safe empty state for garbage input', () => {
  for (const junk of [null, undefined, 42, 'nope', {}]) {
    const s = plain(L.normalizeState(junk, NOW));
    assert.equal(s.version, 1);
    assert.deepEqual(s.tasks, []);
    assert.deepEqual(s.wins, []);
    assert.equal(s.weekStart, null);
  }
});

test('normalizeState repairs bad field values instead of crashing', () => {
  const s = plain(L.normalizeState(
    {
      weekStart: 'not-a-number',
      tasks: [
        { title: '  spaced  ', column: 'hell', energy: 'ultra', time: 'decade', picked: 'yes' },
        null,
        'string task',
        { title: 'kept', column: 'drop', carried: 2 }
      ]
    },
    NOW
  ));
  assert.equal(s.tasks.length, 2); // null / non-object entries are filtered out
  assert.equal(s.tasks[0].title, 'spaced');
  assert.equal(s.tasks[0].column, 'unsorted');
  assert.equal(s.tasks[0].energy, 'medium');
  assert.equal(s.tasks[0].time, 'quick');
  assert.equal(s.tasks[0].picked, false);
  assert.equal(s.tasks[1].column, 'drop');
  assert.equal(s.tasks[1].carried, 2);
});

test('normalizeState keeps at most three picks', () => {
  const s = L.normalizeState(
    {
      tasks: [
        mkTask({ id: 'a', picked: true }),
        mkTask({ id: 'b', picked: true }),
        mkTask({ id: 'c', picked: true }),
        mkTask({ id: 'd', picked: true })
      ]
    },
    NOW
  );
  assert.deepEqual(s.tasks.filter((t) => t.picked).map((t) => t.id), ['a', 'b', 'c']);
});

test('loadState survives corrupted JSON', () => {
  const { state, corrupt } = L.loadState('{"tasks": [ trunca', NOW);
  assert.equal(corrupt, false);
  assert.deepEqual(plain(state).tasks, []);
});

test('serializeState -> loadState round trip preserves the board', () => {
  let s = L.normalizeState({ tasks: [mkTask({ id: 'a' }), mkTask({ id: 'b', column: 'someday', energy: 'low', time: 'long', carried: 2 })], weekStart: SUN_11, wins: [{ title: 'paid bill', at: NOW }] }, NOW);
  s = L.finishReset(s, NOW + 1).state;
  const json = L.serializeState(s);
  const reload = L.loadState(json, NOW + 2).state;
  assert.deepEqual(plain(reload), plain(s));
});

// ---------------------------------------------------------------------------
// Creation, brain dump
// ---------------------------------------------------------------------------
test('createTask defaults to unsorted/medium/quick', () => {
  const t = L.createTask('  hello ', NOW);
  assert.equal(t.title, 'hello');
  assert.equal(t.column, 'unsorted');
  assert.equal(t.energy, 'medium');
  assert.equal(t.time, 'quick');
  assert.equal(t.carried, 0);
  assert.equal(t.picked, false);
  assert.ok(t.id);
});

test('blank lines are skipped by addManyTasks', () => {
  const s = L.addManyTasks(L.emptyState(), ['one', '', '   ', 'two'], NOW);
  assert.deepEqual(s.tasks.map((t) => t.title), ['one', 'two']);
});

// ---------------------------------------------------------------------------
// Movement (drag & drop / select logic)
// ---------------------------------------------------------------------------
const fourColState = () =>
  L.normalizeState(
    { tasks: [mkTask({ id: 'a', column: 'unsorted' })] },
    NOW
  );

test('moveTask routes a task through all four columns', () => {
  let s = fourColState();
  for (const col of L.BOARD_COLUMNS) {
    s = L.moveTask(s, 'a', col, NOW + 1);
    assert.equal(s.tasks[0].column, col, 'should land in ' + col);
  }
});

test('moveTask is a no-op for unknown ids or invalid columns', () => {
  const s = fourColState();
  assert.equal(L.moveTask(s, 'ghost', 'do', NOW), s);
  assert.equal(L.moveTask(s, 'a', 'trachery', NOW), s);
});

// ---------------------------------------------------------------------------
// Energy & time tags
// ---------------------------------------------------------------------------
test('energy tag cycles low → medium → high → low', () => {
  let s = L.normalizeState({ tasks: [mkTask({ id: 'a', energy: 'low' })] }, NOW);
  assert.equal(plain(L.cycleEnergy(s, 'a')).tasks[0].energy, 'medium');
  s = L.cycleEnergy(s, 'a');
  assert.equal(s.tasks[0].energy, 'medium');
  s = L.cycleEnergy(s, 'a');
  assert.equal(s.tasks[0].energy, 'high');
  s = L.cycleEnergy(s, 'a');
  assert.equal(s.tasks[0].energy, 'low');
});

test('time tag cycles quick → medium → long → quick', () => {
  let s = L.normalizeState({ tasks: [mkTask({ id: 'a', time: 'long' })] }, NOW);
  s = L.cycleTime(s, 'a');
  assert.equal(s.tasks[0].time, 'quick');
  assert.equal(L.cycleTime(s, 'a').tasks[0].time, 'medium');
});

// ---------------------------------------------------------------------------
// Pick your three
// ---------------------------------------------------------------------------
test('three can be starred, a fourth is refused gently', () => {
  let s = L.normalizeState(
    { tasks: [mkTask({ id: 'a' }), mkTask({ id: 'b' }), mkTask({ id: 'c' }), mkTask({ id: 'd' })] },
    NOW
  );
  for (const id of ['a', 'b', 'c']) {
    const res = L.togglePick(s, id);
    assert.equal(res.ok, true);
    s = res.state;
  }
  const fourth = L.togglePick(s, 'd');
  assert.equal(fourth.ok, false);
  assert.equal(fourth.reason, 'limit');
  assert.match(fourth.message, /swap/i);
  assert.equal(s.tasks[3].picked, false);
  assert.deepEqual(s, L.togglePick(s, 'd').state, 'refusal must not mutate the board');
});

test('unpick works and frees the slot', () => {
  let s = L.normalizeState({ tasks: [mkTask({ id: 'a', picked: true }), mkTask({ id: 'd' })] }, NOW);
  const r1 = L.togglePick(s, 'a');
  assert.equal(r1.ok, true);
  assert.equal(r1.reason, 'unpicked');
  const r2 = L.togglePick(r1.state, 'd');
  assert.equal(r2.ok, true);
});

// ---------------------------------------------------------------------------
// Wins (done) & restore
// ---------------------------------------------------------------------------
test('markDone moves the task into wins and out of the board', () => {
  const s = L.normalizeState({ tasks: [mkTask({ id: 'a', carried: 2 })], weekStart: SAT_10 }, NOW);
  const next = L.markDone(s, 'a', NOW + 5);
  assert.equal(next.tasks.length, 0);
  assert.equal(next.wins.length, 1);
  assert.equal(next.wins[0].title, 'A task');
  assert.equal(next.wins[0].carried, 2);
});

test('restoreWin sends a win back to Do, unpicked', () => {
  const s = L.normalizeState({ tasks: [mkTask({ id: 'a' })] }, NOW);
  const done = L.markDone(s, 'a', NOW + 5);
  const winId = done.wins[0].id;
  const back = L.restoreWin(done, winId, NOW + 6);
  assert.equal(back.tasks.length, 1);
  assert.equal(back.tasks[0].column, 'do');
  assert.equal(back.tasks[0].picked, false);
  assert.equal(back.wins.length, 0);
});

// ---------------------------------------------------------------------------
// Sunday reset logic
// ---------------------------------------------------------------------------
test('mostRecentSunday anchors at local Sunday midnight', () => {
  // 2026-10-14 is a Wednesday → anchor is Sunday 2026-10-11.
  assert.equal(L.mostRecentSunday(NOW), SUN_11);
  // On a Sunday itself, today's midnight is the anchor.
  assert.equal(L.mostRecentSunday(SUN_11 + 3600_000), SUN_11);
  assert.equal(L.mostRecentSunday(SAT_10), SUN_04);
});

test('needsReset: true before first reset, false within the week, true next week', () => {
  const fresh = L.emptyState();
  assert.equal(L.needsReset(fresh, NOW), true);
  const midweek = { ...fresh, weekStart: NOW };
  assert.equal(L.needsReset(midweek, NOW + 1000), false);
  const lastWeek = { ...fresh, weekStart: SAT_10 }; // set on Saturday
  assert.equal(L.needsReset(lastWeek, NOW), true);
});

test('dismissBanner lasts only until the next Sunday', () => {
  let s = { ...L.emptyState(), weekStart: NOW };
  s = L.dismissBanner(s, NOW);
  assert.equal(L.isBannerDismissedForCurrentWeek(s, NOW + 1000), true);
  assert.equal(L.isBannerDismissedForCurrentWeek(s, NOW + 7 * 86_400_000), false);
});

test('buildReviewList covers do-column tasks, oldest and most-carried first', () => {
  const s = L.normalizeState(
    {
      tasks: [
        mkTask({ id: 'old', createdAt: 1, carried: 0 }),
        mkTask({ id: 'carried', createdAt: 5, carried: 3 }),
        mkTask({ id: 'drop', column: 'drop' }),
        mkTask({ id: 'smd', column: 'someday' }),
        mkTask({ id: 'uns', column: 'unsorted' })
      ]
    },
    NOW
  );
  const ids = L.buildReviewList(s, NOW).map((t) => t.id);
  assert.deepEqual(ids, ['carried', 'old']);
});

test('reviewDecision: keep increments carried weeks, others re-home', () => {
  let s = L.normalizeState({ tasks: [mkTask({ id: 'a', carried: 1 })] }, NOW);
  s = L.reviewDecision(s, 'a', 'keep', NOW);
  assert.equal(s.tasks[0].carried, 2);
  assert.equal(s.tasks[0].column, 'do');
  for (const [action, col] of [['someday', 'someday'], ['delegate', 'delegate'], ['drop', 'drop']]) {
    const moved = L.reviewDecision(s, 'a', action, NOW);
    assert.equal(moved.tasks[0].column, col);
    assert.equal(moved.tasks[0].picked, false);
  }
  assert.equal(L.reviewDecision(s, 'ghost', 'keep'), s, 'unknown id is a no-op');
  assert.equal(L.reviewDecision(s, 'a', 'do-a-backflip'), s, 'invalid action is a no-op');
});

test('finishReset clears the Drop pile, clears picks, stamps the week', () => {
  const s = L.normalizeState(
    {
      tasks: [
        mkTask({ id: 'keepme', column: 'do', picked: true, carried: 1 }),
        mkTask({ id: 'bye1', column: 'drop' }),
        mkTask({ id: 'bye2', column: 'drop' }),
        mkTask({ id: 'stay', column: 'someday' })
      ],
      weekStart: SUN_04
    },
    NOW
  );
  const res = L.finishReset(s, NOW);
  const next = res.state;
  assert.equal(next.weekStart, NOW);
  assert.deepEqual(next.tasks.flatMap((t) => t.title).sort(), ['A task', 'A task']);
  assert.equal(next.tasks.find((t) => t.id === 'keepme').picked, false);
  assert.equal(next.tasks.some((t) => t.id.startsWith('bye')), false);
  assert.deepEqual(plain(res.summary), { droppedCount: 2, carriedCount: 1, pickCount: 1 });
  assert.equal(L.needsReset(next, NOW + 1000), false);
});

test('finishReset empties everything when the week is empty (no shame, no crash)', () => {
  const res = L.finishReset(L.emptyState(), NOW);
  assert.deepEqual(plain(res.summary), { droppedCount: 0, carriedCount: 0, pickCount: 0 });
  assert.deepEqual(res.state.tasks, []);
});

test('stats counts every column plus picks and wins', () => {
  const s = L.normalizeState(
    {
      tasks: [
        mkTask({ id: 'a', column: 'do', picked: true }),
        mkTask({ id: 'b', column: 'drop' }),
        mkTask({ id: 'c', column: 'delegate' }),
        mkTask({ id: 'd', column: 'someday' }),
        mkTask({ id: 'e', column: 'unsorted' })
      ],
      wins: [{ title: 'x', at: NOW }]
    },
    NOW
  );
  assert.deepEqual(plain(L.stats(s)), {
    unsorted: 1, do: 1, drop: 1, delegate: 1, someday: 1, picks: 1, wins: 1
  });
});

// ---------------------------------------------------------------------------
// Seed examples
// ---------------------------------------------------------------------------
test('seedExamples covers each column and is flagged as examples', () => {
  const seeded = L.seedExamples(NOW);
  assert.ok(seeded.tasks.every((t) => t.example === true));
  assert.ok(seeded.tasks.some((t) => t.column === 'do'));
  assert.ok(seeded.tasks.some((t) => t.column === 'drop'));
  assert.ok(seeded.tasks.some((t) => t.column === 'delegate'));
  assert.ok(seeded.tasks.some((t) => t.column === 'someday'));
  assert.ok(seeded.tasks.some((t) => t.column === 'unsorted'));
});

// ---------------------------------------------------------------------------
// A realistic Sunday-reset story, start to finish
// ---------------------------------------------------------------------------
test('full week journey: dump → triage → pick → do → review → fresh week', () => {
  let s = L.seedExamples(NOW - 8 * 86_400_000);
  // Brain dump a bundle of thoughts.
  s = L.addManyTasks(s, ['call the dentist', 'organize the closet'], NOW - 2 * 86_400_000);
  assert.equal(s.tasks.filter((t) => t.column === 'unsorted').length, 3);
  // Triage them.
  const dumped = s.tasks.filter((t) => t.column === 'unsorted');
  s = L.moveTask(s, dumped[0].id, 'do', NOW);
  s = L.moveTask(s, dumped[1].id, 'someday', NOW);
  // Star three and finish one.
  const res = L.togglePick(s, dumped[0].id);
  s = res.state;
  assert.equal(res.ok, true);
  const starred = s.tasks.find((t) => t.id === dumped[0].id);
  s = L.markDone(s, starred.id, NOW);
  assert.equal(s.wins.length, 1);
  // Stamp a fresh week start (Monday, inside the current Sunday-week).
  const res2 = L.finishReset(s, SUN_11 + 3600_000);
  s = res2.state;
  assert.equal(plain(res2.summary).droppedCount, 1, 'the example drop task clears with the stamp');
  assert.equal(L.needsReset(s, NOW), false, 'the week reset was recent-ish');
  const late = L.normalizeState({ ...plain(s), weekStart: SUN_04 }, NOW);
  assert.equal(L.needsReset(late, NOW), true);
  let working = late;
  for (const t of L.buildReviewList(working, NOW)) {
    working = L.reviewDecision(working, t.id, t.carried >= 1 ? 'drop' : 'keep', NOW);
  }
  const finished = L.finishReset(working, NOW);
  s = finished.state;
  assert.equal(s.tasks.filter((t) => t.column === 'drop').length, 0);
  assert.equal(L.stats(s).wins, 1);
  assert.deepEqual(plain(s.tasks.filter((t) => t.picked)), []);
  assert.equal(L.needsReset(s, NOW + 1000), false, 'fresh week acknowledged');
});
