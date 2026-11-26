import test from 'node:test';
import assert from 'node:assert/strict';
import { validateToolInput, tools } from './tools.js';

test('validates the five supported Tick action schemas', () => {
  assert.equal(validateToolInput('mark_complete', { habit: 'Reading' }).habit, 'Reading');
  assert.equal(validateToolInput('log_progress', { habit: 'Reading', value: 12 }).value, 12);
  assert.equal(validateToolInput('lower_target', { habit: 'Reading' }).habit, 'Reading');
  assert.equal(validateToolInput('add_habit', { name: 'Walk', target: 20, unit: 'min' }).name, 'Walk');
  assert.equal(validateToolInput('nudge', { member: 'Rahul', emoji: '🔥' }).member, 'Rahul');
});

test('rejects malformed or out-of-range AI tool arguments', () => {
  assert.throws(() => validateToolInput('unknown', {}));
  assert.throws(() => validateToolInput('mark_complete', { habit: '' }));
  assert.throws(() => validateToolInput('mark_complete', { habit: 'Read', extra: true }));
  assert.throws(() => validateToolInput('log_progress', { habit: 'Read', value: Infinity }));
  assert.throws(() => validateToolInput('add_habit', { name: 'Walk', target: 0, unit: 'min' }));
  assert.throws(() => validateToolInput('add_habit', { name: 'Walk', target: 10, unit: 'meters' }));
  assert.throws(() => validateToolInput('nudge', { member: 'Rahul', emoji: '💣' }));
});


test('keeps exactly the five original Tick actions registered', () => {
  assert.deepEqual(tools.map((tool) => tool.function.name).sort(), ['add_habit', 'log_progress', 'lower_target', 'mark_complete', 'nudge'].sort());
});
