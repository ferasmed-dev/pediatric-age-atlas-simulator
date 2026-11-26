import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/model.js';

const { MONTH, YEAR } = M;

test('age scale round-trips and is monotonic', () => {
  for (const d of [0, 5, 27, 28, 100, 365, 800, 3 * YEAR, 10 * YEAR, 17 * YEAR, M.MAX_DAYS]) {
    const back = M.posToDays(M.daysToPos(d));
    assert.ok(Math.abs(back - d) < 1e-6, `round trip ${d}`);
  }
  let prev = -1;
  for (let p = 0; p <= 1; p += 0.01) {
    const d = M.posToDays(p);
    assert.ok(d > prev);
    prev = d;
  }
  assert.equal(M.daysToPos(28), 0.08);
  assert.equal(M.daysToPos(-5), 0);
  assert.equal(M.daysToPos(1e9), 1);
});

test('periods follow the standard boundaries', () => {
  assert.equal(M.periodOf(0).key, 'neonato');
  assert.equal(M.periodOf(27).key, 'neonato');
  assert.equal(M.periodOf(28).key, 'lactante');
  assert.equal(M.periodOf(6 * MONTH).key, 'lactante');
  assert.equal(M.periodOf(YEAR).key, 'preescolar');
  assert.equal(M.periodOf(5 * YEAR).key, 'escolar');
  assert.equal(M.periodOf(12 * YEAR).key, 'adolescencia');
  assert.equal(M.periodOf(M.MAX_DAYS).key, 'adolescencia');
});

test('age parts pick a readable unit', () => {
  assert.deepEqual(M.ageParts(3), { n: 3, unit: 'd' });
  assert.deepEqual(M.ageParts(6 * MONTH), { n: 6, unit: 'm' });
  assert.deepEqual(M.ageParts(14 * MONTH), { n: 14, unit: 'm' });
  assert.deepEqual(M.ageParts(10 * YEAR), { n: 10, unit: 'y' });
});

test('vital ranges fall with age and match PALS cut-offs', () => {
  assert.deepEqual(M.vitals(3).hr, [100, 205]);
  assert.deepEqual(M.vitals(6 * MONTH).hr, [100, 190]);
  assert.deepEqual(M.vitals(6 * MONTH).rr, [30, 53]);
  assert.deepEqual(M.vitals(8 * YEAR).hr, [75, 118]);
  assert.deepEqual(M.vitals(15 * YEAR).rr, [12, 20]);
  let prevHi = Infinity;
  for (const d of [3, 100, 2 * YEAR, 4 * YEAR, 8 * YEAR, 15 * YEAR]) {
    const hi = M.vitals(d).hr[1];
    assert.ok(hi <= prevHi);
    prevHi = hi;
  }
  // every child range is above or equal to the adult one
  for (const d of [3, 100, 2 * YEAR, 8 * YEAR]) {
    assert.ok(M.vitals(d).hr[1] > M.ADULT_VITALS.hr[1]);
    assert.ok(M.vitals(d).rr[1] > M.ADULT_VITALS.rr[1]);
  }
});

test('classify against a range', () => {
  assert.equal(M.classify(150, [100, 190]), 'normal');
  assert.equal(M.classify(90, [100, 190]), 'low');
  assert.equal(M.classify(200, [100, 190]), 'high');
  assert.equal(M.classify(100, [100, 190]), 'normal');
});

test('blood and tidal volumes scale with weight', () => {
  assert.equal(M.bloodVolumePerKg(3), 85);
  assert.equal(M.bloodVolumePerKg(6 * MONTH), 80);
  assert.equal(M.bloodVolumePerKg(8 * YEAR), 75);
  assert.equal(M.bloodVolumePerKg(15 * YEAR), 70);
  assert.equal(M.bloodVolume(6 * MONTH, 8), 640);
  assert.deepEqual(M.tidalVolume(8), [48, 64]);
  assert.deepEqual(M.tidalVolume(0), [0, 0]);
});

test('body composition moves toward adult values', () => {
  assert.equal(M.totalWater(0), 75);
  assert.equal(M.totalWater(YEAR), 60);
  assert.equal(M.extracellularWater(0), 45);
  assert.ok(M.extracellularWater(10 * YEAR) < M.extracellularWater(YEAR));
  assert.equal(M.musclePct(6 * MONTH), 25);
  assert.equal(M.musclePct(M.MAX_DAYS), 40);
  assert.equal(M.headFraction(0), 0.25);
  assert.ok(M.headFraction(M.MAX_DAYS) < M.headFraction(5 * YEAR));
  assert.ok(M.oxygenConsumption(0) > 2 * M.oxygenConsumption(M.MAX_DAYS) - 0.01);
});

test('body surface per kg is about 2.5x the adult at birth and near 1x at 18', () => {
  const r0 = M.surfaceRatio(0);
  assert.ok(r0 > 2.2 && r0 < 2.8, String(r0));
  const r18 = M.surfaceRatio(M.MAX_DAYS);
  assert.ok(r18 > 0.95 && r18 < 1.15, String(r18));
});

test('trait timelines switch at the expected ages', () => {
  assert.equal(M.trait('fontanelas', 20).state, 'both');
  assert.equal(M.trait('fontanelas', 6 * MONTH).state, 'anterior');
  assert.equal(M.trait('fontanelas', 14 * MONTH).state, 'closing');
  assert.equal(M.trait('fontanelas', 2 * YEAR).state, 'closed');
  assert.equal(M.trait('diafragma', 4 * YEAR).state, 'main');
  assert.equal(M.trait('diafragma', 6 * YEAR).state, 'adult');
  assert.equal(M.trait('rinon', 6 * MONTH).state, 'immature');
  assert.equal(M.trait('rinon', 15 * MONTH).state, 'maturing');
  assert.equal(M.trait('rinon', 2 * YEAR).state, 'adult');
  assert.equal(M.trait('viaAerea', 3 * YEAR).state, 'narrow');
  assert.equal(M.trait('respiracion', 9 * YEAR).state, 'fast');
  assert.equal(M.trait('respiracion', 11 * YEAR).state, 'adult');
  assert.equal(M.allTraits(100).length, 16);
  assert.throws(() => M.trait('nope', 1));
});

test('every trait reaches its adult state by 18 years', () => {
  for (const t of M.allTraits(M.MAX_DAYS)) {
    assert.ok(['adult', 'closed'].includes(t.state), `${t.id} → ${t.state}`);
  }
});

test('mortality rates use the right numerators and denominators', () => {
  const r = M.rates(M.COHORTS.meets);
  assert.equal(r.neonatal, 2.2);
  assert.equal(r.neonatalPrecoz, 1.5);
  assert.equal(r.neonatalTardia, 0.7);
  assert.equal(r.postneonatal, 1);
  assert.equal(r.infantil, 3.2);
  assert.equal(r.menores5, 3.8);
  assert.ok(Math.abs(r.perinatal - (1000 * 450) / 100300) < 1e-9);
  assert.ok(Math.abs(r.fetal - (1000 * 300) / 100300) < 1e-9);
  assert.equal(r.de5a14, 0.1);
  // consistency
  assert.ok(Math.abs(r.neonatal + r.postneonatal - r.infantil) < 1e-9);
  assert.ok(r.menores5 >= r.infantil);
});

test('SDG 3.2 status', () => {
  assert.deepEqual(M.sdgStatus(M.rates(M.COHORTS.meets)), { neonatal: true, menores5: true });
  const f = M.rates(M.COHORTS.fails);
  assert.equal(f.neonatal, 24);
  assert.equal(f.menores5, 55);
  assert.deepEqual(M.sdgStatus(f), { neonatal: false, menores5: false });
  assert.deepEqual(M.sdgStatus(M.rates({})), { neonatal: null, menores5: null });
});

test('rates never return NaN or negatives', () => {
  const weird = M.rates({ liveBirths: 0, fetalDeaths: -3, deaths0to6d: 'x', population5to14: 0 });
  for (const v of Object.values(weird)) assert.ok(v === null || (Number.isFinite(v) && v >= 0));
  assert.equal(weird.neonatal, null);
});

test('rate windows at a given age', () => {
  assert.deepEqual(M.ratesAtAge(3), ['perinatal', 'neonatalPrecoz', 'neonatal', 'infantil', 'menores5']);
  assert.deepEqual(M.ratesAtAge(6 * MONTH), ['postneonatal', 'infantil', 'menores5']);
  assert.deepEqual(M.ratesAtAge(8 * YEAR), ['de5a14']);
  assert.deepEqual(M.ratesAtAge(16 * YEAR), []);
});

test('morbidity groups', () => {
  assert.equal(M.morbidityGroup(100), 'm0');
  assert.equal(M.morbidityGroup(7 * YEAR), 'm1');
  assert.equal(M.morbidityGroup(16 * YEAR), 'none');
});

test('compare flags what differs', () => {
  const rows = M.compare(3 * MONTH, 10 * YEAR);
  const get = (id) => rows.find((r) => r.id === id);
  assert.equal(get('period').differs, true);
  assert.equal(get('fontanelas').differs, true);
  assert.equal(get('costillas').differs, false);
  assert.ok(M.compare(500, 500).every((r) => !r.differs));
});

test('weight plausibility', () => {
  assert.equal(M.weightCheck(6 * MONTH, 8), 'ok');
  assert.equal(M.weightCheck(6 * MONTH, 30), 'unusual');
  assert.ok(Math.abs(M.typicalWeight(0) - 3.3) < 1e-9);
});

test('presets reference valid views, cohorts and traits', () => {
  const views = ['overview', 'body', 'vitals', 'mortality', 'compare', 'quiz'];
  for (const [k, p] of Object.entries(M.PRESETS)) {
    assert.ok(views.includes(p.view), k);
    if (p.cohort) assert.ok(M.COHORTS[p.cohort], k);
    if (p.trait) assert.ok(M.TRAITS.includes(p.trait), k);
    if (p.rate) assert.ok(M.RATE_KEYS.includes(p.rate), k);
    if (p.days != null) assert.ok(p.days >= 0 && p.days <= M.MAX_DAYS, k);
  }
});

test('quiz bank answers are consistent with the model', () => {
  const bank = M.questionBank();
  for (const q of bank) {
    assert.ok(q.correct >= 0 && q.correct < q.options.length, q.id);
    assert.ok(M.QUIZ_BLOCKS.includes(q.block), q.id);
  }
  const den = bank.find((q) => q.id === 'den-de5a14');
  assert.equal(den.options[den.correct], 'population5to14');
  const hr = bank.find((q) => q.id === 'vital-hr');
  assert.equal(hr.options[hr.correct], 'yes');
  const rr = bank.find((q) => q.id === 'vital-rr');
  assert.equal(rr.options[rr.correct], 'no');
});

test('quiz session covers all blocks, is seeded and scorable', () => {
  const s1 = M.quizSession(7, 12);
  const s2 = M.quizSession(7, 12);
  assert.equal(s1.length, 12);
  assert.deepEqual(s1.map((q) => q.id), s2.map((q) => q.id));
  for (const b of M.QUIZ_BLOCKS) assert.ok(s1.some((q) => q.block === b), b);
  const perfect = M.score(s1, s1.map((q) => q.correct));
  for (const b of M.QUIZ_BLOCKS) assert.equal(perfect[b].right, perfect[b].total);
});

test('model functions are pure (same input, same output)', () => {
  const a = JSON.stringify([M.allTraits(400), M.rates(M.COHORTS.fails), M.compare(10, 3000)]);
  const b = JSON.stringify([M.allTraits(400), M.rates(M.COHORTS.fails), M.compare(10, 3000)]);
  assert.equal(a, b);
});
