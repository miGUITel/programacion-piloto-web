import test from 'node:test';
import assert from 'node:assert/strict';
import { meetingCalendar, dayChoices, hasMeetingContent } from './meeting-calendar.mjs';
import { resolveRemembered } from './startup-context.mjs';

const common = { course: { startsOn: '2026-10-01', endsOn: '2026-11-02' }, timetable: { effectiveFrom: '2026-10-05', weekly: [{ id: 'dept', weekday: 1, start: '12:00', end: '13:00', type: 'meeting', title: 'Departamento' }, { id: 'erasmus', weekday: 2, start: '10:00', end: '11:00', type: 'meeting', title: 'Erasmus' }], exceptions: [] }, calendar: { nonTeaching: [{ from: '2026-10-12', through: '2026-10-13' }] } };
const document = { schemaVersion: 2, kind: 'meeting-notes', spaces: [{ id: 'meetings', title: 'Reuniones' }], groups: [{ id: 'd', space: 'meetings', title: 'Departamento', scheduleRefs: ['dept'] }, { id: 'e', space: 'meetings', title: 'Erasmus', scheduleRefs: ['erasmus'] }, { id: 'proyecto', space: 'meetings', title: 'Proyecto', scheduleRefs: [] }], meetings: [] };
const allDays = months => months.flatMap(month => month.groups.flatMap(group => group.days));

test('calendar derives only meeting dates within course, timetable validity and inclusive holidays', () => {
  const original = structuredClone(document), days = allDays(meetingCalendar(document, common));
  assert.deepEqual(days.filter(day => day.groupId === 'd').map(day => day.date), ['2026-10-05', '2026-10-19', '2026-10-26', '2026-11-02']);
  assert.deepEqual(days.filter(day => day.groupId === 'e').map(day => day.date), ['2026-10-06', '2026-10-20', '2026-10-27']);
  assert.ok(days.every(day => !day.hasContent && !day.records.length)); assert.deepEqual(document, original);
});
test('group filters include Erasmus and Project manual dates without inventing its weekly meetings', () => {
  const doc = structuredClone(document); doc.meetings.push({ id: 'p1', groupId: 'proyecto', date: '2026-10-23', title: 'Proyecto', notes: 'Nota guardada' });
  assert.deepEqual(allDays(meetingCalendar(doc, common, 'proyecto')).map(day => day.date), ['2026-10-23']);
  assert.ok(allDays(meetingCalendar(doc, common, 'e')).every(day => day.groupId === 'e'));
  assert.equal(allDays(meetingCalendar(doc, common)).find(day => day.groupId === 'proyecto').hasContent, true);
});
test('saved future topics, requests and notes mark a dot; whitespace and empty records do not', () => {
  for (const value of [{ notes: 'Texto' }, { topics: ['Tema'] }, { requests: ['Ruego'] }]) assert.equal(hasMeetingContent(value), true);
  for (const value of [{}, { notes: '  ', topics: ['\n'], requests: [] }]) assert.equal(hasMeetingContent(value), false);
  const doc = structuredClone(document); doc.meetings.push({ id: 'n', meetingId: 'dept', groupId: 'd', date: '2026-10-26', topics: ['Preparar'] });
  const day = allDays(meetingCalendar(doc, common, 'd')).find(day => day.date === '2026-10-26');
  assert.equal(day.hasContent, true); assert.equal(dayChoices(day).length, 1); assert.equal(dayChoices(day)[0].record.id, 'n');
});
test('manual notes on a planned date are kept once on the calendar without changing their identity', () => {
  const doc = structuredClone(document); doc.meetings.push({ id: 'manual', groupId: 'd', date: '2026-10-19', title: 'Departamento', notes: 'Conservar', extra: true });
  const before = structuredClone(doc), days = allDays(meetingCalendar(doc, common, 'd'));
  const day = days.find(day => day.date === '2026-10-19');
  assert.equal(days.filter(day => day.date === '2026-10-19').length, 1); assert.equal(day.occurrences.length, 1);
  assert.equal(dayChoices(day).length, 1); assert.equal(dayChoices(day)[0].record.id, 'manual'); assert.deepEqual(doc, before);
});
test('several meetings on a date remain individually selectable and saved notes outside timetable remain visible', () => {
  const doc = structuredClone(document); doc.meetings.push(...['a', 'b'].map(id => ({ id, groupId: 'd', date: '2026-10-12', title: id, notes: id })));
  const day = allDays(meetingCalendar(doc, common, 'd')).find(day => day.date === '2026-10-12');
  assert.deepEqual(dayChoices(day).map(choice => choice.key), ['a', 'b']);
  assert.deepEqual(allDays(meetingCalendar(doc, null)).map(day => day.date), ['2026-10-12']);
});
test('old Project navigation is restored within Reuniones after moving its group', () => {
  const catalog = { modules: [] };
  assert.deepEqual(resolveRemembered({ type: 'meeting-group', space: 'project', groupId: 'proyecto' }, catalog, common, document), { type: 'meeting-group', space: 'meetings', groupId: 'proyecto' });
});
