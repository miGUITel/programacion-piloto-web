import test from 'node:test';
import assert from 'node:assert/strict';
import { unitCurriculum } from './unit-curriculum.mjs';

function fixture() {
  const document = { module: { code: 'LM' }, unit: { id: 'LM-UT02', notes: 'Nota pendiente' }, sessions: [{ id: 'stable', activities: [{ id: 'stable-activity', pending: 'Conservar' }] }] };
  const profile = { module: { code: 'LM' }, annualPlan: { units: [{ id: 'LM-UT02', curriculumRefs: [{ raCode: '2', ceCodes: ['2.a'] }] }] },
    curriculum: { sourceLabel: 'Fuente sintética', outcomes: [
      { code: '2', text: 'Texto completo RA2 <b>literal</b>', criteria: [{ code: '2.a', text: 'Texto completo CE a' }, { code: '2.b', text: 'CE ajeno a la UT' }] },
      { code: '3', text: 'Texto RA3', criteria: [{ code: '3.a', text: 'Texto CE3' }] },
    ] } };
  return { document, profile };
}

test('resolves annual associations when the unit has no list, using only module texts', () => {
  const { document, profile } = fixture(), before = structuredClone({ document, profile });
  const result = unitCurriculum(document, profile);
  assert.match(result.associationSource, /recorrido anual/);
  assert.equal(result.outcomes[0].text, 'Texto completo RA2 <b>literal</b>');
  assert.deepEqual(result.outcomes[0].criteria, [{ code: '2.a', text: 'Texto completo CE a' }]);
  assert.deepEqual(result.outcomes[0].warnings, []);
  assert.deepEqual({ document, profile }, before);
});

test('unit associations take precedence, including explicit empty lists and all legacy code spellings', () => {
  for (const code of ['2.a', '2a', 'RA2.a']) {
    const { document, profile } = fixture();
    document.unit.curriculumRefs = [{ raCode: 'RA2', ceCodes: [code], description: 'Texto viejo', criteria: [{ code, description: 'CE viejo' }] }];
    const result = unitCurriculum(document, profile);
    assert.match(result.associationSource, /registradas en la UT/);
    assert.equal(result.outcomes[0].text, profile.curriculum.outcomes[0].text);
    assert.equal(result.outcomes[0].criteria[0].text, 'Texto completo CE a');
    document.unit.curriculumRefs = [];
    assert.equal(unitCurriculum(document, profile).outcomes.length, 0);
  }
});

test('a partial RA association never assigns every criterion from that RA', () => {
  const { document, profile } = fixture();
  document.unit.curriculumRefs = [{ raCode: '2' }, { raCode: '3', ceCodes: ['3.a'] }];
  const result = unitCurriculum(document, profile);
  assert.equal(result.outcomes.length, 2);
  assert.deepEqual(result.outcomes[0].criteria, []);
  assert.match(result.outcomes[0].warnings.join(' '), /pendientes de concretar/);
  assert.equal(result.outcomes[1].criteria[0].text, 'Texto CE3');
});

test('missing or ambiguous definitions remain visible without substituting embedded texts', () => {
  const { document, profile } = fixture();
  document.unit.curriculumRefs = [{ raCode: '2', ceCodes: ['2.z'] }, { raCode: '99', ceCodes: ['99.a'] }];
  const result = unitCurriculum(document, profile);
  assert.equal(result.outcomes[0].criteria[0].code, '2.z');
  assert.equal(result.outcomes[0].criteria[0].text, '');
  assert.match(result.outcomes[0].warnings.join(' '), /no se ha encontrado/);
  assert.equal(result.outcomes[1].text, '');
  profile.curriculum.outcomes.push({ ...profile.curriculum.outcomes[0], code: 'RA2' });
  assert.equal(unitCurriculum(document, profile).outcomes[0].text, '');
});

test('pending status, explicit empty CE lists and unmatched units keep their distinct messages', () => {
  const { document, profile } = fixture();
  profile.annualPlan.units[0].criteriaStatus = 'pending';
  assert.match(unitCurriculum(document, profile).outcomes[0].warnings.join(' '), /pendientes/);
  document.unit.curriculumRefs = [{ raCode: '2', ceCodes: [] }];
  assert.match(unitCurriculum(document, profile).outcomes[0].warnings.join(' '), /no tiene CE asociados/);
  delete document.unit.curriculumRefs; document.unit.id = 'LM-UT99';
  assert.equal(unitCurriculum(document, profile).outcomes.length, 0);
  profile.module.code = 'SR';
  assert.throws(() => unitCurriculum(document, profile), /no corresponde/);
});
