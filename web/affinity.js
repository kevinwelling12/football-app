// Affinity: how much a club is your kind of club, 0-100.
//
// 1. Reference: on each trait, your clubs' typical level (median of the five); for nearness, home itself (10).
// 2. Prior weights: each factor starts at a set share; within it, traits your clubs are strong on AND agree on count
//    most (mean / 10 x agreement).
// 3. Score: falling short of the reference costs, by the trait's weight; matching or beating it costs nothing.
//    Affinity = 100 x (1 - shortfall / the shortfall of a club with nothing at all).
// 4. Calibration: your "which would you rather support?" picks re-weight the traits (logistic fit, pulled toward
//    the prior so a handful of answers can't swing it wildly).
// Traits are researched 0-10 scores (data/affinity/traits.json, with one line of evidence each) plus distance from home.

// share = starting weight of each factor (Kevin chose all four, 2026-10-13); within a factor, traits your clubs share
// count most. Your picks then move both.
export const GROUPS = [
  { key: 'culture', label: 'Supporter culture', share: 0.35, traits: ['terrace', 'rituals', 'city', 'ground'] },
  { key: 'values', label: 'Values and ownership', share: 0.30, traits: ['conscience', 'voice', 'stewardship', 'women'] },
  { key: 'near', label: 'Near Sacramento', share: 0.15, traits: ['geography'] },
  { key: 'play', label: 'Winning and style', share: 0.20, traits: ['contender', 'intensity'] },
];
export const TRAITS = GROUPS.flatMap(g => g.traits);
export const LABEL = { terrace: 'Iconic singing end', rituals: 'Rituals and tifo', city: "The city's club", ground: 'Great home ground',
  conscience: 'Inclusive fan culture', voice: 'Fans have a say', stewardship: 'Run for the club', women: "Women's side",
  geography: 'Near Sacramento', contender: 'Contender', intensity: 'High-energy football' };

const HOME = [38.58, -121.49];
function km(a, b) {
  const r = x => x * Math.PI / 180, dl = r(b[0] - a[0]), dn = r(b[1] - a[1]);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dn / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
// Log scale (Kevin, 2026-10-13): each tenfold increase in distance costs the same. 10 within 50 km of Sacramento,
// 0 at 20,000 km (the far side of the world). Bay Area ~8.5, Portland ~5.4, East Coast ~3.5, England/Germany ~1.5.
const D_MIN = 50, D_MAX = 20000;
export function geography(ll) {
  if (!ll) return 0;
  const d = Math.max(D_MIN, km(HOME, ll));
  return Math.max(0, 10 * Math.log(D_MAX / d) / Math.log(D_MAX / D_MIN));
}

const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length); };

// traits: {espnId: {terrace.., ll}}; favIds: your clubs (any that have traits)
export function prior(traits, favIds) {
  const favs = favIds.map(id => traits[id]).filter(Boolean).map(withGeo);
  const ref = {}, w0 = {};
  for (const t of TRAITS) {
    const v = favs.map(f => f[t] ?? 0);
    // nearness is "the closer the better", not "as close as your clubs": its reference is home itself
    ref[t] = t === 'geography' ? 10 : v.length ? median(v) : 5;
    const agree = Math.max(0.2, 1 - (v.length ? sd(v) : 5) / 5);
    w0[t] = Math.max(0.02, (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 5) / 10 * agree);
  }
  for (const g of GROUPS) { const tot = g.traits.reduce((s, t) => s + w0[t], 0); for (const t of g.traits) w0[t] = g.share * w0[t] / tot; }
  return { ref, w0 };
}
export const withGeo = c => (c.geography != null ? c : { ...c, geography: geography(c.ll) });

export function score(c, ref, w) {
  c = withGeo(c);
  let short = 0, max = 0;
  for (const t of TRAITS) { short += w[t] * Math.max(0, ref[t] - (c[t] ?? 0)) / 10; max += w[t] * ref[t] / 10; }
  return max ? 100 * (1 - short / max) : 50;
}

// What lifts a club and what holds it back, by weighted effect.
export function reasons(c, ref, w) {
  c = withGeo(c);
  const pos = [], neg = [];
  for (const t of TRAITS) {
    const gap = ((c[t] ?? 0) - ref[t]) / 10;
    if ((c[t] ?? 0) >= Math.max(7, ref[t])) pos.push([t, w[t] * (c[t] ?? 0)]);
    if (gap < -0.15) neg.push([t, w[t] * -gap]);
  }
  return { good: pos.sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]), short: neg.sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]) };
}

// Fit weights to picks [{a, b, win}] (ids; win = a or b). w = w0 x exp(theta), L2 pull on theta.
export function calibrate(traits, ref, w0, picks, { lambda = 1.5, k = 6, iters = 400, lr = 0.05 } = {}) {
  const used = picks.filter(p => traits[p.a] && traits[p.b] && (p.win === p.a || p.win === p.b));
  const theta = Object.fromEntries(TRAITS.map(t => [t, 0]));
  if (!used.length) return { w: { ...w0 }, n: 0 };
  const C = id => withGeo(traits[id]);
  const wOf = th => Object.fromEntries(TRAITS.map(t => [t, w0[t] * Math.exp(th[t])]));
  const loss = th => {
    const w = wOf(th); let L = 0;
    for (const p of used) {
      const d = (score(C(p.win), ref, w) - score(C(p.win === p.a ? p.b : p.a), ref, w)) / 100;
      L += Math.log1p(Math.exp(-k * d));
    }
    for (const t of TRAITS) L += lambda * theta2(th[t]);
    return L;
  };
  const theta2 = x => x * x;
  for (let it = 0; it < iters; it++) {
    const base = loss(theta), g = {};
    for (const t of TRAITS) { const h = 1e-3; theta[t] += h; g[t] = (loss(theta) - base) / h; theta[t] -= h; }
    for (const t of TRAITS) theta[t] = Math.max(-2.5, Math.min(2.5, theta[t] - lr * g[t]));
  }
  return { w: wOf(theta), n: used.length };
}

// Group weights as shares, for display.
export function groupShares(w) {
  const tot = TRAITS.reduce((s, t) => s + w[t], 0);
  return GROUPS.map(g => ({ ...g, share: g.traits.reduce((s, t) => s + w[t], 0) / tot }));
}

// Next pair to ask about: two clubs close in current Affinity but with different trait profiles; never your own
// clubs, never a pair already asked.
export function nextPair(traits, ids, aff, picks, favs, rnd = Math.random) {
  const asked = new Set(picks.map(p => [p.a, p.b].sort().join('|')));
  const pool = ids.filter(id => traits[id] && !favs.has(id));
  let best = null, bestS = -1;
  for (let n = 0; n < 400; n++) {
    const a = pool[(rnd() * pool.length) | 0], b = pool[(rnd() * pool.length) | 0];
    if (a === b || asked.has([a, b].sort().join('|'))) continue;
    const A = withGeo(traits[a]), B = withGeo(traits[b]);
    const diff = TRAITS.reduce((s, t) => s + Math.abs((A[t] ?? 0) - (B[t] ?? 0)), 0);
    const s = diff / (1 + Math.abs(aff[a] - aff[b]) / 6);
    if (s > bestS) { bestS = s; best = [a, b]; }
  }
  return best;
}
