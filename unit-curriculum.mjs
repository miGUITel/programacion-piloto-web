// Read-only join: associations belong to the unit; full texts belong to its module.
const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value.trim() : '';
const raKey = value => text(value).replace(/^RA\s*/i, '').toLowerCase();
const ceKey = value => text(value).replace(/^RA\s*/i, '').replace(/^(\d+)\.?([a-z])$/i, '$1.$2').toLowerCase();
const raLabel = value => `RA${text(value).replace(/^RA\s*/i, '')}`;
const uniqueMatch = (values, key, normalize) => {
  const matches = values.filter(value => normalize(value.code) === normalize(key));
  return matches.length === 1 ? matches[0] : null;
};

export function unitCurriculum(document, profile) {
  if (document?.module?.code !== profile?.module?.code || !document?.unit?.id) {
    throw new Error('La información curricular no corresponde al módulo de la unidad.');
  }
  const unit = document.unit;
  const outline = list(profile.annualPlan?.units).find(item => item.id === unit.id);
  // An explicit empty list stays empty; the annual outline is only a fallback.
  const source = Object.hasOwn(unit, 'curriculumRefs') ? unit : outline;
  const refs = list(source?.curriculumRefs);
  const messages = [];
  if (!refs.length) messages.push('Esta unidad todavía no tiene RA y CE asociados.');
  if (source?.curriculumNote) messages.push(source.curriculumNote);
  const outcomes = refs.map(ref => {
    const ra = uniqueMatch(list(profile.curriculum?.outcomes), ref.raCode, raKey);
    const warnings = [];
    if (!ra) warnings.push('No se ha encontrado una definición única de este RA en la información del módulo.');
    const codes = Object.hasOwn(ref, 'ceCodes') ? list(ref.ceCodes) : list(ref.criteria).map(ce => ce.code);
    const criteria = codes.map(code => {
      const ce = uniqueMatch(list(ra?.criteria), code, ceKey);
      return { code: ce?.code ?? code, text: ce?.text ?? '' };
    });
    if (criteria.some(ce => !ce.text)) warnings.push('Hay CE cuya definición no se ha encontrado en la información del módulo.');
    if (source?.criteriaStatus === 'pending' || !Object.hasOwn(ref, 'ceCodes') && !codes.length) {
      warnings.push('CE pendientes de concretar para esta unidad.');
    } else if (!codes.length) warnings.push('Este RA no tiene CE asociados a esta unidad.');
    return { code: ra?.code ?? null, label: raLabel(ra?.code ?? ref.raCode), text: ra?.text ?? '', criteria, warnings };
  });
  return {
    associationSource: source === unit ? 'Asociaciones registradas en la UT.' : 'Asociaciones del recorrido anual del módulo.',
    sourceLabel: text(profile.curriculum?.sourceLabel), outcomes, messages,
  };
}
