/** Pure optional data contract; safe to import from every document validator. */
const object = value => value && typeof value === 'object' && !Array.isArray(value);
export const improvementStates = Object.freeze({ proposed: 'Propuesta', applied: 'Aplicada', discarded: 'Descartada' });

export function validateTeachingNotes(value, errors = [], path = 'teachingNotes') {
  if (value === undefined) return errors;
  if (!object(value)) { errors.push(`${path}: objeto requerido.`); return errors; }
  if (Object.hasOwn(value, 'feedback') && (typeof value.feedback !== 'string' || value.feedback.length > 20000)) errors.push(`${path}.feedback: texto de hasta 20000 caracteres.`);
  if (Object.hasOwn(value, 'improvements')) {
    if (!Array.isArray(value.improvements) || value.improvements.length > 100) errors.push(`${path}.improvements: lista de hasta 100 propuestas.`);
    else {
      const ids = new Set();
      value.improvements.forEach((item, index) => {
        const p = `${path}.improvements[${index}]`;
        if (!object(item)) { errors.push(`${p}: propuesta no válida.`); return; }
        if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 120 || ids.has(item.id)) errors.push(`${p}.id: identidad única requerida.`);
        ids.add(item.id);
        if (typeof item.text !== 'string' || !item.text.trim() || item.text.length > 5000) errors.push(`${p}.text: texto de 1 a 5000 caracteres.`);
        if (!Object.hasOwn(improvementStates, item.status)) errors.push(`${p}.status: proposed, applied o discarded.`);
      });
    }
  }
  return errors;
}
