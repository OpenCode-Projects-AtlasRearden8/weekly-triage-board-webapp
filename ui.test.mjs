'use strict';
/**
 * DOM smoke tests for the Weekly Triage Board.
 *
 * Loads index.html into jsdom, runs its scripts for real, and clicks through
 * the app the way a user would (brain dump, moves, stars, done, review, reset,
 * persistence). Requires the optional dev dependency `jsdom` (`npm install`).
 * If jsdom is not installed, these tests skip instead of failing.
 *
 * Run:  node --test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const HTML_PATH = path.join(HERE, 'index.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');

let JSDOM = null;
try {
  ({ JSDOM } = await import('jsdom'));
} catch {
  JSDOM = null;
}

function boot(seedJson) {
  const dom = new JSDOM(html, {
    // jsdom treats file:// as an opaque origin with no localStorage, so point
    // the window at a localhost URL. The board itself works from file://.
    url: 'http://localhost/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
      if (!window.document.execCommand) window.document.execCommand = function () { return true; };
      if (seedJson) window.localStorage.setItem('triage-board-v1', seedJson);
    }
  });
  return dom.window;
}

const CARD_SELECTORS = '.col .card[data-id], .tray .card[data-id]';

test('smoke: loads with six seed example cards and one pick', { skip: !JSDOM && 'jsdom not installed' }, () => {
  const w = boot();
  t_delay_dialog(w);
  const cards = w.document.querySelectorAll(CARD_SELECTORS);
  assert.equal(cards.length, 6);
  assert.equal(w.document.querySelectorAll('.card.picked').length, 1);
  assert.match(w.document.getElementById('picks-strip').textContent, /Your one for now/i);
  assert.equal(w.document.querySelectorAll('.tray .card').length, 1);
  const saved = JSON.parse(w.localStorage.getItem('triage-board-v1'));
  assert.equal(saved.tasks.length, 6);
  assert.ok(saved.tasks.every((t) => t.example === true));
  w.close();
});

test('smoke: brain dump catches thoughts into the Fresh catches tray', { skip: !JSDOM && 'jsdom not installed' }, () => {
  const w = boot();
  const d = w.document;
  const ta = d.getElementById('dump-input');
  ta.value = 'call the dentist\n\n   \nwater the plants';
  d.getElementById('dump-add').click();
  assert.equal(d.querySelectorAll('.tray .card').length, 3); // 1 seed + 2 caught
  assert.match(d.getElementById('notice').textContent, /Caught 2/i);
  const saved = JSON.parse(w.localStorage.getItem('triage-board-v1'));
  assert.ok(saved.tasks.some((t) => t.title === 'call the dentist'));
  w.close();
});

test('smoke: tasks move between columns via the move select', { skip: !JSDOM && 'jsdom not installed' }, () => {
  const w = boot();
  const d = w.document;
  const card = d.querySelector('.tray .card[data-id]');
  const id = card.dataset.id;
  const sel = card.querySelector('select[data-act="move"]');
  sel.value = 'do';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.ok(d.querySelector('.cards[data-column="do"] .card[data-id="' + id + '"]'), 'task should be in Do');
  const saved = JSON.parse(w.localStorage.getItem('triage-board-v1'));
  assert.equal(saved.tasks.find((t) => t.id === id).column, 'do');
  w.close();
});

test('smoke: pick-your-three refuses a fourth star, gently', { skip: !JSDOM && 'jsdom not installed' }, () => {
  const w = boot();
  const d = w.document;
  assert.equal(d.querySelectorAll('.card.picked').length, 1, 'the seed ships with one starred task');
  // Each click re-renders the board, so re-query the first unstarred star each time.
  const nextFreeStar = () => [...d.querySelectorAll('.card [data-act="pick"]')]
    .filter((b) => !b.closest('.card').classList.contains('picked'))[0];
  nextFreeStar().click();
  assert.equal(d.querySelectorAll('.card.picked').length, 2);
  nextFreeStar().click();
  assert.equal(d.querySelectorAll('.card.picked').length, 3, 'seed star + two more = your three');
  const notice = d.getElementById('notice');
  nextFreeStar().click();
  assert.match(notice.textContent, /swap/i);
  assert.equal(d.querySelectorAll('.card.picked').length, 3, 'fourth star must not stick');
  // Unstar frees the slot.
  d.querySelector('.card.picked [data-act="pick"]').click();
  assert.equal(d.querySelectorAll('.card.picked').length, 2);
  nextFreeStar().click();
  assert.equal(d.querySelectorAll('.card.picked').length, 3);
  w.close();
});

test('smoke: done tasks land in wins and can be restored', { skip: !JSDOM && 'jsdom not installed' }, () => {
  const w = boot();
  const d = w.document;
  const card = d.querySelector('.cards[data-column="do"] .card[data-id]');
  const title = card.querySelector('.title').textContent;
  card.querySelector('[data-act="done"]').click();
  assert.match(d.querySelector('#wins-list').textContent, new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(d.querySelector('#wins-list [data-restore]'), 'win has a restore button');
  const restored = d.querySelector('#wins-list [data-restore]');
  restored.click();
  const doCards = [...d.querySelectorAll('.cards[data-column="do"] .card .title')].map((el) => el.textContent);
  assert.ok(doCards.includes(title), 'restored task is back in Do');
  const saved = JSON.parse(w.localStorage.getItem('triage-board-v1'));
  assert.equal(saved.wins.length, 0);
  assert.ok(saved.tasks.some((t) => t.title === title && t.column === 'do'));
  w.close();
});

test('smoke: gentle review dialog resolves tasks and finishing resets the week', { skip: !JSDOM && 'jsdom not installed' }, () => {
  const w = boot();
  const d = w.document;
  // Move the tray card into Drop so the reset has something to clear.
  const trayCard = d.querySelector('.tray .card[data-id]');
  const sel = trayCard.querySelector('select[data-act="move"]');
  sel.value = 'drop';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.ok(d.querySelector('.cards[data-column="drop"] .card'), 'drop column has a task now');

  d.getElementById('btn-review').click();
  const dialog = d.getElementById('review');
  assert.equal(dialog.hasAttribute('open'), true, 'review dialog opens');
  const items = [...d.querySelectorAll('#review .review-item:not(.resolved)')];
  assert.ok(items.length >= 2, 'do-column tasks are listed for review');
  // Decide on each listed task: first keep, second let go.
  items[0].querySelector('.go-btn.keep').click();
  items[1].querySelector('.go-btn.release').click();
  d.getElementById('review-finish').click();
  assert.equal(dialog.hasAttribute('open'), false, 'dialog closes after finishing');
  assert.equal(d.querySelectorAll('.cards[data-column="drop"] .card').length, 0, 'drop pile was cleared');
  assert.equal(d.querySelectorAll('.card.picked').length, 0, 'stars cleared for the fresh week');
  const saved = JSON.parse(w.localStorage.getItem('triage-board-v1'));
  assert.ok(typeof saved.weekStart === 'number');
  const kept = saved.tasks.find((t) => t.column === 'do' && t.carried === 1);
  assert.ok(kept, 'kept task carries its week count');
  w.close();
});

test('smoke: banner notices a new week once, dismiss sticks until next Sunday', { skip: !JSDOM && 'jsdom not installed' }, () => {
  const w = boot();
  const d = w.document;
  const banner = d.getElementById('banner');
  assert.equal(banner.classList.contains('show'), true, 'first-run banner shows');
  d.getElementById('banner-dismiss').click();
  assert.equal(banner.classList.contains('show'), false);
  const saved = JSON.parse(w.localStorage.getItem('triage-board-v1'));
  assert.ok(typeof saved.dismissedBannerForSunday === 'number', 'dismissal persisted');
  // Reboot with the saved board: still dismissed, no banner.
  const w2 = boot(w.localStorage.getItem('triage-board-v1'));
  assert.equal(w2.document.getElementById('banner').classList.contains('show'), false);
  w2.close();
  w.close();
});

test('smoke: a saved board reboots intact (persistence across sessions)', { skip: !JSDOM && 'jsdom not installed' }, () => {
  const w = boot();
  const d = w.document;
  const ta = d.getElementById('dump-input');
  ta.value = 'call the dentist';
  d.getElementById('dump-add').click();
  const saved = w.localStorage.getItem('triage-board-v1');
  w.close();
  const w2 = boot(saved);
  const titles = [...w2.document.querySelectorAll('.card .title')].map((el) => el.textContent);
  assert.ok(titles.includes('call the dentist'), 'brain-dumped task survives a session restart');
  w2.close();
});

test('smoke: backup export prints the board JSON', { skip: !JSDOM && 'jsdom not installed' }, () => {
  const w = boot();
  const d = w.document;
  d.getElementById('backup-export').click();
  const io = d.getElementById('backup-io').value;
  assert.ok(io.includes('"tasks"'), 'JSON export contains the board');
  const parsed = JSON.parse(io);
  assert.ok(parsed.tasks.length >= 6);
  w.close();
});

function t_delay_dialog(w) {
  // no-op placeholder; jsdom needs no waiting for our synchronous script
  return w;
}
