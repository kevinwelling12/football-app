// Affinity v2 (2026-10-13): learned from Kevin's "which would you rather support?" picks.
//
// Each club gets a raw score = trait part + its own adjustment:
//   trait part  = weights x features: ten researched 0-10 traits, nearness (log distance), two dealbreakers (ownership
//                 below 3: state, fund or similar; inclusion below 3: racism record), US club, rival of one of your clubs.
//   adjustment  = what your picks say about this club beyond its traits (kept small until a club has several picks).
// Weights and adjustments are fitted together (regularised logistic regression on the picks: P(pick A over B) =
// logistic(raw A - raw B)), starting from a neutral prior so a new user isn't empty.
// Affinity = 100 x logistic(raw - the median club's raw): the chance you'd pick the club over a typical one.

export const TRAITS = ['terrace', 'rituals', 'city', 'ground', 'conscience', 'voice', 'stewardship', 'women', 'geography', 'contender', 'intensity'];
export const FEATURES = [...TRAITS, 'badOwner', 'badInclusion', 'usClub', 'rival'];
export const LABEL = { terrace: 'Iconic singing end', rituals: 'Rituals and tifo', city: "The city's club", ground: 'Great home ground',
  conscience: 'Inclusive fan culture', voice: 'Fans have a say', stewardship: 'Run for the club', women: "Women's side",
  geography: 'Near Sacramento', contender: 'Contender', intensity: 'High-energy football',
  badOwner: 'State or fund ownership', badInclusion: 'Racism record', usClub: 'US club', rival: 'Rival of your club' };
// starting weights (per full 0-10 range of a trait, or per flag) before any picks
const PRIOR = { terrace: 0.3, rituals: 0.3, city: 0.3, ground: 0.3, conscience: 0.4, voice: 0.3, stewardship: 0.4, women: 0.1,
  geography: 0.3, contender: 0, intensity: 0.3, badOwner: -2, badInclusion: -1.5, usClub: 0, rival: -1 };
const US = new Set(['mls', 'nwsl', 'usl']);

const HOME = [38.58, -121.49];
function km(a, b) {
  const r = x => x * Math.PI / 180, dl = r(b[0] - a[0]), dn = r(b[1] - a[1]);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dn / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
// Log scale (Kevin, 2026-10-13): each tenfold increase in distance costs the same. 10 within 50 km, 0 at 20,000 km.
const D_MIN = 50, D_MAX = 20000;
export function geography(ll) {
  if (!ll) return 0;
  const d = Math.max(D_MIN, km(HOME, ll));
  return Math.max(0, 10 * Math.log(D_MAX / d) / Math.log(D_MAX / D_MIN));
}
export const withGeo = c => (c.geography != null ? c : { ...c, geography: geography(c.ll) });

// ctx: {league: {id: key}, rivals: Set of ids}
export function features(id, c, ctx) {
  c = withGeo(c);
  return [...TRAITS.map(t => (c[t] ?? 0) / 10), Math.max(0, 3 - (c.stewardship ?? 5)) / 3, Math.max(0, 3 - (c.conscience ?? 5)) / 3,
    US.has(ctx.league[id]) ? 1 : 0, ctx.rivals.has(id) ? 1 : 0];
}

const sig = z => 1 / (1 + Math.exp(-z));
const GEO = FEATURES.indexOf('geography'), FLAGS = new Set(['badOwner', 'badInclusion', 'rival', 'usClub']);

// traits: {id: {...}}; picks: [{a, b, win}] (win null = can't say). Returns the fitted model.
export function fit(traits, ctx, picks, { lambda = 1, lambdaClub = 2, iters = 1200 } = {}) {
  const ids = Object.keys(traits), X = Object.fromEntries(ids.map(id => [id, features(id, traits[id], ctx)]));
  const b0 = FEATURES.map(f => PRIOR[f]), beta = b0.slice(), u = Object.fromEntries(ids.map(id => [id, 0]));
  const used = picks.filter(p => X[p.a] && X[p.b] && (p.win === p.a || p.win === p.b)).map(p => ({ w: p.win, l: p.win === p.a ? p.b : p.a }));
  const n = Math.max(1, Math.sqrt(used.length));
  for (let it = 0; it < (used.length ? iters : 0); it++) {
    const g = beta.map((b, j) => lambda * (b - b0[j])), gu = {};
    for (const p of used) {
      const xw = X[p.w], xl = X[p.l]; let z = u[p.w] - u[p.l];
      for (let j = 0; j < beta.length; j++) z += beta[j] * (xw[j] - xl[j]);
      const e = 1 - sig(z);
      for (let j = 0; j < beta.length; j++) g[j] -= e * (xw[j] - xl[j]);
      gu[p.w] = (gu[p.w] || 0) - e; gu[p.l] = (gu[p.l] || 0) + e;
    }
    for (let j = 0; j < beta.length; j++) beta[j] -= 0.3 * g[j] / n;
    beta[GEO] = Math.max(0, beta[GEO]); // nearness can only help (Kevin, 2026-10-13); dislikes nearby go through rivals
    for (const id in gu) u[id] -= 0.3 * (gu[id] + lambdaClub * u[id]) / n;
  }
  const traitPart = id => X[id].reduce((s, v, j) => s + v * beta[j], 0);
  const raw = Object.fromEntries(ids.map(id => [id, traitPart(id) + u[id]]));
  const sorted = Object.values(raw).sort((a, b) => a - b), mid = sorted[sorted.length >> 1] ?? 0;
  const mean = FEATURES.map((_, j) => ids.reduce((s, id) => s + X[id][j], 0) / ids.length);
  return {
    beta: Object.fromEntries(FEATURES.map((f, j) => [f, beta[j]])), u, raw, n: used.length,
    affinity: id => (raw[id] == null ? null : 100 * sig(raw[id] - mid)),
    // P(you'd pull for a over b)
    prefer: (a, b) => sig(raw[a] - raw[b]),
    // biggest reasons above and below a typical club
    reasons(id) {
      if (!X[id]) return { good: [], bad: [], picks: 0 };
      const parts = FEATURES.map((f, j) => [f, beta[j] * (X[id][j] - mean[j])]).filter(([, v]) => Math.abs(v) > 0.08);
      // the absence of a red flag isn't a reason to like a club, so flags only appear as minuses
      return { good: parts.filter(p => p[1] > 0 && !FLAGS.has(p[0])).sort((a, b) => b[1] - a[1]).slice(0, 3).map(p => p[0]),
        bad: parts.filter(p => p[1] < 0).sort((a, b) => a[1] - b[1]).slice(0, 2).map(p => p[0]), picks: u[id] };
    },
  };
}

// Next pair to ask about. Prefers clubs you're likely to know (top divisions, Champions League regulars), clubs with
// few answers so far, and pairs the model finds close; skips clubs you've passed on twice, your own clubs, repeats.
const KNOWN = { epl: 1, bl: 0.9, mls: 0.9, nwsl: 0.9, ucl: 0.6, usl: 0.5 };
export function nextPair(model, ids, ctx, picks, favs, rnd = Math.random) {
  const asked = new Set(picks.map(p => [p.a, p.b].sort().join('|')));
  const seen = {}, skips = {};
  for (const p of picks) for (const id of [p.a, p.b]) { seen[id] = (seen[id] || 0) + 1; if (!p.win) skips[id] = (skips[id] || 0) + 1; }
  const pool = ids.filter(id => !favs.has(id) && (skips[id] || 0) < 2);
  const weight = id => (KNOWN[ctx.league[id]] ?? 0.5) / (1 + (seen[id] || 0) / 3);
  let best = null, bestS = -1;
  for (let n = 0; n < 500; n++) {
    const a = pool[(rnd() * pool.length) | 0], b = pool[(rnd() * pool.length) | 0];
    if (!a || a === b || asked.has([a, b].sort().join('|'))) continue;
    const close = 1 - Math.abs(model.prefer(a, b) - 0.5) * 2; // 1 = a coin flip for the model
    const s = weight(a) * weight(b) * (0.4 + close) * (0.7 + 0.3 * rnd());
    if (s > bestS) { bestS = s; best = [a, b]; }
  }
  return best;
}

// Three short facts for the quiz card, from the research notes.
export function facts(c) {
  const cut = s => (s && s.length > 90 ? s.slice(0, 88).replace(/[ ,;:]+\S*$/, '') + '…' : s || '');
  return [['Owners', cut(c.why?.stewardship)], ['Fans', cut(c.why?.terrace)], ['Style', cut(c.why?.intensity)]].filter(f => f[1]);
}
