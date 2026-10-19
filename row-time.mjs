// Derived display only: never reads or changes preparation, delivery or progress.
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const minute = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;

export function elapsedTiming(date, activities, clock) {
  if (!day(date) || !day(clock?.date) || !Number.isInteger(clock.minute) || clock.minute < 0 || clock.minute >= 1440 || !Array.isArray(activities) || !activities.length) return null;
  const intervals = activities.map(activity => [minute(activity?.start), minute(activity?.end)]);
  if (intervals.some(([start, end]) => !Number.isFinite(start) || !Number.isFinite(end) || end <= start)) return null;
  intervals.sort((a, b) => a[0] - b[0]);
  // Merge overlaps so a minute is counted once; gaps remain outside the duration.
  const ranges = [];
  for (const [start, end] of intervals) {
    const last = ranges.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  const total = ranges.reduce((sum, [start, end]) => sum + end - start, 0);
  const now = date < clock.date ? Infinity : date > clock.date ? -Infinity : clock.minute;
  const elapsed = ranges.reduce((sum, [start, end]) => sum + Math.max(0, Math.min(now, end) - start), 0);
  const state = now < ranges[0][0] ? 'future' : now >= ranges.at(-1)[1] ? 'past' : ranges.some(([start, end]) => start <= now && now < end) ? 'active' : 'gap';
  return { state, elapsed, total, fraction: elapsed / total };
}

export function timingDescription(timing) {
  if (!timing) return 'Indicador temporal no disponible: revisa la fecha y los intervalos previstos.';
  const description = { future: 'Horario previsto aún no iniciado', active: 'Dentro del horario previsto', gap: 'Pausa entre porciones previstas', past: 'Horario previsto finalizado' }[timing.state];
  return `${description} · ${timing.elapsed}/${timing.total} min previstos transcurridos · No confirma impartición ni trabajo realizado.`;
}
