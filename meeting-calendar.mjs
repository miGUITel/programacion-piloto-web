import { meetingsForDay } from './startup-context.mjs?v=20261027-rf32';
import { recordGroup, recordKey, groupForSchedule, meetingTitle } from './meeting-records.mjs?v=20261027-rf32';

export const hasMeetingContent = record => Boolean(record?.notes?.trim() || ['topics', 'requests'].some(field => record?.[field]?.some(value => value.trim())));
export const calendarGroups = document => (document?.groups ?? []).map(group => ({ ...group, space: 'meetings' }));

// A calendar day is a view, not a persisted meeting or a confirmation of attendance.
export function meetingCalendar(document, common, groupId = null) {
  const days = new Map(), groups = calendarGroups(document);
  const add = (date, group, fallbackId, fallbackTitle) => {
    if (groupId && group?.id !== groupId) return null;
    const groupKey = group?.id ?? `schedule:${fallbackId ?? 'unassigned'}`;
    const key = `${groupKey}:${date}`;
    if (!days.has(key)) days.set(key, { key, date, groupId: group?.id ?? null, groupKey, groupTitle: group?.title ?? fallbackTitle ?? 'Otras reuniones', records: [], occurrences: [] });
    return days.get(key);
  };
  if (common) {
    for (let date = common.course.startsOn; date <= common.course.endsOn;) {
      for (const occurrence of meetingsForDay(common, date)) {
        const day = add(date, groupForSchedule(document, occurrence.meetingId), occurrence.meetingId, occurrence.title);
        if (day) day.occurrences.push(occurrence);
      }
      const next = new Date(date + 'T12:00:00Z'); next.setUTCDate(next.getUTCDate() + 1); date = next.toISOString().slice(0, 10);
    }
  }
  // Keep saved notes visible even if their date is outside the current timetable.
  for (const record of document?.meetings ?? []) {
    const day = add(record.date, recordGroup(document, record), record.meetingId, meetingTitle(document, record, common));
    if (day) day.records.push(record);
  }
  const months = new Map();
  for (const day of [...days.values()].sort((a, b) => a.date.localeCompare(b.date) || a.groupKey.localeCompare(b.groupKey))) {
    day.records.sort((a, b) => recordKey(a).localeCompare(recordKey(b)));
    day.hasContent = day.records.some(hasMeetingContent);
    const month = day.date.slice(0, 7);
    if (!months.has(month)) months.set(month, { month, groups: [] });
    const rows = months.get(month).groups;
    let row = rows.find(row => row.id === day.groupKey);
    if (!row) { row = { id: day.groupKey, title: day.groupTitle, days: [] }; rows.push(row); }
    row.days.push(day);
  }
  for (const month of months.values()) month.groups.sort((a, b) => {
    const index = id => { const i = groups.findIndex(group => group.id === id); return i < 0 ? groups.length : i; };
    return index(a.id) - index(b.id) || a.title.localeCompare(b.title);
  });
  return [...months.values()];
}

export function dayChoices(day) {
  const records = day.records.map(record => ({ key: recordKey(record), record }));
  // One date may already have manually saved notes: opening it does not relink IDs.
  const virtual = !records.length || day.occurrences.length > 1
    ? day.occurrences.filter(occurrence => !day.records.some(record => record.meetingId === occurrence.meetingId)).map(occurrence => ({ key: `schedule:${occurrence.meetingId}:${occurrence.date}`, occurrence })) : [];
  return [...records, ...virtual];
}
