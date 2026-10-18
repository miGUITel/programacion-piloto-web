import { eventTypes } from './teaching.mjs?v=20261018-rf1';
import { timeToMinutes } from './core.mjs?v=20261018-rf1';

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
const headingMonths = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** Optional, private display-only mirror of the common workbook's teaching periods. */
export function presentationPeriods(catalog) {
  const periods = catalog?.presentation?.periods;
  if (!Array.isArray(periods) || !periods.length || periods.length > 32) return [];
  let previousEnd = -1; let previousNumber = 0;
  for (const period of periods) {
    if (!period || !Number.isInteger(period.number) || period.number <= previousNumber || period.number > 99) return [];
    const start = timeToMinutes(period.start); const end = timeToMinutes(period.end);
    if (start === null || end === null || start < previousEnd || start >= end) return [];
    previousEnd = end; previousNumber = period.number;
  }
  return periods;
}

/** Match actual occupied intervals; never infer period numbers just from duration. */
export function sessionPeriods(session, periods) {
  if (!periods.length) return [];
  const numbers = new Set();
  for (const activity of session.activities) {
    const start = timeToMinutes(activity.start); const end = timeToMinutes(activity.end);
    if (start === null || end === null || start >= end) return [];
    let covered = 0;
    for (const period of periods) {
      const overlap = Math.max(0, Math.min(end, timeToMinutes(period.end)) - Math.max(start, timeToMinutes(period.start)));
      if (overlap) { covered += overlap; numbers.add(period.number); }
    }
    if (covered !== end - start) return [];
  }
  return [...numbers].sort((a, b) => a - b);
}

function periodLabel(numbers) {
  if (!numbers.length) return '';
  if (numbers.length > 1 && numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1)) return `${numbers[0]}–${numbers.at(-1)}`;
  return numbers.join('·');
}

export function compactSessionHeaders(sessions, periods = []) {
  let previousMonth = ''; let previousYear = '';
  return sessions.map(session => {
    const month = session.date.slice(0, 7); const year = session.date.slice(0, 4);
    const date = new Date(session.date + 'T12:00:00Z');
    const weekday = ['D', 'L', 'M', 'X', 'J', 'V', 'S'][date.getUTCDay()];
    const numbers = sessionPeriods(session, periods);
    const monthLabel = month !== previousMonth ? headingMonths[Number(session.date.slice(5, 7)) - 1] + (previousYear && previousYear !== year ? ` ${year.slice(-2)}` : '') : '';
    previousMonth = month; previousYear = year;
    return { sessionLabel: `S${session.number}${numbers.length ? ' · ' + periodLabel(numbers) : ''}`,
      day: `${weekday} ${Number(session.date.slice(8))}`, monthLabel, periods: numbers };
  });
}

export function globalSessionExpansion(sessions, openSessions) {
  const allOpen = sessions.length > 0 && sessions.every(session => openSessions.has(session.id));
  return { allOpen, symbol: allOpen ? '−' : '+', label: allOpen ? 'Plegar todas las sesiones' : 'Desplegar todas las sesiones', disabled: sessions.length === 0 };
}

export function sessionBand(sessions, today = madridToday(), document) {
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
        task: eventTypes(session, document).includes('task'),
        exam: eventTypes(session, document).includes('exam'),
      };
    });
}
