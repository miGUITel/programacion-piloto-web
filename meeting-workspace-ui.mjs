import { saveErrorFeedback } from './core.mjs?v=20261018-rf12';
import { recordKey, recordGroup, groupForSchedule, meetingTitle, withMeetingRecord } from './meeting-records.mjs?v=20261019-meeting-calendar';
import { madridClock, meetingContext, meetingGroupContext } from './startup-context.mjs?v=20261019-meeting-calendar';
import { meetingCalendar, calendarGroups, dayChoices } from './meeting-calendar.mjs?v=20261019-meeting-calendar';
const $ = id => document.getElementById(id);
const node = (tag, text, className = '') => { const e = document.createElement(tag); e.className = className; if (text !== undefined) e.textContent = text; return e; };
const listText = value => (value ?? []).join('\n');
const lines = value => value.split('\n').map(v => v.trim()).filter(Boolean);
const newId = () => 'meeting-' + [...crypto.getRandomValues(new Uint32Array(4))].map(n => n.toString(16).padStart(8, '0')).join('');
const fullDate = date => new Intl.DateTimeFormat('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(date + 'T12:00:00Z'));

export function createMeetingWorkspace({ getCatalog, getReader, getCommon, loadCommon, isBusy, setBusy, onStateChange, onLocation, onRemember, onShow, onWarning }) {
  let loaded = null, groupId = null, record = null, baseline = null, draftId = null, editingGroupId = null, blocked = false, error = false, calendarCommon = null, selectedDay = null;
  const controls = ['meeting-record-date', 'meeting-record-title', 'meeting-topics', 'meeting-requests', 'meeting-notes'];
  const message = (content = '', kind = '') => { const e = $('meetings-message'); e.textContent = content; e.className = 'message' + (kind ? ' ' + kind : ''); e.hidden = !content; };
  function values() { return { date:$('meeting-record-date').value, title:$('meeting-record-title').value, topics:$('meeting-topics').value, requests:$('meeting-requests').value, notes:$('meeting-notes').value }; }
  const pending = () => Boolean(baseline && (blocked || JSON.stringify(values()) !== JSON.stringify(baseline)));
  const groups = () => calendarGroups(loaded?.document);
  const group = id => groups().find(g => g.id === id) ?? null;
  const allDays = () => meetingCalendar(loaded?.document, calendarCommon, groupId).flatMap(month => month.groups.flatMap(row => row.days));
  function availability() {
    const busy = isBusy(), dirty = pending();
    controls.forEach(id => { $(id).disabled = busy || !baseline || blocked; });
    $('meeting-record-date').readOnly = Boolean(record?.meetingId);
    $('meeting-record-title').readOnly = Boolean(record?.meetingId);
    $('meeting-save').disabled = busy || !dirty || blocked;
    $('meeting-new').disabled = busy || dirty || !group(groupId);
    $('meeting-update').disabled = busy || !getReader();
    $('meeting-download').hidden = !dirty; $('meeting-download').disabled = busy;
    $('meeting-discard').hidden = !dirty; $('meeting-discard').disabled = busy;
    $('meeting-history').querySelectorAll('button').forEach(button => { button.disabled = busy || dirty; });
    $('meeting-day-choices').querySelectorAll('button').forEach(button => { button.disabled = busy || dirty; });
    $('meeting-editor').hidden = !baseline;
    $('meeting-editor-return').hidden = !baseline; $('meeting-editor-return').disabled = busy;
  }
  function change() { availability(); onStateChange(); }
  function notifyLocation() { onLocation({ space:'meetings', groupId }); }
  function accept(result) { loaded = result; blocked = false; error = false; }
  function resetEditor() { record = null; baseline = null; draftId = null; editingGroupId = null; selectedDay = null; blocked = false; controls.forEach(id => { $(id).value = ''; }); $('meeting-day-choices').replaceChildren(); }
  function editorFocus() { if (!baseline) return; $('meeting-editor').scrollIntoView({ block:'start', behavior:'instant' }); $('meeting-notes').focus({ preventScroll:true }); }
  function rememberRecord() {
    if (!record) return;
    const saved = loaded.document.meetings.some(r => recordKey(r) === recordKey(record));
    onRemember(meetingContext({ ...record, ...(saved && record.id ? { recordId:record.id } : {}), groupId:editingGroupId, space:'meetings' }));
  }
  function populate(selected, selectedGroup = groupId) {
    record = selected; draftId = selected?.id ?? newId();
    editingGroupId = selected ? recordGroup(loaded.document, selected)?.id ?? selectedGroup : selectedGroup;
    const v = { date:selected?.date ?? madridClock().date, title:selected ? meetingTitle(loaded.document, selected, calendarCommon) : (group(editingGroupId)?.title ?? ''), topics:selected?.topics ?? [], requests:selected?.requests ?? [], notes:selected?.notes ?? '' };
    $('meeting-record-date').value = v.date; $('meeting-record-title').value = v.title; $('meeting-topics').value = listText(v.topics); $('meeting-requests').value = listText(v.requests); $('meeting-notes').value = v.notes;
    baseline = values(); blocked = false;
    $('meeting-editor-heading').textContent = (group(editingGroupId)?.title ?? 'Reunión') + ' · ' + fullDate(v.date);
    renderHistory(); notifyLocation(); change();
  }
  function renderHistory() {
    const doc = loaded?.document, history = $('meeting-history');
    $('meeting-space-title').textContent = group(groupId)?.title ?? 'Reuniones';
    $('meeting-new').hidden = !group(groupId);
    $('meeting-calendar-status').hidden = Boolean(calendarCommon);
    $('meeting-calendar-status').textContent = calendarCommon ? '' : 'No se ha podido consultar el horario vigente. Se muestran solo las fechas con reuniones guardadas; puedes reintentar con Actualizar.';
    history.replaceChildren();
    if (!doc) { history.append(node('p', 'No se ha podido leer el registro de reuniones.', 'scope-note')); return; }
    const months = meetingCalendar(doc, calendarCommon, groupId);
    if (!months.length) history.append(node('p', 'Todavía no hay reuniones previstas ni guardadas en este grupo.', 'scope-note'));
    for (const month of months) {
      const card = node('section', undefined, 'meeting-month');
      card.append(node('h3', new Intl.DateTimeFormat('es-ES', { month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(month.month + '-01T12:00:00Z'))));
      for (const row of month.groups) {
        const line = node('div', undefined, 'meeting-calendar-row');
        if (!groupId) line.append(node('h4', row.title));
        const dates = node('div', undefined, 'meeting-calendar-dates');
        for (const day of row.days) {
          const button = node('button', day.date.slice(8), 'meeting-date-button');
          button.type = 'button'; button.dataset.date = day.date; button.dataset.group = day.groupKey;
          button.setAttribute('aria-pressed', String(selectedDay === day.key));
          button.title = row.title + ' · ' + fullDate(day.date) + (day.hasContent ? ' · Con contenido guardado' : ' · Sin contenido guardado');
          button.setAttribute('aria-label', button.title);
          if (day.hasContent) { const dot = node('span', '·', 'meeting-content-dot'); dot.setAttribute('aria-hidden', 'true'); button.append(dot); }
          button.addEventListener('click', () => openDay(day.key)); dates.append(button);
        }
        line.append(dates); card.append(line);
      }
      history.append(card);
    }
  }
  function showDayChoices(day) {
    const container = $('meeting-day-choices'); container.replaceChildren();
    const choices = dayChoices(day);
    container.hidden = choices.length < 2;
    if (choices.length < 2) return;
    container.append(node('p', 'Hay varias reuniones en esta fecha. Elige cuál quieres editar:', 'scope-note'));
    for (const [index, choice] of choices.entries()) {
      const title = choice.record ? meetingTitle(loaded.document, choice.record, calendarCommon) : choice.occurrence.title;
      const button = node('button', String(index + 1) + ' · ' + title, 'button'); button.type = 'button';
      button.addEventListener('click', () => { if (!isBusy() && !pending()) { selectChoice(day, choice); editorFocus(); } }); container.append(button);
    }
  }
  function selectChoice(day, choice) {
    selectedDay = day.key;
    populate(choice.record ?? { meetingId:choice.occurrence.meetingId, date:day.date, ...(day.groupId ? { groupId:day.groupId } : {}) }, day.groupId);
    showDayChoices(day); message(); onShow(); rememberRecord();
  }
  async function read() {
    const [registry, common] = await Promise.all([getReader().load(getCatalog()), (loadCommon ? loadCommon() : Promise.resolve(getCommon())).catch(() => null)]);
    if (!registry.document) throw Error('MissingMeetingRegistry');
    accept(registry); calendarCommon = common; // Never silently reuse an older calendar after a failed read.
  }
  async function openGroup(nextSpace, nextGroup = null) {
    if (isBusy() || document.querySelector('dialog[open]')) return false;
    if (nextSpace === 'project' && nextGroup === null) nextGroup = 'proyecto';
    if (pending()) {
      if (nextGroup === groupId) { onShow(); notifyLocation(); change(); return true; }
      onWarning('Guarda o descarta las notas de reunión antes de abrir otro grupo.'); notifyLocation(); return false;
    }
    setBusy(true);
    try {
      await read(); groupId = nextGroup;
      if (groupId && !group(groupId)) throw Error('UnknownMeetingGroup');
      resetEditor(); message(); renderHistory(); notifyLocation(); onShow(); onRemember(meetingGroupContext('meetings', groupId)); return true;
    } catch { error = true; message('No se puede abrir el registro de reuniones. Se conservan los borradores y puedes reintentar.', 'error'); onShow(); return false; }
    finally { setBusy(false); change(); }
  }
  async function openDay(key) {
    if (isBusy()) return false;
    if (pending()) { onWarning('Guarda o descarta las notas de esta reunión antes de abrir otra.'); return false; }
    let opened = false; setBusy(true);
    try {
      await read(); const day = allDays().find(day => day.key === key);
      if (!day) { renderHistory(); message('Esa fecha ya no aparece en el horario vigente. Se conservan las notas guardadas.', 'warning'); return false; }
      selectChoice(day, dayChoices(day)[0]); opened = true; return true;
    } catch { error = true; message('No se ha podido abrir la fecha. Las notas pendientes se conservan.', 'error'); return false; }
    finally { setBusy(false); change(); if (opened) editorFocus(); }
  }
  async function openRecord(key) {
    if (isBusy()) return false;
    if (pending()) { onWarning('Guarda o descarta las notas de esta reunión antes de abrir otra.'); return false; }
    let opened = false; setBusy(true);
    try {
      await read(); const selected = loaded.document.meetings.find(r => recordKey(r) === key); if (!selected) throw Error('MissingMeeting');
      groupId = recordGroup(loaded.document, selected)?.id ?? null;
      const day = allDays().find(day => day.records.some(r => recordKey(r) === key)); selectedDay = day?.key ?? null;
      populate(selected); if (day) showDayChoices(day); message(); onShow(); rememberRecord(); opened = true; return true;
    } catch { error = true; message('No se ha podido recuperar la reunión. Las notas pendientes se conservan.', 'error'); return false; }
    finally { setBusy(false); change(); if (opened) editorFocus(); }
  }
  async function openScheduled(meeting, initial = false) {
    if ((isBusy() && !initial) || document.querySelector('dialog[open]')) return false;
    if (pending()) { onWarning('Guarda o descarta las notas de reunión antes de abrir otra.'); notifyLocation(); return false; }
    if (!initial) setBusy(true);
    try {
      await read(); groupId = groupForSchedule(loaded.document, meeting.meetingId)?.id ?? null;
      const day = allDays().find(day => day.date === meeting.date && day.occurrences.some(o => o.meetingId === meeting.meetingId));
      if (!day) throw Error('MissingOccurrence');
      const choices = dayChoices(day);
      selectChoice(day, choices.find(choice => choice.record?.meetingId === meeting.meetingId) ?? choices[0]); return true;
    } catch { error = true; message('No se ha podido confirmar la convocatoria y sus notas. Puedes consultar sus fechas desde Reuniones.', 'error'); onShow(); return false; }
    finally { if (!initial) setBusy(false); change(); }
  }
  async function save(event) {
    event.preventDefault(); if (isBusy() || blocked || !pending()) return;
    const v = values();
    const topics = record && v.topics === baseline.topics ? (record.topics ?? []) : lines(v.topics);
    const requests = record && v.requests === baseline.requests ? (record.requests ?? []) : lines(v.requests);
    if (!topics.some(x => x.trim()) && !requests.some(x => x.trim()) && !v.notes.trim()) { message('Añade al menos un tema, ruego o nota antes de guardar.', 'error'); return; }
    setBusy(true);
    try {
      const fields = { id:record?.id ?? draftId, date:v.date, topics, requests, notes:v.notes };
      if (record?.meetingId) fields.meetingId = record.meetingId; else fields.title = v.title.trim();
      if (editingGroupId) fields.groupId = editingGroupId;
      const exists = record && loaded.document.meetings.some(r => recordKey(r) === recordKey(record));
      const next = withMeetingRecord(loaded.document, exists ? recordKey(record) : null, fields);
      const confirmed = await getReader().save(getCatalog(), next, loaded.sha); accept(confirmed);
      const saved = confirmed.document.meetings.find(r => r.id === fields.id);
      selectedDay = allDays().find(day => day.records.some(r => r.id === fields.id))?.key ?? null;
      populate(saved); const day = allDays().find(day => day.key === selectedDay); if (day) showDayChoices(day);
      message('Reunión guardada y comprobada.'); rememberRecord();
    } catch (e) { const feedback = saveErrorFeedback(e); blocked = feedback.requiresReload; error = true; message(feedback.message, feedback.kind); }
    finally { setBusy(false); change(); }
  }
  async function update() {
    if (isBusy()) return;
    if (pending() && !window.confirm('La lectura sustituirá las notas pendientes de esta reunión. Descarga el borrador si quieres conservarlo. ¿Descartar y leer GitHub?')) return;
    const key = record ? recordKey(record) : null; setBusy(true);
    try { await read(); const selected = key ? loaded.document.meetings.find(r => recordKey(r) === key) : null; resetEditor(); if (selected) populate(selected); else renderHistory(); notifyLocation(); message('Reuniones y calendario actualizados.'); }
    catch { error = true; message('No se ha podido actualizar. El borrador permanece intacto.', 'error'); }
    finally { setBusy(false); change(); }
  }
  $('meeting-form').addEventListener('submit', save);
  $('meeting-form').addEventListener('input', change);
  $('meeting-new').addEventListener('click', () => { if (!isBusy() && !pending()) { selectedDay = null; populate(null); $('meeting-day-choices').replaceChildren(); message(); editorFocus(); $('meeting-record-date').focus(); } });
  $('meeting-update').addEventListener('click', update);
  $('meeting-all').addEventListener('click', () => openGroup('meetings', null));
  $('meeting-editor-return').addEventListener('click', editorFocus);
  $('meeting-calendar-back').addEventListener('click', () => { $('meeting-history').scrollIntoView({ block:'start', behavior:'instant' }); $('meeting-history').querySelector('[aria-pressed="true"]')?.focus({ preventScroll:true }); });
  $('meeting-discard').addEventListener('click', () => { if (isBusy() || !window.confirm('¿Descartar las notas pendientes de esta reunión?')) return; resetEditor(); renderHistory(); message(); change(); });
  $('meeting-download').addEventListener('click', () => { if (!baseline) return; const data = { recordId:record?.id ?? draftId, groupId:editingGroupId, values:values() }; const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type:'application/json' })); const a = node('a'); a.href = url; a.download = 'borrador-reunion.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
  return {
    seed(result) { if (!pending()) { accept(result); calendarCommon = getCommon(); renderHistory(); change(); } },
    document:() => loaded?.document ?? null, groups, spaces:() => loaded?.document ? [{ id:'meetings', title:'Reuniones' }] : [],
    location:() => ({ space:'meetings', groupId }), hasPending:pending, hasError:() => error, availability, openGroup, openRecord, openScheduled,
    clear() { loaded = null; calendarCommon = null; resetEditor(); groupId = null; message(); $('meeting-history').replaceChildren(); change(); }
  };
}
