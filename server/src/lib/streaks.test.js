import test from 'node:test';
import assert from 'node:assert/strict';
import { view, summary, addDays, easeTarget, isValidDateString, todayForTimezone } from './streaks.js';

const mk = (dates, extra = {}) => new Map(dates.map((d) => [d, { done: true, value: 1, ...extra }]));
const h = (created) => ({ _id: 'h1', name: 'Read', icon: '📖', unit: 'pages', target: 20, step: 5, createdAt: created });

test('addDays crosses month boundaries', () => {
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
test('streak counts back from today when done', () => {
  const v = view(h('2026-10-01'), mk(['2026-11-23', '2026-11-24', '2026-11-25']), '2026-11-25');
  assert.equal(v.streak, 3);
});
test('streak survives an unfinished today (counts from yesterday)', () => {
  const v = view(h('2026-10-01'), mk(['2026-11-23', '2026-11-24']), '2026-11-25');
  assert.equal(v.streak, 2);
  assert.equal(v.done, false);
});
test('a gap breaks the streak, a freeze repairs it', () => {
  const days = ['2026-11-22', '2026-11-24', '2026-11-25'];
  assert.equal(view(h('2026-10-01'), mk(days), '2026-11-25').streak, 2);
  const m = mk(days); m.set('2026-11-23', { frozen: true, done: false });
  assert.equal(view(h('2026-10-01'), m, '2026-11-25').streak, 4);
});
test('new habit is not "missed yesterday" and has a fair rate', () => {
  const v = view(h('2026-11-25T08:00:00Z'), new Map(), '2026-11-25');
  assert.equal(v.missedYesterday, false);
  assert.equal(v.rough, false);
});
test('rough patch after 3 misses in 7 days', () => {
  const v = view(h('2026-10-01'), mk(['2026-11-24', '2026-11-20', '2026-11-19', '2026-11-18']), '2026-11-25');
  assert.equal(v.rough, true);
});
test('summary and ease', () => {
  assert.deepEqual(summary([]), { cons: 0, streak: 0, done: false });
  assert.equal(easeTarget(40, 10), 20);
  assert.equal(easeTarget(8, 1), 5);
});

test('date validation rejects impossible calendar dates', () => {
  assert.equal(isValidDateString('2026-11-25'), true);
  assert.equal(isValidDateString('2026-02-30'), false);
  assert.equal(isValidDateString('25-11-2026'), false);
});
test('today is derived from the selected IANA timezone', () => {
  const now = new Date('2026-11-25T01:00:00.000Z');
  assert.equal(todayForTimezone('Asia/Kolkata', now), '2026-11-25');
  assert.equal(todayForTimezone('America/Los_Angeles', now), '2026-11-24');
  assert.throws(() => todayForTimezone('not/a-timezone', now));
});

import { weekStart, isTime } from './streaks.js';
test('weeks start on Monday and times validate', () => {
  assert.equal(weekStart('2026-11-26'), '2026-11-23');
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.equal(isTime('07:30'), true);
  assert.equal(isTime('25:00'), false);
  assert.equal(isTime(''), true);
});
test('weekly habit: streak counts weeks that met the goal, and best is tracked', () => {
  const wk = { _id: 'w', name: 'Gym', icon: '💪', unit: 'times', target: 1, step: 1, frequency: 'weekly', perWeek: 2, createdAt: '2026-10-01' };
  const m = new Map();
  ['2026-11-09', '2026-11-10', '2026-11-16', '2026-11-18', '2026-11-23'].forEach((d) => m.set(d, { done: true, value: 1 }));
  const v = view(wk, m, '2026-11-26');
  assert.equal(v.frequency, 'weekly');
  assert.equal(v.weekDone, 1);
  assert.equal(v.weekMet, false);
  assert.equal(v.streak, 2);
  assert.equal(v.best, 2);
});
test('daily habit exposes best streak, total and new fields', () => {
  const v = view(h('2026-10-01'), mk(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-24', '2026-11-25']), '2026-11-25');
  assert.equal(v.streak, 2);
  assert.equal(v.best, 3);
  assert.equal(v.total, 5);
  assert.equal(v.category, 'other');
  assert.equal(v.priority, 'medium');
});
test('a weekly goal met this week closes the circle ring', () => {
  assert.equal(summary([{ rate: 100, streak: 1, done: false, weekMet: true }]).done, true);
});
