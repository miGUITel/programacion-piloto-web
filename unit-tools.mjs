import { eventTypes } from './teaching.mjs?v=20261016-4';

/** Presentation helpers. Codes, titles, dates and academic states remain unchanged. */
export function compactUnitLabel(unit) {
  const [, digits, suffix] = unit.code.match(/^(?:UT|RA|B)(\d+)([A-Z]?)$/);
  const number = digits.padStart(2, '0') + suffix;
  const title = typeof unit.shortTitle === 'string' && unit.shortTitle.trim() ? unit.shortTitle : unit.title;
  const words = title.split(/\s*[·—|]\s*/)[0].trim().split(/\s+/).slice(0, 3);
  return `${number} ${words.join(' ')}`;
}

export function madridToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const months = ['EN', 'FE', 'MR', 'AB', 'MY', 'JN', 'JL', 'AG', 'SE', 'OC', 'NO', 'DI'];

export function sessionBand(sessions, today = madridToday()) {
  let previousMonth = '';
  return sessions.map((session, index) => ({ session, index }))
    .sort((a, b) => a.session.date.localeCompare(b.session.date) || a.index - b.index)
    .map(({ session, index }) => {
      const month = session.date.slice(0, 7);
      const monthLabel = previousMonth === month ? null : months[Number(session.date.slice(5, 7)) - 1];
      previousMonth = month;
      return {
        id: session.id, index, number: session.number, date: session.date,
        day: String(Number(session.date.slice(8))), monthLabel,
        monthName: new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${session.date}T12:00:00Z`)),
        past: session.date < today, today: session.date === today,
        task: eventTypes(session).includes('task'),
        exam: eventTypes(session).includes('exam'),
      };
    });
}
