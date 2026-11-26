// Pure model of the pediatric age atlas. No DOM access.
// Ages are expressed in days. 1 year = 365.25 days, 1 month = 30.4375 days.

export const DAY = 1;
export const MONTH = 30.4375;
export const YEAR = 365.25;
export const MAX_DAYS = 18 * YEAR;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Piecewise-linear interpolation over [[x, y], ...] sorted by x. */
export function interp(points, x) {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return points[points.length - 1][1];
}

// ---------------------------------------------------------------------------
// Age scale. The slider is non-linear so the first month is as reachable as
// the teenage years. Segment widths follow the periods (Model: display choice).
export const SCALE = [
  [0, 0],
  [28, 0.08],
  [YEAR, 0.22],
  [5 * YEAR, 0.42],
  [12 * YEAR, 0.68],
  [MAX_DAYS, 1],
];

/** Days → position 0..1 on the age scale. */
export function daysToPos(days) {
  return interp(SCALE, clamp(days, 0, MAX_DAYS));
}

/** Position 0..1 → days. */
export function posToDays(pos) {
  const inv = SCALE.map(([d, p]) => [p, d]);
  return interp(inv, clamp(pos, 0, 1));
}

/** Snap days to a readable step: days < 28 d, weeks/months < 2 y, months < 5 y, half-years after. */
export function snapDays(days) {
  const d = clamp(days, 0, MAX_DAYS);
  if (d < 28) return Math.round(d);
  if (d < 2 * YEAR) return Math.round(d / MONTH) * MONTH;
  if (d < 5 * YEAR) return Math.round(d / (3 * MONTH)) * 3 * MONTH;
  return Math.round(d / (YEAR / 2)) * (YEAR / 2);
}

/** Split an age into a display unit: {n, unit} with unit in 'd' | 'm' | 'y'. */
export function ageParts(days) {
  if (days < 28) return { n: Math.round(days), unit: 'd' };
  if (days < 2 * YEAR) return { n: Math.max(1, Math.round(days / MONTH)), unit: 'm' };
  const y = Math.round((days / YEAR) * 2) / 2;
  return { n: y, unit: 'y' };
}

// ---------------------------------------------------------------------------
// Periods of the pediatric age (common Spanish scheme; boundaries vary a little
// between textbooks, e.g. some extend "lactante" to 24 months).
export const PERIODS = [
  { key: 'neonato', from: 0, to: 28 },
  { key: 'lactante', from: 28, to: YEAR },
  { key: 'preescolar', from: YEAR, to: 5 * YEAR },
  { key: 'escolar', from: 5 * YEAR, to: 12 * YEAR },
  { key: 'adolescencia', from: 12 * YEAR, to: MAX_DAYS + 1 },
];

export function periodOf(days) {
  return PERIODS.find((p) => days >= p.from && days < p.to) || PERIODS[PERIODS.length - 1];
}

// ---------------------------------------------------------------------------
// Typical size by age (approximate medians, both sexes averaged, WHO 0-5 y and
// WHO 2007 / CDC 5-18 y). Model: used for defaults, plausibility and body surface.
export const TYPICAL = [
  // [days, weight kg, height cm]
  [0, 3.3, 50],
  [0.25 * YEAR, 6.1, 61],
  [0.5 * YEAR, 7.6, 66],
  [YEAR, 9.4, 75],
  [2 * YEAR, 12.0, 87],
  [3 * YEAR, 14.1, 95],
  [5 * YEAR, 18.2, 109],
  [7 * YEAR, 22.5, 121],
  [10 * YEAR, 32, 138],
  [12 * YEAR, 40, 150],
  [15 * YEAR, 55, 166],
  [18 * YEAR, 63, 171],
];
export const ADULT = { weight: 70, height: 170 };

export function typicalWeight(days) {
  return interp(TYPICAL.map((r) => [r[0], r[1]]), days);
}
export function typicalHeight(days) {
  return interp(TYPICAL.map((r) => [r[0], r[2]]), days);
}

/** Weight plausibility for the age: 'ok' or 'unusual' (outside 0.6-1.6 × typical). Model. */
export function weightCheck(days, kg) {
  const t = typicalWeight(days);
  return kg < 0.6 * t || kg > 1.6 * t ? 'unusual' : 'ok';
}

/** Body surface area, Mosteller (m²). */
export function bsa(heightCm, weightKg) {
  return Math.sqrt((heightCm * weightKg) / 3600);
}

/** Body surface per kg relative to the adult (×). */
export function surfaceRatio(days) {
  const w = typicalWeight(days);
  const child = bsa(typicalHeight(days), w) / w;
  const adult = bsa(ADULT.height, ADULT.weight) / ADULT.weight;
  return child / adult;
}

// ---------------------------------------------------------------------------
// Vital signs: normal awake ranges by age (PALS 2015 table, based on Fleming
// et al., Lancet 2011). Other guides give slightly different cut-offs.
export const HR_RANGES = [
  { to: 28, lo: 100, hi: 205 },
  { to: YEAR, lo: 100, hi: 190 },
  { to: 3 * YEAR, lo: 98, hi: 140 },
  { to: 6 * YEAR, lo: 80, hi: 120 },
  { to: 12 * YEAR, lo: 75, hi: 118 },
  { to: Infinity, lo: 60, hi: 100 },
];
export const RR_RANGES = [
  { to: YEAR, lo: 30, hi: 53 },
  { to: 3 * YEAR, lo: 22, hi: 37 },
  { to: 6 * YEAR, lo: 20, hi: 28 },
  { to: 12 * YEAR, lo: 18, hi: 25 },
  { to: Infinity, lo: 12, hi: 20 },
];
export const ADULT_VITALS = { hr: [60, 100], rr: [12, 20] };

const pick = (table, days) => table.find((r) => days < r.to);

export function vitals(days) {
  const h = pick(HR_RANGES, days);
  const r = pick(RR_RANGES, days);
  return { hr: [h.lo, h.hi], rr: [r.lo, r.hi] };
}

/** 'low' | 'normal' | 'high' for a value against a [lo, hi] range. */
export function classify(value, [lo, hi]) {
  if (value < lo) return 'low';
  if (value > hi) return 'high';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Volumes and body composition.

/** Circulating blood volume, mL/kg (neonate 85, infant 80, child 75, adolescent 70). */
export function bloodVolumePerKg(days) {
  if (days < 28) return 85;
  if (days < YEAR) return 80;
  if (days < 12 * YEAR) return 75;
  return 70;
}
export const ADULT_BLOOD_PER_KG = 70;

export function bloodVolume(days, kg) {
  return bloodVolumePerKg(days) * kg;
}

/** Spontaneous tidal volume, mL: 6-8 mL/kg at every age. */
export const TIDAL_PER_KG = [6, 8];
export function tidalVolume(kg) {
  return [TIDAL_PER_KG[0] * kg, TIDAL_PER_KG[1] * kg];
}

/** Total body water and extracellular water, % of body weight (Friis-Hansen). */
export const WATER_POINTS = [
  [0, 75, 45],
  [0.5 * YEAR, 65, 32],
  [YEAR, 60, 26],
  [12 * YEAR, 60, 20],
  [MAX_DAYS, 60, 20],
];
export function totalWater(days) {
  return interp(WATER_POINTS.map((r) => [r[0], r[1]]), days);
}
export function extracellularWater(days) {
  return interp(WATER_POINTS.map((r) => [r[0], r[2]]), days);
}

/** Skeletal muscle, % of body weight (≈25% in the infant, ≈40% in the adult). Model: linear after 1 y. */
export function musclePct(days) {
  return interp([[0, 25], [YEAR, 25], [MAX_DAYS, 40]], days);
}

/** Head length as a fraction of body length (≈1/4 at birth, ≈1/8 in the adult). Model. */
export function headFraction(days) {
  return interp([[0, 0.25], [2 * YEAR, 0.2], [6 * YEAR, 0.167], [12 * YEAR, 0.143], [MAX_DAYS, 0.125]], days);
}

/** Oxygen consumption at rest, mL/kg/min (≈7 neonate → ≈3.5 adult). Model. */
export function oxygenConsumption(days) {
  return interp([[0, 7], [YEAR, 6], [5 * YEAR, 5], [12 * YEAR, 4], [MAX_DAYS, 3.5]], days);
}

// ---------------------------------------------------------------------------
// The 16 body traits. Each returns a state key (for text) plus optional numbers.
// `changes` marks whether the child state differs from the adult one.
export const TRAITS = [
  'superficie', 'fontanelas', 'cerebro', 'cabeza', 'viaAerea', 'metabolismo',
  'costillas', 'corazon', 'respiracion', 'diafragma', 'abdomen', 'rinon',
  'agua', 'volemia', 'huesos', 'musculo',
];

// Where each trait sits on the body figure (fractions of the figure box).
export const TRAIT_REGION = {
  superficie: 'skin', fontanelas: 'head', cerebro: 'head', cabeza: 'head',
  viaAerea: 'neck', metabolismo: 'skin', costillas: 'chest', corazon: 'chest',
  respiracion: 'chest', diafragma: 'chest', abdomen: 'abdomen', rinon: 'abdomen',
  agua: 'skin', volemia: 'chest', huesos: 'limbs', musculo: 'limbs',
};

export function trait(id, days) {
  switch (id) {
    case 'superficie': {
      const r = surfaceRatio(days);
      return { state: r > 1.3 ? 'high' : 'adult', ratio: r };
    }
    case 'fontanelas':
      if (days < 2 * MONTH) return { state: 'both' };
      if (days < 12 * MONTH) return { state: 'anterior' };
      if (days < 18 * MONTH) return { state: 'closing' };
      return { state: 'closed' };
    case 'cerebro':
      return { state: days < YEAR ? 'myelinFast' : days < 12 * YEAR ? 'myelinSlow' : 'adult' };
    case 'cabeza': {
      const f = headFraction(days);
      return { state: f > 0.15 ? 'large' : 'adult', fraction: f };
    }
    case 'viaAerea':
      return { state: days < 5 * YEAR ? 'narrow' : 'adult' };
    case 'metabolismo': {
      const v = oxygenConsumption(days);
      return { state: v > 4.5 ? 'high' : 'adult', vo2: v };
    }
    case 'costillas':
      return { state: days < 12 * YEAR ? 'compliant' : 'adult' };
    case 'corazon':
      return { state: days < 12 * YEAR ? 'rateDependent' : 'adult' };
    case 'respiracion':
      return { state: days < 10 * YEAR ? 'fast' : 'adult' };
    case 'diafragma':
      return { state: days < 5 * YEAR ? 'main' : 'adult' };
    case 'abdomen':
      return { state: days < 12 * YEAR ? 'exposed' : 'adult' };
    case 'rinon':
      if (days < 12 * MONTH) return { state: 'immature' };
      if (days < 18 * MONTH) return { state: 'maturing' };
      return { state: 'adult' };
    case 'agua': {
      const t = totalWater(days);
      const e = extracellularWater(days);
      return { state: e > 22 ? 'high' : 'adult', total: t, extra: e };
    }
    case 'volemia': {
      const v = bloodVolumePerKg(days);
      return { state: v > ADULT_BLOOD_PER_KG ? 'high' : 'adult', perKg: v };
    }
    case 'huesos':
      return { state: days < 12 * YEAR ? 'soft' : 'adult' };
    case 'musculo': {
      const m = musclePct(days);
      return { state: m < 35 ? 'low' : 'adult', pct: m };
    }
    default:
      throw new Error('Unknown trait ' + id);
  }
}

export function allTraits(days) {
  return TRAITS.map((id) => ({ id, ...trait(id, days) }));
}

// ---------------------------------------------------------------------------
// Mortality indicators. Counts in, rates per 1000 out (null if the denominator is 0).
export const RATE_KEYS = [
  'fetal', 'perinatal', 'neonatalPrecoz', 'neonatalTardia', 'neonatal',
  'postneonatal', 'infantil', 'menores5', 'de5a14',
];

/** Window of each rate on the age axis, in days (negative = before birth, 'fetal'). */
export const RATE_WINDOWS = {
  fetal: { from: 'gest', to: 0 },
  perinatal: { from: 'gest', to: 7 },
  neonatalPrecoz: { from: 0, to: 7 },
  neonatalTardia: { from: 7, to: 28 },
  neonatal: { from: 0, to: 28 },
  postneonatal: { from: 28, to: YEAR },
  infantil: { from: 0, to: YEAR },
  menores5: { from: 0, to: 5 * YEAR },
  de5a14: { from: 5 * YEAR, to: 15 * YEAR },
};

/** Which denominator each rate uses. */
export const RATE_DENOMINATOR = {
  fetal: 'totalBirths',
  perinatal: 'totalBirths',
  neonatalPrecoz: 'liveBirths',
  neonatalTardia: 'liveBirths',
  neonatal: 'liveBirths',
  postneonatal: 'liveBirths',
  infantil: 'liveBirths',
  menores5: 'liveBirths',
  de5a14: 'population5to14',
};

export const SDG_TARGETS = { neonatal: 12, menores5: 25 }; // per 1000 live births, by 2030 (SDG 3.2)

const nn = (x) => (Number.isFinite(+x) && +x > 0 ? +x : 0);

/**
 * counts: { liveBirths, fetalDeaths, deaths0to6d, deaths7to27d, deaths28dTo1y,
 *           deaths1to4y, deaths5to14y, population5to14 }
 * fetalDeaths = late fetal deaths (stillbirths) from the chosen gestational threshold.
 */
export function rates(counts) {
  const c = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, nn(v)]));
  const lb = c.liveBirths;
  const tb = lb + c.fetalDeaths;
  const per = (num, den) => (den > 0 ? (1000 * num) / den : null);
  const neonatal = c.deaths0to6d + c.deaths7to27d;
  const infantil = neonatal + c.deaths28dTo1y;
  return {
    fetal: per(c.fetalDeaths, tb),
    perinatal: per(c.fetalDeaths + c.deaths0to6d, tb),
    neonatalPrecoz: per(c.deaths0to6d, lb),
    neonatalTardia: per(c.deaths7to27d, lb),
    neonatal: per(neonatal, lb),
    postneonatal: per(c.deaths28dTo1y, lb),
    infantil: per(infantil, lb),
    menores5: per(infantil + c.deaths1to4y, lb),
    de5a14: per(c.deaths5to14y, c.population5to14),
  };
}

/** SDG 3.2 status: true = target met, false = not met, null = no data. */
export function sdgStatus(r) {
  const s = (k) => (r[k] == null ? null : r[k] <= SDG_TARGETS[k]);
  return { neonatal: s('neonatal'), menores5: s('menores5') };
}

/** Rates whose window contains this age (for the overview). */
export function ratesAtAge(days) {
  return RATE_KEYS.filter((k) => {
    const w = RATE_WINDOWS[k];
    const from = w.from === 'gest' ? -Infinity : w.from;
    return days >= from && days < w.to;
  });
}

/** Hospital morbidity group by age (0-1 y, 1-14 y, none after 14 y). */
export function morbidityGroup(days) {
  if (days < YEAR) return 'm0';
  if (days < 15 * YEAR) return 'm1';
  return 'none';
}

// ---------------------------------------------------------------------------
// Compare two ages: rows with their state at each age and whether they differ.
export function compare(daysA, daysB) {
  const rows = [];
  rows.push({ id: 'period', a: periodOf(daysA).key, b: periodOf(daysB).key });
  const va = vitals(daysA), vb = vitals(daysB);
  rows.push({ id: 'hr', a: va.hr.join('-'), b: vb.hr.join('-') });
  rows.push({ id: 'rr', a: va.rr.join('-'), b: vb.rr.join('-') });
  // a trait differs if its state or any of its (rounded) values differ
  const sig = (id, d) => JSON.stringify(Object.entries(trait(id, d)).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 10) / 10 : v]));
  for (const id of TRAITS) rows.push({ id, a: sig(id, daysA), b: sig(id, daysB) });
  rows.push({ id: 'mortality', a: ratesAtAge(daysA).join(','), b: ratesAtAge(daysB).join(',') });
  rows.push({ id: 'morbidity', a: morbidityGroup(daysA), b: morbidityGroup(daysB) });
  return rows.map((r) => ({ ...r, differs: r.a !== r.b }));
}

// ---------------------------------------------------------------------------
// Presets (deep links ?preset=<key>). Mortality cohorts are fictional teaching data.
export const COHORTS = {
  meets: {
    liveBirths: 100000, fetalDeaths: 300, deaths0to6d: 150, deaths7to27d: 70,
    deaths28dTo1y: 100, deaths1to4y: 60, deaths5to14y: 100, population5to14: 1000000,
  },
  fails: {
    liveBirths: 100000, fetalDeaths: 2000, deaths0to6d: 1800, deaths7to27d: 600,
    deaths28dTo1y: 1600, deaths1to4y: 1500, deaths5to14y: 900, population5to14: 2000000,
  },
};

export const PRESETS = {
  'recien-nacido': { view: 'overview', days: 3 },
  'lactante-6m': { view: 'vitals', days: 6 * MONTH, weight: 7.6 },
  'fontanelas-14m': { view: 'body', days: 14 * MONTH, trait: 'fontanelas' },
  'preescolar-3a': { view: 'overview', days: 3 * YEAR },
  'escolar-8a': { view: 'vitals', days: 8 * YEAR, weight: 26 },
  'adolescente-15a': { view: 'overview', days: 15 * YEAR },
  'comparar-3m-10a': { view: 'compare', days: 3 * MONTH, daysB: 10 * YEAR },
  'mortalidad-cumple-ods': { view: 'mortality', cohort: 'meets', rate: 'infantil' },
  'mortalidad-no-cumple-ods': { view: 'mortality', cohort: 'fails', rate: 'neonatal' },
  autotest: { view: 'quiz' },
};

// ---------------------------------------------------------------------------
// Self-test bank, generated from the same data. Options are keys; the UI
// translates them. `focus` tells the UI where to move the atlas after answering.
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function shuffle(arr, r) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const QUIZ_BLOCKS = ['periods', 'body', 'vitals', 'mortality', 'morbidity'];

export function questionBank() {
  const q = [];
  const periodKeys = PERIODS.map((p) => p.key);
  for (const [days, label] of [[10, 'd10'], [8 * MONTH, 'm8'], [3 * YEAR, 'y3'], [9 * YEAR, 'y9'], [14 * YEAR, 'y14']]) {
    q.push({ id: 'period-' + label, block: 'periods', prompt: 'qPeriod', params: { days }, options: periodKeys, correct: periodKeys.indexOf(periodOf(days).key), focus: { view: 'overview', days } });
  }
  const dens = ['liveBirths', 'totalBirths', 'population5to14', 'deaths'];
  for (const k of ['infantil', 'menores5', 'de5a14', 'perinatal']) {
    q.push({ id: 'den-' + k, block: 'mortality', prompt: 'qDenominator', params: { rate: k }, options: dens, correct: dens.indexOf(RATE_DENOMINATOR[k]), focus: { view: 'mortality', rate: k } });
  }
  const windows = ['neonatal', 'postneonatal', 'perinatal', 'infantil'];
  q.push({ id: 'win-postneonatal', block: 'mortality', prompt: 'qWindow', params: { window: 'w28to1y' }, options: windows, correct: windows.indexOf('postneonatal'), focus: { view: 'mortality', rate: 'postneonatal' } });
  q.push({ id: 'win-perinatal', block: 'mortality', prompt: 'qWindow', params: { window: 'wGestTo7' }, options: windows, correct: windows.indexOf('perinatal'), focus: { view: 'mortality', rate: 'perinatal' } });
  const ages = ['a2m', 'a18m', 'a5y', 'a10y'];
  q.push({ id: 'trait-posterior', block: 'body', prompt: 'qPosterior', options: ages, correct: 0, focus: { view: 'body', days: 2 * MONTH, trait: 'fontanelas' } });
  q.push({ id: 'trait-anterior', block: 'body', prompt: 'qAnterior', options: ages, correct: 1, focus: { view: 'body', days: 18 * MONTH, trait: 'fontanelas' } });
  q.push({ id: 'trait-diafragma', block: 'body', prompt: 'qDiaphragm', options: ages, correct: 2, focus: { view: 'body', days: 4 * YEAR, trait: 'diafragma' } });
  q.push({ id: 'trait-rinon', block: 'body', prompt: 'qKidney', options: ages, correct: 1, focus: { view: 'body', days: 15 * MONTH, trait: 'rinon' } });
  const muscle = ['p10', 'p25', 'p40', 'p60'];
  q.push({ id: 'trait-musculo', block: 'body', prompt: 'qMuscle', options: muscle, correct: 1, focus: { view: 'body', days: 6 * MONTH, trait: 'musculo' } });
  const yn = ['yes', 'no'];
  q.push({ id: 'vital-hr', block: 'vitals', prompt: 'qHrNormal', params: { days: 6 * MONTH, hr: 150 }, options: yn, correct: classify(150, vitals(6 * MONTH).hr) === 'normal' ? 0 : 1, focus: { view: 'vitals', days: 6 * MONTH } });
  q.push({ id: 'vital-rr', block: 'vitals', prompt: 'qRrNormal', params: { days: 14 * YEAR, rr: 32 }, options: yn, correct: classify(32, vitals(14 * YEAR).rr) === 'normal' ? 0 : 1, focus: { view: 'vitals', days: 14 * YEAR } });
  const co = ['rate', 'volume', 'both'];
  q.push({ id: 'vital-co', block: 'vitals', prompt: 'qCardiacOutput', options: co, correct: 0, focus: { view: 'vitals', days: 2 * YEAR } });
  const blood = ['b55', 'b70', 'b80', 'b100'];
  q.push({ id: 'vital-blood', block: 'vitals', prompt: 'qBlood', options: blood, correct: 2, focus: { view: 'vitals', days: 6 * MONTH } });
  const morb = ['m0', 'm1'];
  q.push({ id: 'morb-0', block: 'morbidity', prompt: 'qMorbidity', params: { group: 'perinatalInfections' }, options: morb, correct: 0, focus: { view: 'overview', days: 4 * MONTH } });
  q.push({ id: 'morb-1', block: 'morbidity', prompt: 'qMorbidity', params: { group: 'accidentsSurgery' }, options: morb, correct: 1, focus: { view: 'overview', days: 7 * YEAR } });
  return q;
}

/** A session of n questions covering every block, in a seeded order. */
export function quizSession(seed = 1, n = 12) {
  const r = rng(seed);
  const bank = shuffle(questionBank(), r);
  const picked = [];
  for (const b of QUIZ_BLOCKS) {
    const first = bank.find((q) => q.block === b && !picked.includes(q));
    if (first) picked.push(first);
  }
  for (const q of bank) {
    if (picked.length >= n) break;
    if (!picked.includes(q)) picked.push(q);
  }
  return shuffle(picked, r);
}

export function score(session, answers) {
  const byBlock = Object.fromEntries(QUIZ_BLOCKS.map((b) => [b, { right: 0, total: 0 }]));
  session.forEach((q, i) => {
    byBlock[q.block].total++;
    if (answers[i] === q.correct) byBlock[q.block].right++;
  });
  return byBlock;
}
