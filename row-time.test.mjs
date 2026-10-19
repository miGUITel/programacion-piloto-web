import test from 'node:test';
import assert from 'node:assert/strict';
import { elapsedTiming, timingDescription } from './row-time.mjs';
import { madridClock } from './startup-context.mjs';

const date = '2026-10-19';
const activities = [{ start: '08:00', end: '08:25' }, { start: '08:25', end: '08:50' }, { start: '08:55', end: '09:30' }];
const at = time => ({ date, minute: Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) });

test('session and portion indicators use their own intervals and exact boundaries', () => {
  assert.deepEqual(elapsedTiming(date, activities, at('07:59')), { state: 'future', elapsed: 0, total: 85, fraction: 0 });
  assert.equal(elapsedTiming(date, activities, at('08:00')).state, 'active');
  assert.equal(elapsedTiming(date, activities, at('08:25')).elapsed, 25);
  assert.equal(elapsedTiming(date, [activities[0]], at('08:25')).state, 'past');
  assert.equal(elapsedTiming(date, [activities[1]], at('08:25')).state, 'active');
  assert.equal(elapsedTiming(date, [activities[2]], at('08:25')).state, 'future');
  assert.deepEqual(elapsedTiming(date, activities, at('09:30')), { state: 'past', elapsed: 85, total: 85, fraction: 1 });
});

test('pauses do not advance the session marker or consume teaching minutes', () => {
  const start = elapsedTiming(date, activities, at('08:50'));
  assert.equal(start.state, 'gap'); assert.equal(start.elapsed, 50);
  assert.deepEqual(elapsedTiming(date, activities, at('08:54')), start);
  assert.equal(elapsedTiming(date, activities, at('08:55')).state, 'active');
  assert.equal(elapsedTiming(date, activities, at('08:56')).elapsed, 51);
});

test('past and future dates are compared in Madrid, including midnight and DST', () => {
  assert.equal(elapsedTiming('2026-10-18', activities, at('00:00')).fraction, 1);
  assert.equal(elapsedTiming('2026-10-20', activities, at('23:59')).fraction, 0);
  const midnight = madridClock(new Date('2026-10-18T22:00:00Z'));
  assert.equal(midnight.date, date); assert.equal(elapsedTiming(date, activities, midnight).state, 'future');
  for (const [on, utc] of [['2026-03-29', '2026-03-29T06:10:00Z'], ['2026-10-25', '2026-10-25T07:10:00Z']]) {
    assert.equal(elapsedTiming(on, activities, madridClock(new Date(utc))).elapsed, 10);
  }
});

test('overlapping or unsorted portions never count the same minute twice', () => {
  const input = [{ start: '08:20', end: '08:40' }, { start: '08:00', end: '08:30' }];
  const before = structuredClone(input);
  assert.deepEqual(elapsedTiming(date, input, at('08:25')), { state: 'active', elapsed: 25, total: 40, fraction: 25 / 40 });
  assert.deepEqual(input, before);
});

test('invalid intervals do not fabricate a temporal result', () => {
  for (const input of [[], [{ start: '08:00', end: '08:00' }], [{ start: '23:55', end: '00:10' }], [{ start: '8:00', end: '08:30' }], [activities[0], {}]]) assert.equal(elapsedTiming(date, input, at('08:10')), null);
  assert.equal(elapsedTiming('2026-02-30', activities, at('08:10')), null);
  assert.equal(elapsedTiming(date, activities, { date, minute: 1440 }), null);
});

test('display is independent of delivery, preparation and imported progress', () => {
  const input = activities.map(activity => ({ ...activity, state: 'Cancelada', preparation: 'ready', progress: 2, observations: 'Conservar' }));
  const before = structuredClone(input);
  assert.deepEqual(elapsedTiming(date, input, at('08:30')), elapsedTiming(date, activities, at('08:30')));
  assert.deepEqual(input, before);
  assert.match(timingDescription(elapsedTiming(date, input, at('08:30'))), /No confirma impartición/);
  assert.match(timingDescription(null), /no disponible/);
});
