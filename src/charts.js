// Dependency-free SVG charts. Each draw function reads the container width,
// so call it again on resize.
import { daysToPos, YEAR, MAX_DAYS, totalWater, extracellularWater, musclePct, RATE_WINDOWS } from './model.js';

const NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------------------
// Mortality timeline: brackets for each rate over a non-linear age axis.
const AXIS = [
  ['gest', 0.03], ['birth', 0.24], ['d7', 0.33], ['d28', 0.43], ['y1', 0.58], ['y5', 0.78], ['y15', 0.98],
];
const AX = Object.fromEntries(AXIS);
function xOf(v) {
  if (v === 'gest') return AX.gest;
  if (v <= 0) return AX.birth;
  if (v <= 7) return AX.birth + ((AX.d7 - AX.birth) * v) / 7;
  if (v <= 28) return AX.d7 + ((AX.d28 - AX.d7) * (v - 7)) / 21;
  if (v <= YEAR) return AX.d28 + ((AX.y1 - AX.d28) * (v - 28)) / (YEAR - 28);
  if (v <= 5 * YEAR) return AX.y1 + ((AX.y5 - AX.y1) * (v - YEAR)) / (4 * YEAR);
  return AX.y5 + ((AX.y15 - AX.y5) * (v - 5 * YEAR)) / (10 * YEAR);
}
// Row of each bracket, from the axis upwards.
const ROWS = {
  fetal: 0, neonatalPrecoz: 0, neonatalTardia: 0, postneonatal: 0, de5a14: 0,
  perinatal: 1, neonatal: 2, infantil: 3, menores5: 4,
};

/**
 * opts: { rates, selected, labels: {gest,...}, name(k), value(k), onSelect(k) }
 */
export function drawTimeline(host, opts) {
  const W = Math.max(320, host.clientWidth);
  const narrow = W < 560;
  const rowH = narrow ? 34 : 40;
  const top = 4;
  const axisY = top + rowH * 5 + 10;
  const H = axisY + 42;
  const pad = 8;
  const X = (f) => pad + f * (W - 2 * pad);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="${esc(opts.title)}">`;
  s += `<line x1="${X(0)}" y1="${axisY}" x2="${X(1)}" y2="${axisY}" class="tl-axis"/>`;
  for (const [k, f] of AXIS) {
    const x = X(f);
    s += `<line x1="${x}" y1="${axisY - 6}" x2="${x}" y2="${axisY + 6}" class="tl-axis"/>`;
    const anchor = f < 0.05 ? 'start' : f > 0.95 ? 'end' : 'middle';
    if (!(narrow && k === 'd7')) s += `<text x="${x}" y="${axisY + 24}" text-anchor="${anchor}" class="tl-tick${k === 'birth' ? ' tl-strong' : ''}">${esc(opts.labels[k])}</text>`;
  }
  for (const k of Object.keys(ROWS)) {
    const w = RATE_WINDOWS[k];
    const x1 = X(xOf(w.from)) + 2;
    const x2 = X(xOf(w.to)) - 2;
    const y = axisY - 14 - ROWS[k] * rowH;
    const sel = opts.selected === k;
    const val = opts.value(k);
    const label = (x2 - x1 > 120 ? opts.name(k) + ' · ' : x2 - x1 > 50 ? '' : '') + val;
    const short = x2 - x1 < 50;
    s += `<g class="tl-br${sel ? ' sel' : ''}" data-rate="${k}" tabindex="0" role="button" aria-pressed="${sel}" aria-label="${esc(opts.name(k) + ': ' + val)}">`;
    s += `<rect x="${x1 - 2}" y="${y - rowH + 10}" width="${x2 - x1 + 4}" height="${rowH}" class="tl-hit"/>`;
    s += `<path d="M${x1} ${y + 8} V${y} H${x2} V${y + 8}" class="tl-path"/>`;
    s += `<text x="${(x1 + x2) / 2}" y="${y - 6}" text-anchor="middle" class="tl-label">${esc(short ? '' : label)}</text>`;
    s += `<title>${esc(opts.name(k) + ' · ' + val)}</title></g>`;
  }
  s += '</svg>';
  host.innerHTML = s;
  host.querySelectorAll('.tl-br').forEach((g) => {
    const go = () => opts.onSelect(g.dataset.rate);
    g.addEventListener('click', go);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

// ---------------------------------------------------------------------------
// Body composition: three lines (% of body weight) over the same age scale as
// the slider, with a marker at the chosen age and a hover crosshair.
const SERIES = [
  { key: 'tbw', fn: totalWater, cls: 's1' },
  { key: 'ecw', fn: extracellularWater, cls: 's2' },
  { key: 'muscle', fn: musclePct, cls: 's3' },
];
export const COMPOSITION_SERIES = SERIES;

/** opts: { days, names: {tbw,ecw,muscle}, ticks: [[days,label],...], fmtAge(d), fmtPct(v), title } */
export function drawComposition(host, opts) {
  const W = Math.max(300, host.clientWidth);
  const H = 240;
  const m = { l: 36, r: W < 520 ? 12 : 128, t: 12, b: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const x = (d) => m.l + daysToPos(d) * iw;
  const y = (v) => m.t + ih - (v / 80) * ih;
  const samples = [];
  for (let i = 0; i <= 200; i++) samples.push((MAX_DAYS * i) / 200);
  // denser near birth
  const pts = Array.from(new Set([0, 7, 14, 28, 60, 91, 182, 273, 365, 547, 730, ...samples])).sort((a, b) => a - b);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.title)}">`;
  for (const v of [0, 20, 40, 60, 80]) {
    s += `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`;
    s += `<text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${v}</text>`;
  }
  for (const [d, lab] of opts.ticks) {
    if (W < 520 && /d|28/.test(String(lab)) && d > 0) continue;
    s += `<text x="${x(d)}" y="${H - 8}" text-anchor="middle" class="tick">${esc(lab)}</text>`;
  }
  for (const sr of SERIES) {
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)} ${y(sr.fn(p)).toFixed(1)}`).join(' ');
    s += `<path d="${d}" class="line ${sr.cls}"/>`;
    if (W >= 520) {
      const end = sr.fn(MAX_DAYS);
      const dy = sr.key === 'ecw' ? 4 : sr.key === 'muscle' ? 4 : 4;
      s += `<text x="${m.l + iw + 8}" y="${y(end) + dy}" class="dlabel">${esc(opts.names[sr.key])}</text>`;
    }
  }
  const cx = x(opts.days);
  s += `<line x1="${cx}" x2="${cx}" y1="${m.t}" y2="${m.t + ih}" class="marker"/>`;
  for (const sr of SERIES) s += `<circle cx="${cx}" cy="${y(sr.fn(opts.days))}" r="5" class="dot ${sr.cls}"/>`;
  s += `<line class="xhair" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" visibility="hidden"/>`;
  s += `<rect class="hover" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
  s += '</svg><div class="tip" hidden></div>';
  host.innerHTML = s;
  const svg = host.querySelector('svg');
  const tip = host.querySelector('.tip');
  const xh = host.querySelector('.xhair');
  const rect = host.querySelector('.hover');
  const inv = (px) => {
    // invert x → days by bisection on daysToPos
    const f = Math.min(1, Math.max(0, (px - m.l) / iw));
    let lo = 0, hi = MAX_DAYS;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (daysToPos(mid) < f) lo = mid; else hi = mid; }
    return lo;
  };
  rect.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const d = inv(px);
    xh.setAttribute('x1', px); xh.setAttribute('x2', px); xh.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.innerHTML = `<b>${esc(opts.fmtAge(d))}</b>` + SERIES.map((sr) => `<div><span class="sw ${sr.cls}"></span>${esc(opts.names[sr.key])}: ${esc(opts.fmtPct(sr.fn(d)))}</div>`).join('');
    const left = Math.min(r.width - 170, Math.max(0, e.clientX - r.left + 12));
    tip.style.left = left + 'px';
    tip.style.top = '8px';
  });
  rect.addEventListener('pointerleave', () => { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); });
}
