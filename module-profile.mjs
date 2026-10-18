// General module information is read-only. It never owns a unit's follow-up.
const codes = new Set(['LM', 'SR', 'SOS', 'ED', 'PRO']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
export const moduleProfilePath = code => codes.has(code) ? `${code}/module.json` : null;

export function validateModuleProfile(doc, moduleCode) {
  const errors = [];
  if (!object(doc) || ![1, 2].includes(doc.schemaVersion) || !codes.has(moduleCode)
    || !object(doc.module) || doc.module.code !== moduleCode || !text(doc.module.name)) return ['Información general: identidad o versión no válida.'];
  if (!object(doc.annualPlan) || !Array.isArray(doc.annualPlan.units)) return ['Programación anual no válida.'];
  const ids = new Set();
  for (const unit of doc.annualPlan.units) {
    if (!object(unit) || !/^(?:UT|RA|B)\d{1,3}[A-Z]?$/.test(unit.code) || unit.id !== `${moduleCode}-${unit.code}`
      || ids.has(unit.id) || !text(unit.title)) { errors.push('Unidad anual no válida o duplicada.'); continue; }
    ids.add(unit.id);
    if (!object(unit.plannedLoad) || !Number.isFinite(unit.plannedLoad.value) || unit.plannedLoad.value < 0
      || unit.plannedLoad.unit !== 'teachingPeriod') errors.push('Carga anual: se requieren periodos lectivos explícitos.');
    if (!Array.isArray(unit.curriculumRefs) || unit.curriculumRefs.some(ref => !object(ref) || !text(ref.raCode)
      || Object.hasOwn(ref, 'ceCodes') && (!Array.isArray(ref.ceCodes) || ref.ceCodes.some(code => !text(code))))) errors.push('Referencias curriculares no válidas.');
    // These fields belong exclusively to the live unit, not the annual outline.
    if (['sessions', 'tasks', 'state', 'deliveryState', 'resourcePreparation', 'realized', 'taskPresented'].some(key => Object.hasOwn(unit, key))) errors.push('El recorrido anual no admite seguimiento duplicado.');
  }
  if (!Array.isArray(doc.methodology) || doc.methodology.some(section => !object(section) || !text(section.title) || !text(section.text))) errors.push('Metodología no válida.');
  if (!object(doc.assessment)) return [...errors, 'Calificación no válida.'];
  const grading = doc.assessment;
  const weightGroups = doc.schemaVersion === 1 ? ['overall', 'unit', 'finalProject'] : [];
  if (doc.schemaVersion === 2) {
    if (!Array.isArray(grading.sections) || !grading.sections.length || grading.sections.some(section => !object(section)
      || !text(section.id) || !text(section.title) || !text(section.text))) errors.push('Apartados de calificación no válidos.');
    else {
      if (new Set(grading.sections.map(section => section.id)).size !== grading.sections.length) errors.push('Apartados de calificación duplicados.');
      for (const section of grading.sections) if (Object.hasOwn(section, 'components')) {
        const components = section.components;
        if (!Array.isArray(components) || !components.length || components.some(c => !object(c) || !text(c.label)
          || !Number.isFinite(c.weight) || c.weight < 0 || c.weight > 1)
          || Math.abs(components.reduce((sum, c) => sum + c.weight, 0) - 1) > 1e-9) errors.push('Reparto de calificación incompleto o no válido.');
      }
    }
  }
  for (const key of weightGroups) {
    const weights = grading[key];
    if (!object(weights) || !Array.isArray(weights.components) || !weights.components.length
      || weights.components.some(c => !object(c) || !text(c.label) || !Number.isFinite(c.weight) || c.weight < 0 || c.weight > 1)
      || Math.abs(weights.components.reduce((sum, c) => sum + c.weight, 0) - 1) > 1e-9) errors.push(`Calificación ${key}: reparto incompleto o no válido.`);
  }
  if (doc.schemaVersion === 1 && (!object(grading.examGuidance) || grading.examGuidance.approximate !== true || !text(grading.examGuidance.text))) errors.push('Orientación del examen no válida.');
  if (!object(grading.learningOutcomeWeights) || !['pending', 'confirmed'].includes(grading.learningOutcomeWeights.status)) errors.push('Estado de ponderaciones de RA no válido.');
  else if (grading.learningOutcomeWeights.status === 'pending' && grading.learningOutcomeWeights.values !== null) errors.push('Los pesos pendientes no pueden convertirse en pesos iguales.');
  else if (grading.learningOutcomeWeights.status === 'confirmed') {
    const values = grading.learningOutcomeWeights.values;
    if (!Array.isArray(values) || !values.length || values.some(v => !object(v) || !text(v.raCode) || !Number.isFinite(v.weight) || v.weight < 0)
      || new Set(values.map(v => v.raCode)).size !== values.length || Math.abs(values.reduce((sum, v) => sum + v.weight, 0) - 1) > 1e-9) errors.push('Pesos de RA confirmados no válidos.');
  }
  if (!object(grading.evaluation) || grading.evaluation.method !== 'mean-of-completed-learning-outcomes' || !text(grading.evaluation.text)) errors.push('Cálculo por evaluación no válido.');
  if (!object(grading.passing) || grading.passing.allLearningOutcomesRequired !== true || grading.passing.independentTaskExamUnitMinimums !== false) errors.push('Condiciones de superación no válidas.');
  if (!text(grading.passing?.text) || (doc.schemaVersion === 1 || Object.hasOwn(grading, 'recovery')) && (!object(grading.recovery) || !text(grading.recovery.text))) errors.push('Condiciones o recuperación no descritas.');
  if ((doc.schemaVersion === 1 || Object.hasOwn(grading, 'rubric')) && (!object(grading.rubric) || !Array.isArray(grading.rubric.levels) || !grading.rubric.levels.length
    || grading.rubric.levels.some(level => !object(level) || !Number.isFinite(level.grade) || !text(level.text))
    || !text(grading.rubric.exception))) errors.push('Rúbrica no válida.');
  if (Object.hasOwn(doc, 'proposals') && (!Array.isArray(doc.proposals) || doc.proposals.some(p => !object(p) || p.status !== 'pending' || !text(p.text)))) errors.push('Propuestas pendientes no válidas.');
  if (!Array.isArray(doc.pending) || doc.pending.some(item => !object(item) || !text(item.id) || !text(item.title) || !text(item.detail))) errors.push('Decisiones pendientes no válidas.');
  if (!object(doc.curriculum) || !Array.isArray(doc.curriculum.outcomes) || doc.curriculum.outcomes.some(ra => !object(ra) || !text(ra.code) || !text(ra.text)
    || !Array.isArray(ra.criteria) || ra.criteria.some(ce => !object(ce) || !text(ce.code) || !text(ce.text)))) errors.push('Marco curricular no válido.');
  else {
    const outcomes = new Map(doc.curriculum.outcomes.map(ra => [ra.code, new Set(ra.criteria.map(ce => ce.code))]));
    if (outcomes.size !== doc.curriculum.outcomes.length) errors.push('RA duplicados.');
    for (const unit of doc.annualPlan.units) for (const ref of unit.curriculumRefs ?? []) {
      if (!outcomes.has(ref.raCode) || (ref.ceCodes ?? []).some(code => !outcomes.get(ref.raCode)?.has(code))) errors.push('Referencia a RA o CE no definido.');
      if (unit.criteriaStatus === 'pending' && Object.hasOwn(ref, 'ceCodes')) errors.push('Los CE pendientes no se rellenan automáticamente.');
    }
  }
  if (!object(doc.provenance) || !/^_archive\/[A-Z]+\/[A-Za-z0-9_./-]+\.json$/.test(doc.provenance.archivePath || '')
    || (doc.provenance.archivePath || '').split('/').some(part => part === '..') || !/^[a-f0-9]{64}$/.test(doc.provenance.sha256 || '')) errors.push('Procedencia privada no válida.');
  return errors;
}

export function annualPlanRows(profile, module, records = []) {
  const entries = new Map((module?.units ?? []).map(entry => [entry.id, entry]));
  const loaded = new Map(records.filter(record => record.document?.module?.code === profile.module.code).map(record => [record.document.unit.id, record.document]));
  return profile.annualPlan.units.map(outline => {
    const unit = loaded.get(outline.id);
    return { outline, entry: entries.get(outline.id) ?? null, unit: unit ?? null };
  });
}

export function annualPlannedPeriods(profile) {
  return profile.annualPlan.units.reduce((total, unit) => total + unit.plannedLoad.value, 0);
}
