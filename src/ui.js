import * as M from './model.js';
import { STRINGS, t, fmt, setLang, getLang } from './i18n.js';
import { drawTimeline, drawComposition } from './charts.js';

const { MONTH, YEAR } = M;
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VIEWS = ['overview', 'body', 'vitals', 'mortality', 'compare', 'quiz'];

// ---------------------------------------------------------------------------
// State
const S = {
  view: 'overview', days: 6 * MONTH, weight: M.typicalWeight(6 * MONTH), weightTouched: false,
  trait: 'fontanelas', daysB: 10 * YEAR, adult: false, onlyDiff: true, showTable: false,
  cohort: 'meets', counts: { ...M.COHORTS.meets }, threshold: 22, rate: 'infantil',
  hrProbe: 140, rrProbe: 35, quiz: null, preset: null,
};

// ---------------------------------------------------------------------------
// Formatting helpers
function fmtAge(days) {
  const p = M.ageParts(days);
  const [one, many] = t('units.' + p.unit);
  const n = p.unit === 'y' && p.n % 1 ? fmt(p.n, 1) : fmt(p.n);
  return `${n} ${p.n === 1 ? one : many}`;
}
const rateVal = (v) => (v == null ? t('noData') : `${fmt(v, v < 10 ? 2 : 1)} ‰`);
const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

function traitSentence(id, days) {
  const tr = M.trait(id, days);
  return t(`traitText.${id}.${tr.state}`, {
    ratio: fmt(tr.ratio, 1), frac: '1/' + fmt(1 / (tr.fraction || 1)), vo2: fmt(tr.vo2, 1),
    tbw: fmt(tr.total), ecw: fmt(tr.extra), v: fmt(tr.perKg), pct: fmt(tr.pct),
  });
}

// ---------------------------------------------------------------------------
// Shared pieces
function ageSlider(id, label, days, compact = false) {
  const pos = M.daysToPos(days);
  const bands = M.PERIODS.map((p, i) => {
    const w = [8, 14, 20, 26, 32][i];
    const on = M.periodOf(days).key === p.key;
    return compact ? `<div style="flex:${w}" class="${on ? 'on' : ''}"></div>` : `<div style="flex:${w}" class="${on ? 'on' : ''}"><b>${esc(t('periods.' + p.key))}</b><span class="rng mono">${esc(t('periodRange.' + p.key))}</span></div>`;
  }).join('');
  if (compact) {
    const pk = M.periodOf(days).key;
    return `<label class="slider" for="${id}">
    <span class="slider-top"><span class="lbl">${esc(label)}</span><span class="v mono" id="${id}-v">${esc(fmtAge(days))}</span></span>
    <input type="range" id="${id}" min="0" max="1000" step="1" value="${Math.round(pos * 1000)}" style="--fill:${(pos * 100).toFixed(1)}%" aria-valuetext="${esc(fmtAge(days))}">
  </label>
  <div class="bands" id="${id}-bands" aria-hidden="true">${bands}</div><div class="small" style="margin-top:6px"><b id="${id}-p" style="color:var(--indigo-strong)">${esc(t('periods.' + pk))}</b> <span class="muted mono" id="${id}-r">${esc(t('periodRange.' + pk))}</span></div>`;
  }
  return `<label class="slider" for="${id}">
    <span class="slider-top"><span class="lbl">${esc(label)}</span><span class="v mono" id="${id}-v">${esc(fmtAge(days))}</span></span>
    <input type="range" id="${id}" min="0" max="1000" step="1" value="${Math.round(pos * 1000)}" style="--fill:${(pos * 100).toFixed(1)}%" aria-valuetext="${esc(fmtAge(days))}">
  </label>
  <div class="bands" id="${id}-bands" aria-hidden="true">${bands}</div>`;
}
function bindAge(id, key, after) {
  const el = $('#' + id);
  el.addEventListener('input', () => {
    const d = M.snapDays(M.posToDays(el.value / 1000));
    S[key] = d;
    S.preset = null;
    if (key === 'days' && !S.weightTouched) S.weight = Math.round(M.typicalWeight(d) * 2) / 2;
    el.style.setProperty('--fill', (el.value / 10) + '%');
    el.setAttribute('aria-valuetext', fmtAge(d));
    $('#' + id + '-v').textContent = fmtAge(d);
    const bands = $('#' + id + '-bands');
    M.PERIODS.forEach((p, i) => bands.children[i].classList.toggle('on', M.periodOf(d).key === p.key));
    const pk = M.periodOf(d).key;
    if ($('#' + id + '-p')) { $('#' + id + '-p').textContent = t('periods.' + pk); $('#' + id + '-r').textContent = t('periodRange.' + pk); }
    after();
    syncUrl();
  });
}
function linSlider(id, label, value, min, max, step, text, ticks) {
  const pct = ((value - min) / (max - min)) * 100;
  const tk = ticks.map((v) => `<span style="position:absolute;left:${((v - min) / (max - min)) * 100}%;transform:translateX(${v === min ? '0' : v === max ? '-100%' : '-50%'})">${v}</span>`).join('');
  return `<label class="slider" for="${id}">
    <span class="slider-top"><span class="lbl">${esc(label)}</span><span class="v mono" id="${id}-v">${esc(text)}</span></span>
    <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="--fill:${pct.toFixed(1)}%" aria-valuetext="${esc(text)}">
  </label><div class="ticks" style="position:relative;height:14px" aria-hidden="true">${tk}</div>`;
}
function bindLin(id, onValue) {
  const el = $('#' + id);
  el.addEventListener('input', () => {
    const v = +el.value;
    el.style.setProperty('--fill', ((v - el.min) / (el.max - el.min)) * 100 + '%');
    const text = onValue(v);
    $('#' + id + '-v').textContent = text;
    el.setAttribute('aria-valuetext', text);
    S.preset = null;
    syncUrl();
  });
}
function presetBar() {
  const opts = Object.keys(M.PRESETS).map((k) => `<option value="${k}"${S.preset === k ? ' selected' : ''}>${esc(t('presets.' + k))}</option>`).join('');
  return `<div class="presets"><label class="lbl" for="preset">${esc(t('presetsLabel'))}</label>
    <select id="preset"><option value="">—</option>${opts}</select>
    <button class="btn" id="copy" type="button">${esc(t('copyLink'))}</button><span class="small muted" id="copied" role="status"></span></div>`;
}
function head(lbl, title, right = '') {
  return `<div class="head"><div><div class="lbl">${esc(lbl)}</div><h1>${esc(title)}</h1></div><div class="row">${right}</div></div>${presetBar()}`;
}
function adultToggle() {
  return `<div class="seg" role="group" aria-label="${esc(t('toggleLabel'))}">
    <button type="button" data-adult="0" aria-pressed="${!S.adult}">${esc(t('toggleChild'))}</button>
    <button type="button" data-adult="1" aria-pressed="${S.adult}">${esc(t('toggleAdult'))}</button></div>`;
}
function bindAdultToggle(after) {
  document.querySelectorAll('[data-adult]').forEach((b) => b.addEventListener('click', () => {
    S.adult = b.dataset.adult === '1';
    document.querySelectorAll('[data-adult]').forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.adult === '1') === S.adult)));
    after();
  }));
}

// ---------------------------------------------------------------------------
// Body figure: proportions follow the age (head 1/4 → 1/8 of length, legs 3/8 → 1/2).
const HOTSPOT = {
  fontanelas: ['head', 0, -0.85], cerebro: ['head', 0, -0.1], cabeza: ['head', 0.8, 0.2], viaAerea: ['neck', 0, 0],
  costillas: ['chest', -0.55, -0.45], corazon: ['chest', -0.15, -0.1], respiracion: ['chest', 0.5, -0.4], diafragma: ['chest', 0, 0.75],
  volemia: ['chest', 0.4, 0.3], abdomen: ['abdomen', 0, -0.1], rinon: ['abdomen', -0.55, 0.3], metabolismo: ['abdomen', 0.55, 0.3],
  musculo: ['arm', 0, 0.2], superficie: ['hand', 0, 0], huesos: ['leg', 0, -0.1], agua: ['leg2', 0, 0.2],
};
function figureSVG(days, adult, selected) {
  const d = adult ? M.MAX_DAYS : days;
  const W = 240, H = 360, top = 12, L = 336;
  const hf = M.headFraction(d);
  const legF = 0.375 + (0.5 - 0.375) * Math.min(1, d / (16 * YEAR));
  const headH = hf * L, r = headH / 2, cx = W / 2;
  const headCy = top + r;
  const legH = legF * L;
  const torsoTop = top + headH + 4;
  const torsoH = L - headH - legH;
  const torsoW = Math.max(56, Math.min(88, r * 1.9));
  const legW = torsoW * 0.36;
  const armW = legW * 0.8;
  const armL = torsoH * 1.05;
  const legTop = torsoTop + torsoH - 8;
  const geo = {
    head: [cx, headCy, r * 0.8, r * 0.8], neck: [cx, torsoTop + 2, 4, 4],
    chest: [cx, torsoTop + torsoH * 0.3, torsoW * 0.42, torsoH * 0.22], abdomen: [cx, torsoTop + torsoH * 0.72, torsoW * 0.42, torsoH * 0.2],
    arm: [cx - torsoW / 2 - armW / 2 - 4, torsoTop + armL * 0.45, 2, armL * 0.3], hand: [cx + torsoW / 2 + armW / 2 + 4, torsoTop + armL * 0.85, 2, 2],
    leg: [cx - legW * 0.7, legTop + legH * 0.55, 2, legH * 0.3], leg2: [cx + legW * 0.7, legTop + legH * 0.4, 2, legH * 0.3],
  };
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="group" aria-label="${esc(t('ovBody'))}">`;
  s += `<g class="fig-body" aria-hidden="true">
    <circle cx="${cx}" cy="${headCy}" r="${r}"/>
    <rect x="${cx - torsoW / 2}" y="${torsoTop}" width="${torsoW}" height="${torsoH}" rx="${torsoW * 0.4}"/>
    <rect x="${cx - torsoW / 2 - armW - 4}" y="${torsoTop + 6}" width="${armW}" height="${armL}" rx="${armW / 2}"/>
    <rect x="${cx + torsoW / 2 + 4}" y="${torsoTop + 6}" width="${armW}" height="${armL}" rx="${armW / 2}"/>
    <rect x="${cx - legW - 3}" y="${legTop}" width="${legW}" height="${legH}" rx="${legW / 2}"/>
    <rect x="${cx + 3}" y="${legTop}" width="${legW}" height="${legH}" rx="${legW / 2}"/></g>`;
  for (const id of M.TRAITS) {
    const [region, dx, dy] = HOTSPOT[id];
    const [gx, gy, rx, ry] = geo[region];
    const x = gx + dx * rx, y = gy + dy * ry;
    const on = selected === id;
    s += `<g class="hs${on ? ' on' : ''}" data-trait="${id}" tabindex="0" role="button" aria-pressed="${on}" aria-label="${esc(t('traits.' + id))}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 9 : 7}"/><title>${esc(t('traits.' + id))}</title></g>`;
  }
  return s + '</svg>';
}
function bindHotspots(onPick) {
  document.querySelectorAll('.hs').forEach((g) => {
    const go = () => onPick(g.dataset.trait);
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

// ---------------------------------------------------------------------------
// Views
const views = {};

views.overview = {
  build() {
    return head(t('appTitle'), t('appTagline'), adultToggle()) + `
    <section class="card">${ageSlider('age', t('ageSelected'), S.days)}</section>
    <div class="grid2">
      <section class="card figure-wrap" id="ov-fig"></section>
      <div class="stack">
        <section class="card" id="ov-vitals"></section>
        <section class="card" id="ov-mort"></section>
        <section class="card" id="ov-morb"></section>
      </div>
    </div>
    <div class="grid2">
      <section class="card"><h2>${esc(t('ovPeculiar'))}</h2><div class="stack small">${STRINGS[getLang()].peculiar.map(([a, b]) => `<div><b>${esc(a)}:</b> ${esc(b)}</div>`).join('')}</div></section>
      <section class="card"><h2>${esc(t('ovAreas'))}</h2><p class="small" style="margin:0 0 12px">${esc(t('areas'))}</p><p class="small muted" style="margin:0">${esc(t('periodNote'))}</p></section>
    </div>`;
  },
  bind() {
    bindAge('age', 'days', () => this.update());
    bindAdultToggle(() => this.update());
  },
  update() {
    const d = S.days;
    const shown = M.allTraits(d).filter((x) => !['adult', 'closed'].includes(x.state)).slice(0, 5);
    const list = (S.adult ? M.TRAITS.slice(0, 5) : shown.map((x) => x.id)).map((id) => `<div class="it"><span class="dot" aria-hidden="true"></span><span><b>${esc(t('traits.' + id))}</b><br><span class="muted">${esc(S.adult ? t('traitAdult.' + id) : traitSentence(id, d))}</span></span></div>`).join('');
    $('#ov-fig').innerHTML = figureSVG(d, S.adult, null) + `<div class="traitlist"><h2>${esc(t('ovBody'))}</h2>${list || `<p class="muted small">${esc(t('traitAdult.cerebro'))}</p>`}<a href="#" id="to-body" class="small" style="font-weight:600">${esc(t('ovBodyMore'))} →</a></div>`;
    bindHotspots((id) => { S.trait = id; go('body'); });
    $('#to-body').addEventListener('click', (e) => { e.preventDefault(); go('body'); });
    const v = S.adult ? M.ADULT_VITALS : M.vitals(d);
    $('#ov-vitals').innerHTML = `<div class="lbl">${esc(t('ovVitals'))}</div><h2 class="mono" style="margin-top:4px">${esc(t('ovVitalsLine', { hr: v.hr.join('-'), rr: v.rr.join('-') }))}</h2><p class="small muted" style="margin:0">${esc(S.adult ? t('ovVitalsAdultNote') : t('ovVitalsNote'))}</p>`;
    const rs = M.ratesAtAge(d);
    $('#ov-mort').innerHTML = `<div class="lbl">${esc(t('ovMortality'))}</div>` + (rs.length ? `<div class="row" style="margin-top:8px">${rs.map((k) => `<span class="tag" title="${esc(t('rateNum.' + k) + ' / ' + t('denominators.' + M.RATE_DENOMINATOR[k]))}">${esc(t('rateShort.' + k))} · ÷ ${esc(t('denominators.' + M.RATE_DENOMINATOR[k]).split(' (')[0])}</span>`).join('')}</div>` : `<p class="small muted" style="margin:6px 0 0">${esc(t('ovMortalityNone'))}</p>`);
    $('#ov-morb').innerHTML = `<div class="lbl">${esc(t('ovMorbidity'))}</div><p style="margin:6px 0 0">${esc(t('morbidity.' + M.morbidityGroup(d)))}</p>`;
  },
};

function traitBar(id, days) {
  const N = 240, segs = [];
  for (let i = 0; i <= N; i++) {
    const d = M.posToDays(i / N);
    const st = M.trait(id, d).state;
    const kind = st === 'adult' || st === 'closed' ? 'a' : st === 'closing' || st === 'maturing' ? 'm' : 'c';
    if (!segs.length || segs[segs.length - 1].k !== kind) segs.push({ k: kind, from: i / N, to: i / N });
    else segs[segs.length - 1].to = i / N;
  }
  const col = { c: 'var(--indigo)', m: 'var(--mint)', a: 'var(--line-strong)' };
  const bars = segs.map((g) => `<div style="position:absolute;top:0;bottom:0;left:${(g.from * 100).toFixed(1)}%;width:${(Math.max(0.004, g.to - g.from) * 100).toFixed(1)}%;background:${col[g.k]}"></div>`).join('');
  const ya = getLang() === 'en' ? ' y' : ' a';
  const tk = [[0, '0'], [28, '28 d'], [YEAR, '1' + ya], [5 * YEAR, '5' + ya], [12 * YEAR, '12' + ya], [M.MAX_DAYS, '18' + ya]]
    .map(([d, l], i, a) => `<span style="position:absolute;left:${(M.daysToPos(d) * 100).toFixed(1)}%;transform:translateX(${i === 0 ? 0 : i === a.length - 1 ? '-100%' : '-50%'})">${l}</span>`).join('');
  return `<div style="margin:0 0 16px"><div style="position:relative;height:12px;border-radius:6px;overflow:hidden;background:var(--line)">${bars}</div>
    <div style="position:relative;height:0"><div style="position:absolute;top:-17px;left:${(M.daysToPos(days) * 100).toFixed(1)}%;width:3px;height:22px;margin-left:-1.5px;background:var(--ink);border-radius:2px"></div></div>
    <div class="ticks" style="position:relative;height:14px;margin-top:6px">${tk}</div>
    <div class="legend small" style="margin-top:8px">${t('barLegend').map((l, i) => `<span><span class="sw" style="height:8px;width:14px;background:${col['cma'[i]]}"></span>${esc(l)}</span>`).join('')}</div></div>`;
}

views.body = {
  build() {
    return head(t('bodyTitle'), '', `<div style="text-align:right"><div class="lbl">${esc(t('age'))}</div><div class="mono" style="font-size:22px;color:var(--indigo-strong)" id="b-age">${esc(fmtAge(S.days))}</div></div>`) + `
    <section class="card">${ageSlider('age', t('ageSelected'), S.days)}</section>
    <div class="grid2">
      <section class="card stack"><div id="b-fig" style="display:flex;flex-direction:column;align-items:center;gap:8px;max-width:260px;margin:0 auto;width:100%"></div><div class="chips" id="b-chips" role="group" aria-label="${esc(t('bodyTitle'))}"></div></section>
      <section class="card detail" id="b-detail" aria-live="polite"></section>
    </div>
    <section class="card"><div class="head"><div><h2>${esc(t('compositionTitle'))}</h2><div class="small muted">${esc(t('compositionCaption'))}</div></div>
      <button class="btn" type="button" id="b-table">${esc(S.showTable ? t('chartView') : t('tableView'))}</button></div>
      <div class="legend" style="margin:10px 0">${['tbw', 'ecw', 'muscle'].map((k, i) => `<span><span class="sw s${i + 1}"></span>${esc(t(['seriesTbw', 'seriesEcw', 'seriesMuscle'][i]))}</span>`).join('')}</div>
      <div class="chart" id="b-chart"></div><div class="scroll" id="b-tablewrap"></div></section>`;
  },
  bind() {
    bindAge('age', 'days', () => this.update());
    $('#b-table').addEventListener('click', () => { S.showTable = !S.showTable; $('#b-table').textContent = S.showTable ? t('chartView') : t('tableView'); this.update(); });
  },
  update() {
    const d = S.days, id = S.trait;
    document.querySelector('main h1').textContent = `${t('traits.' + id)} · ${fmtAge(d)}`;
    $('#b-age').textContent = fmtAge(d);
    $('#b-fig').innerHTML = figureSVG(d, false, id) + `<p class="small muted" style="margin:0">${esc(t('bodyHint'))}</p>`;
    bindHotspots((x) => { S.trait = x; S.preset = null; syncUrl(); this.update(); });
    $('#b-chips').innerHTML = M.TRAITS.map((x) => {
      const st = M.trait(x, d).state;
      const adultLike = st === 'adult' || st === 'closed';
      return `<button type="button" data-t="${x}" aria-pressed="${x === id}" class="${adultLike && x !== id ? 'adult' : ''}">${esc(t('traits.' + x))}</button>`;
    }).join('');
    document.querySelectorAll('#b-chips button').forEach((b) => b.addEventListener('click', () => { S.trait = b.dataset.t; S.preset = null; syncUrl(); this.update(); }));
    $('#b-detail').innerHTML = `<div class="lbl">${esc(t('whatHappens'))}</div><p style="font-size:17px;line-height:26px">${esc(traitSentence(id, d))}</p>
      <div class="lbl">${esc(t('timeline'))}</div><p style="margin-bottom:8px">${esc(t('traitWhen.' + id))}</p>${traitBar(id, d)}
      <div class="lbl">${esc(t('inAdult'))}</div><p>${esc(t('traitAdult.' + id))}</p>
      <div class="row"><span class="tag">${esc(t('periods.' + M.periodOf(d).key))}</span>${['superficie', 'cabeza', 'metabolismo', 'musculo', 'agua'].includes(id) ? `<span class="tag warn">${esc(t('modelTag'))}</span>` : ''}</div>`;
    const ya = getLang() === 'en' ? ' y' : ' a';
    const ticks = [[0, '0'], [28, '28 d'], [YEAR, '1' + ya], [5 * YEAR, '5' + ya], [12 * YEAR, '12' + ya], [M.MAX_DAYS, '18' + ya]];
    const chart = $('#b-chart'), tw = $('#b-tablewrap');
    chart.hidden = S.showTable; tw.hidden = !S.showTable;
    if (!S.showTable) {
      drawComposition(chart, { days: d, title: t('compositionTitle'), ticks, names: { tbw: t('seriesTbw'), ecw: t('seriesEcw'), muscle: t('seriesMuscle') }, fmtAge, fmtPct: (v) => fmt(v) + ' %' });
    } else {
      const ages = [0, 28, 6 * MONTH, YEAR, 2 * YEAR, 5 * YEAR, 10 * YEAR, 15 * YEAR, M.MAX_DAYS];
      tw.innerHTML = `<table class="data"><thead><tr><th>${esc(t('age'))}</th><th>${esc(t('seriesTbw'))}</th><th>${esc(t('seriesEcw'))}</th><th>${esc(t('seriesMuscle'))}</th></tr></thead><tbody>${ages.map((a) => `<tr><td>${esc(fmtAge(a))}</td><td class="mono">${fmt(M.totalWater(a))} %</td><td class="mono">${fmt(M.extracellularWater(a))} %</td><td class="mono">${fmt(M.musclePct(a))} %</td></tr>`).join('')}</tbody></table>`;
    }
  },
};

function gauge(range, adultRange, max, probe) {
  const p = (v) => ((v / max) * 100).toFixed(1) + '%';
  return `<div class="gauge" aria-hidden="true">
    <div class="band adult" style="left:${p(adultRange[0])};width:calc(${p(adultRange[1])} - ${p(adultRange[0])})"></div>
    <div class="band" style="left:${p(range[0])};width:calc(${p(range[1])} - ${p(range[0])})"></div>
    ${probe != null ? `<div class="probe" style="left:${p(Math.min(max, probe))}"></div>` : ''}</div>`;
}

views.vitals = {
  build() {
    return head(t('vitalsTitle'), t('vitalsH'), `<span class="tag mint" id="v-wtag"></span>`) + `
    <section class="card"><div class="grid2" style="gap:28px">
      <div>${ageSlider('vage', t('age'), S.days, true)}</div>
      <div>${linSlider('vw', t('weight'), S.weight, 1, 90, 0.5, fmt(S.weight, S.weight % 1 ? 1 : 0) + ' kg', [1, 20, 40, 60, 90])}<p class="small muted" style="margin:10px 0 0" id="v-wnote"></p></div>
    </div><p class="small muted" style="margin:12px 0 0">${esc(t('vitalsHint'))}</p></section>
    <section class="card"><div class="vt" id="v-table"></div></section>
    <section class="card"><h2>${esc(t('probe'))}</h2><div class="probe-row">
      <div>${linSlider('phr', t('probeHr'), S.hrProbe, 0, 240, 1, S.hrProbe + ' ' + t('bpm'), [0, 60, 120, 180, 240])}<div id="phr-g"></div></div>
      <div>${linSlider('prr', t('probeRr'), S.rrProbe, 0, 80, 1, S.rrProbe + ' ' + t('rpm'), [0, 20, 40, 60, 80])}<div id="prr-g"></div></div>
    </div><div class="legend small" style="margin-top:12px"><span><span class="sw" style="height:10px;width:18px;background:var(--indigo-soft);border:1px solid var(--indigo)"></span>${esc(t('gaugeChild'))}</span><span><span class="sw" style="height:10px;width:18px;border:1px dashed var(--muted)"></span>${esc(t('gaugeAdult'))}</span></div><p class="small muted" style="margin:8px 0 0">${esc(t('vitalsSource'))}</p></section>`;
  },
  bind() {
    bindAge('vage', 'days', () => {
      const w = $('#vw');
      w.value = S.weight; w.style.setProperty('--fill', ((S.weight - 1) / 89) * 100 + '%');
      $('#vw-v').textContent = fmt(S.weight, S.weight % 1 ? 1 : 0) + ' kg';
      this.update();
    });
    bindLin('vw', (v) => { S.weight = v; S.weightTouched = true; this.update(); return fmt(v, v % 1 ? 1 : 0) + ' kg'; });
    bindLin('phr', (v) => { S.hrProbe = v; this.update(); return v + ' ' + t('bpm'); });
    bindLin('prr', (v) => { S.rrProbe = v; this.update(); return v + ' ' + t('rpm'); });
  },
  update() {
    const d = S.days, kg = S.weight;
    const v = M.vitals(d);
    const ad = M.ADULT_VITALS;
    const unusual = M.weightCheck(d, kg) === 'unusual';
    const tag = $('#v-wtag');
    tag.className = 'tag ' + (unusual ? 'warn' : 'mint');
    tag.textContent = unusual ? t('weightUnusual') : t('status.normal');
    $('#v-wnote').textContent = t('weightTypical', { w: fmt(M.typicalWeight(d), 1) });
    const bv = M.bloodVolume(d, kg), tv = M.tidalVolume(kg);
    const tr = (id) => M.trait(id, d);
    const rows = [
      [t('rowHr'), `<span class="mono big">${v.hr.join('-')}</span> ${t('bpm')}${gauge(v.hr, ad.hr, 240)}`, `<span class="mono">${ad.hr.join('-')}</span> ${t('bpm')}`],
      [t('rowRr'), `<span class="mono big">${v.rr.join('-')}</span> ${t('rpm')}${gauge(v.rr, ad.rr, 80)}`, `<span class="mono">${ad.rr.join('-')}</span> ${t('rpm')}`],
      [t('rowCo'), esc(t('coChild')), esc(t('coAdult'))],
      [t('rowBlood'), `<span class="mono big">${fmt(bv)} ${t('mL')}</span> <span class="muted mono small">${esc(t('perKg', { v: M.bloodVolumePerKg(d), kg: fmt(kg, kg % 1 ? 1 : 0) }))}</span>`, `<span class="mono">${fmt(M.ADULT_BLOOD_PER_KG * 70)} ${t('mL')}</span> <span class="muted small">(70 kg)</span>`],
      [t('rowTidal'), `<span class="mono big">${fmt(tv[0])}-${fmt(tv[1])} ${t('mL')}</span> <span class="muted mono small">${esc(t('tidalPerKg', { kg: fmt(kg, kg % 1 ? 1 : 0) }))}</span>`, `<span class="mono">420-560 ${t('mL')}</span> <span class="muted small">(70 kg)</span>`],
      [t('rowMuscle'), esc(t('pctWeight', { v: fmt(tr('musculo').pct) })), esc(t('pctWeight', { v: 40 }))],
      [t('rowWater'), esc(traitSentence('agua', d)), esc(t('traitAdult.agua'))],
      [t('rowKidney'), esc(traitSentence('rinon', d)), esc(t('traitAdult.rinon'))],
      [t('rowDiaphragm'), esc(traitSentence('diafragma', d)), esc(t('traitAdult.diafragma'))],
    ];
    $('#v-table').innerHTML = `<div class="r h lbl"><span>${esc(t('param'))}</span><span style="color:var(--indigo-strong)">${esc(t('childCol', { age: fmtAge(d), kg: fmt(kg, kg % 1 ? 1 : 0) }))}</span><span>${esc(t('adultCol'))}</span></div>` +
      rows.map(([a, b, c]) => `<div class="r"><b>${esc(a)}</b><span>${b}</span><span class="muted">${c}</span></div>`).join('');
    const hs = M.classify(S.hrProbe, v.hr), rs = M.classify(S.rrProbe, v.rr);
    $('#phr-g').innerHTML = gauge(v.hr, ad.hr, 240, S.hrProbe) + `<span class="status ${hs}">${esc(t('status.' + hs))}</span> <span class="small muted mono">(${v.hr.join('-')})</span>`;
    $('#prr-g').innerHTML = gauge(v.rr, ad.rr, 80, S.rrProbe) + `<span class="status ${rs}">${esc(t('status.' + rs))}</span> <span class="small muted mono">(${v.rr.join('-')})</span>`;
  },
};

const INPUT_KEYS = ['liveBirths', 'fetalDeaths', 'deaths0to6d', 'deaths7to27d', 'deaths28dTo1y', 'deaths1to4y', 'deaths5to14y', 'population5to14'];
views.mortality = {
  build() {
    return head(t('mortTitle'), t('mortH'), `<span class="tag">${esc(t('perMille'))}</span>`) + `
    <section class="card"><div class="tl" id="m-tl"></div><div class="ratelist" id="m-list" style="margin-top:14px"></div></section>
    <div class="grid3">
      <section class="card stack"><div class="lbl">${esc(t('yourData'))}</div>
        <div class="seg" role="group" id="m-cohort">${['meets', 'fails', 'custom'].map((c) => `<button type="button" data-c="${c}" aria-pressed="${S.cohort === c}">${esc(t('cohorts.' + c))}</button>`).join('')}</div>
        <p class="small muted" style="margin:0" id="m-fict">${esc(t('fictional'))}</p>
        <div class="inputs">${INPUT_KEYS.map((k) => `<label>${esc(t('inputs.' + k))}<input inputmode="numeric" id="in-${k}" value="${esc(S.counts[k])}"></label>`).join('')}
        <label>${esc(t('threshold'))}<select id="m-th" style="padding:7px 10px;border:1px solid var(--line-strong);border-radius:8px;background:var(--raised);min-height:36px"><option value="22"${S.threshold === 22 ? ' selected' : ''}>${esc(t('threshold22'))}</option><option value="28"${S.threshold === 28 ? ' selected' : ''}>${esc(t('threshold28'))}</option></select></label></div>
      </section>
      <section class="card stack" id="m-sel" aria-live="polite"></section>
      <section class="card stack sdg" id="m-sdg"></section>
    </div>`;
  },
  bind() {
    document.querySelectorAll('#m-cohort button').forEach((b) => b.addEventListener('click', () => {
      S.cohort = b.dataset.c;
      if (S.cohort !== 'custom') S.counts = { ...M.COHORTS[S.cohort] };
      INPUT_KEYS.forEach((k) => { $('#in-' + k).value = S.counts[k]; });
      document.querySelectorAll('#m-cohort button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.c === S.cohort)));
      S.preset = null; syncUrl(); this.update();
    }));
    INPUT_KEYS.forEach((k) => $('#in-' + k).addEventListener('input', (e) => {
      const n = Number(String(e.target.value).replace(/[^\d]/g, ''));
      S.counts[k] = Number.isFinite(n) ? n : 0;
      S.cohort = 'custom';
      document.querySelectorAll('#m-cohort button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.c === 'custom')));
      S.preset = null; syncUrl(); this.update();
    }));
    $('#m-th').addEventListener('change', (e) => { S.threshold = +e.target.value; this.update(); });
    this.ro = new ResizeObserver(() => this.drawTl());
    this.ro.observe($('#m-tl'));
  },
  drawTl() {
    const r = M.rates(S.counts);
    const narrow = $('#m-tl').clientWidth < 560;
    const L = STRINGS[getLang()];
    const labels = { ...(narrow ? L.axisShort : L.axis), gest: S.threshold + (narrow ? ' s' : ' ' + (getLang() === 'en' ? 'wk' : 'sem')) };
    drawTimeline($('#m-tl'), { title: t('mortH'), rates: r, selected: S.rate, labels, name: (k) => t('rateShort.' + k), value: (k) => rateVal(r[k]), onSelect: (k) => { S.rate = k; S.preset = null; syncUrl(); this.update(); } });
  },
  update() {
    const r = M.rates(S.counts);
    this.drawTl();
    $('#m-fict').hidden = S.cohort === 'custom';
    $('#m-list').innerHTML = M.RATE_KEYS.map((k) => `<button type="button" data-r="${k}" aria-pressed="${S.rate === k}">${esc(t('rateNames.' + k))}<span class="mono">${esc(rateVal(r[k]))}</span></button>`).join('');
    document.querySelectorAll('#m-list button').forEach((b) => b.addEventListener('click', () => { S.rate = b.dataset.r; S.preset = null; syncUrl(); this.update(); }));
    const k = S.rate;
    const note = STRINGS[getLang()].rateNotes[k];
    $('#m-sel').innerHTML = `<div class="lbl">${esc(t('selectedRate'))}</div><h2 style="font:600 24px/30px var(--display)">${esc(t('rateNames.' + k))}</h2>
      <div class="formula">${esc(t('rateNum.' + k))}<br><span class="den">÷ ${esc(t('denominators.' + M.RATE_DENOMINATOR[k]))}</span> × 1000</div>
      <div class="bigval">${esc(rateVal(r[k]))}</div>${note ? `<p class="small muted" style="margin:0">${esc(note)}</p>` : ''}`;
    const st = M.sdgStatus(r);
    const bar = (key) => {
      const target = M.SDG_TARGETS[key], v = r[key], max = Math.max(target * 2.5, v || 0);
      const s = st[key];
      return `<div><div class="row" style="justify-content:space-between"><b>${esc(t('rateNames.' + key))}</b>${s == null ? '' : `<span class="tag ${s ? 'mint' : 'warn'}">${esc(s ? t('sdgMet') : t('sdgNotMet'))}</span>`}</div>
        <div class="bar" role="img" aria-label="${esc(rateVal(v) + ', ' + t('sdgTarget', { v: target }))}"><div class="fill" style="width:${v == null ? 0 : Math.min(100, (v / max) * 100)}%"></div><div class="goal" style="left:${(target / max) * 100}%"></div></div>
        <div class="row small" style="justify-content:space-between"><span class="mono">${esc(rateVal(v))}</span><span class="muted mono">${esc(t('sdgTarget', { v: target }))}</span></div></div>`;
    };
    $('#m-sdg').innerHTML = `<div class="lbl">${esc(t('sdgTitle'))}</div>${bar('neonatal')}${bar('menores5')}<p class="small muted" style="margin:0">${esc(t('sdgUnit'))}</p>`;
  },
};

function rowText(id, side, days) {
  const row = M.compare(days, days).find((r) => r.id === id);
  if (id === 'period') return t('periods.' + row.a);
  if (id === 'hr' || id === 'rr') return row.a;
  if (id === 'mortality') { const ks = M.ratesAtAge(days); return ks.length ? ks.map((k) => t('rateShort.' + k)).join(', ') : '—'; }
  if (id === 'morbidity') return t('morbidity.' + row.a);
  return traitSentence(id, days);
}
views.compare = {
  build() {
    return head(t('compareTitle'), '', `<span class="tag mint" id="c-count"></span>`) + `
    <section class="card"><div class="grid2" style="gap:28px"><div>${ageSlider('ca', t('ageA'), S.days, true)}</div><div>${ageSlider('cb', t('ageB'), S.daysB, true)}</div></div>
      <label class="row small" style="margin-top:14px"><input type="checkbox" id="c-only" ${S.onlyDiff ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--indigo)"> ${esc(t('onlyDiff'))}</label></section>
    <section class="card"><div class="cmp" id="c-table"></div></section>`;
  },
  bind() {
    bindAge('ca', 'days', () => this.update());
    bindAge('cb', 'daysB', () => this.update());
    $('#c-only').addEventListener('change', (e) => { S.onlyDiff = e.target.checked; this.update(); });
  },
  update() {
    const rows = M.compare(S.days, S.daysB);
    const n = rows.filter((r) => r.differs).length;
    document.querySelector('main h1').textContent = t('compareH', { a: fmtAge(S.days), b: fmtAge(S.daysB) });
    $('#c-count').textContent = t('diffCount', { n, total: rows.length });
    const label = (id) => STRINGS[getLang()].rowLabels[id] || t('traits.' + id);
    $('#c-table').innerHTML = `<div class="r h lbl"><span>${esc(t('aspect'))}</span><span>A · ${esc(fmtAge(S.days))}</span><span>B · ${esc(fmtAge(S.daysB))}</span><span></span></div>` +
      rows.map((r) => `<div class="r${r.differs && S.onlyDiff ? ' diff' : ''}"><b>${esc(label(r.id))}</b><span>${esc(rowText(r.id, 'a', S.days))}</span><span>${esc(rowText(r.id, 'b', S.daysB))}</span>${r.differs ? `<span class="tag solid">${esc(t('changes'))}</span>` : `<span class="small muted">${esc(t('same'))}</span>`}</div>`).join('');
  },
};

function optText(q, key) {
  if (q.prompt === 'qPeriod') return t('periods.' + key);
  if (q.prompt === 'qDenominator') return t('denominators.' + key);
  if (q.prompt === 'qWindow') return t('rateNames.' + key);
  return t('opt.' + key);
}
function promptText(q) {
  const p = q.params || {};
  return t('q.' + q.prompt, {
    age: p.days != null ? fmtAge(p.days) : '', rate: p.rate ? lcFirst(t('rateNames.' + p.rate)) : '',
    window: p.window ? t('qWindows.' + p.window) : '', hr: p.hr, rr: p.rr, group: p.group ? t('qGroups.' + p.group) : '',
  });
}
function newQuiz(seed) {
  S.quiz = { seed, session: M.quizSession(seed, 12), i: 0, answers: [] };
}
views.quiz = {
  build() {
    if (!S.quiz) newQuiz(1);
    return head(t('quizTitle'), '', `<span class="tag" id="q-block"></span>`) + `
    <div class="grid2"><section class="card stack" id="q-card" aria-live="polite"></section><section class="card stack prog" id="q-prog"></section></div>`;
  },
  bind() {},
  update() {
    const Q = S.quiz, q = Q.session[Q.i];
    const done = Q.i >= Q.session.length;
    const sc = M.score(Q.session, Q.answers);
    $('#q-prog').innerHTML = `<div class="lbl">${esc(t('quizScore'))}</div>` + M.QUIZ_BLOCKS.map((b) => {
      const { right, total } = sc[b];
      const answered = Q.session.slice(0, Q.answers.length).filter((x) => x.block === b).length;
      return `<div><div class="row" style="justify-content:space-between"><b class="small">${esc(t('blocks.' + b))}</b><span class="mono small">${right}/${total}</span></div><div class="bar"><div style="width:${total ? (right / total) * 100 : 0}%"></div></div><span class="sr">${answered}</span></div>`;
    }).join('') + `<p class="small muted" style="margin:auto 0 0">${esc(t('quizHint'))}</p>`;
    if (done) {
      const right = Q.session.filter((x, i) => Q.answers[i] === x.correct).length;
      document.querySelector('main h1').textContent = t('quizTitle');
      $('#q-block').textContent = '';
      $('#q-card').innerHTML = `<h2 style="font:600 24px/30px var(--display)">${esc(t('quizDone', { r: right, n: Q.session.length }))}</h2><button class="btn primary" id="q-restart" type="button">${esc(t('quizRestart'))}</button>`;
      $('#q-restart').addEventListener('click', () => { newQuiz((Q.seed * 7 + 3) % 9973 || 1); this.update(); });
      return;
    }
    const answered = Q.answers.length > Q.i;
    document.querySelector('main h1').textContent = promptText(q);
    $('#q-block').textContent = t('blocks.' + q.block) + ' · ' + t('quizProgress', { i: Q.i + 1, n: Q.session.length });
    const letters = 'ABCD';
    let html = `<div class="opts">${q.options.map((o, i) => {
      let cls = '';
      if (answered && i === q.correct) cls = 'right';
      else if (answered && i === Q.answers[Q.i]) cls = 'wrong';
      return `<button type="button" data-i="${i}" class="${cls}" ${answered ? 'disabled' : ''}><span class="k">${letters[i]}</span>${esc(optText(q, o))}</button>`;
    }).join('')}</div>`;
    if (answered) {
      const ok = Q.answers[Q.i] === q.correct;
      html += `<div class="feedback"><b>${esc(ok ? t('quizRight') : t('quizWrong'))}</b> ${esc(t('quizAnswer', { a: optText(q, q.options[q.correct]) }))}</div>
      <div class="row"><button class="btn" type="button" id="q-see">${esc(t('quizSeeAtlas'))}</button><button class="btn primary" type="button" id="q-next" style="margin-left:auto">${esc(Q.i + 1 >= Q.session.length ? t('quizFinish') : t('quizNext'))}</button></div>`;
    }
    $('#q-card').innerHTML = html;
    document.querySelectorAll('.opts button').forEach((b) => b.addEventListener('click', () => {
      Q.answers[Q.i] = +b.dataset.i;
      const f = q.focus;
      if (f.days != null) S.days = f.days;
      if (f.trait) S.trait = f.trait;
      if (f.rate) S.rate = f.rate;
      this.update();
      $('#q-next')?.focus();
    }));
    $('#q-next')?.addEventListener('click', () => { Q.i++; this.update(); });
    $('#q-see')?.addEventListener('click', () => go(q.focus.view));
  },
};

// ---------------------------------------------------------------------------
// Shell, routing, URL
function renderShell() {
  document.documentElement.lang = getLang();
  document.title = t('appTitle');
  $('#topic').textContent = t('brandTopic');
  $('#tabs').innerHTML = VIEWS.map((v) => `<button type="button" data-v="${v}"${S.view === v ? ' aria-current="page"' : ''}>${esc(t('nav.' + v))}</button>`).join('');
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => go(b.dataset.v)));
  $('#lang').setAttribute('aria-label', t('langLabel'));
  $('#lang').innerHTML = ['es', 'en'].map((l) => `<button type="button" data-l="${l}" aria-pressed="${getLang() === l}" lang="${l}">${l.toUpperCase()}</button>`).join('');
  document.querySelectorAll('#lang button').forEach((b) => b.addEventListener('click', () => changeLang(b.dataset.l)));
  $('#footer').innerHTML = `<span>${esc(t('footer'))}</span><span>Simulario · MIT</span>`;
}
function render() {
  renderShell();
  const v = views[S.view];
  if (views.mortality.ro) { views.mortality.ro.disconnect(); views.mortality.ro = null; }
  $('#app').innerHTML = v.build();
  v.bind();
  v.update();
  $('#preset').addEventListener('change', (e) => { if (e.target.value) applyPreset(e.target.value); });
  $('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareUrl()); $('#copied').textContent = t('copied'); }
    catch { $('#copied').textContent = shareUrl(); }
  });
}
function go(view) {
  if (!VIEWS.includes(view)) return;
  S.view = view;
  S.preset = null;
  syncUrl();
  render();
  window.scrollTo({ top: 0 });
}
function applyPreset(key) {
  const p = M.PRESETS[key];
  if (!p) return;
  S.view = p.view;
  if (p.days != null) { S.days = p.days; S.weight = p.weight ?? Math.round(M.typicalWeight(p.days) * 2) / 2; S.weightTouched = p.weight != null; }
  if (p.daysB != null) S.daysB = p.daysB;
  if (p.trait) S.trait = p.trait;
  if (p.cohort) { S.cohort = p.cohort; S.counts = { ...M.COHORTS[p.cohort] }; }
  if (p.rate) S.rate = p.rate;
  if (p.view === 'quiz') newQuiz(1);
  S.adult = false;
  S.preset = key;
  syncUrl();
  render();
}
function shareUrl() {
  const u = new URL(location.href);
  u.search = '';
  if (S.preset) u.searchParams.set('preset', S.preset); else u.searchParams.set('view', S.view);
  u.searchParams.set('lang', getLang());
  return u.toString();
}
function syncUrl() {
  try { history.replaceState(null, '', shareUrl()); } catch { /* sandboxed */ }
}
function changeLang(l) {
  setLang(l);
  try { localStorage.setItem('lang', l); } catch { /* storage unavailable */ }
  syncUrl();
  render();
}

function init() {
  const params = new URLSearchParams(location.search);
  let lang = params.get('lang');
  if (!lang) { try { lang = localStorage.getItem('lang'); } catch { /* */ } }
  if (!lang) lang = (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  setLang(lang === 'en' ? 'en' : 'es');
  const preset = params.get('preset');
  const view = params.get('view');
  if (preset && M.PRESETS[preset]) { applyPreset(preset); return; }
  if (view && VIEWS.includes(view)) S.view = view;
  render();
}

window.__sim = { S, M, render, go, applyPreset, changeLang, fmtAge };
init();
