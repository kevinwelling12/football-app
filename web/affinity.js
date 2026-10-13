// Affinity v3 (2026-10-13): learned from Kevin's "which would you rather support?" picks.
//
// Each club gets a raw score = trait part + its own adjustment:
//   trait part  = weights x features: ten researched 0-10 traits and nearness (these can only pull a club toward you),
//                 state ownership, a racism or fan-culture record, rival of one of your clubs (these can only push away).
//   adjustment  = what your picks say about this club beyond its traits (kept small until a club has several picks).
// League familiarity (you pick clubs you know more often) is fitted too, so it doesn't leak into the traits, but it is
// left out of Affinity: knowing a league isn't liking a club.
// Fit: regularised logistic regression on the picks, P(pick A over B) = logistic(raw A - raw B), from a neutral prior.
// Affinity = 100 x logistic(raw - the median club's raw): the chance you'd pick the club over a typical one.
// 500 picks, 10-fold: 77.8% predicted (v2 with "ownership below 3" and "inclusion below 3": 74.4%).

export const TRAITS = ['terrace', 'rituals', 'city', 'ground', 'conscience', 'voice', 'stewardship', 'women', 'geography', 'contender', 'intensity'];
export const FLAGS = ['stateOwner', 'incidents', 'rival'];
export const FAMILIAR = ['lg_bl', 'lg_ucl', 'lg_mls', 'lg_nwsl', 'lg_usl']; // relative to the Premier League
export const FEATURES = [...TRAITS, ...FLAGS, ...FAMILIAR];
export const LABEL = { terrace: 'Iconic singing end', rituals: 'Rituals and tifo', city: "The city's club", ground: 'Great home ground',
  conscience: 'Inclusive fan culture', voice: 'Fans have a say', stewardship: 'Run for the club', women: "Women's side",
  geography: 'Near Sacramento', contender: 'Contender', intensity: 'High-energy football',
  stateOwner: 'State ownership', incidents: 'Racism or fan-culture record', rival: 'Rival of your club',
  lg_bl: 'Bundesliga', lg_ucl: 'Other Champions League', lg_mls: 'MLS', lg_nwsl: 'NWSL', lg_usl: 'USL' };
// how to say a shortfall (a trait below the typical club's, costing Affinity) or a flag that applies
export const SHORT = { terrace: 'no famous singing end', rituals: 'few rituals', city: "not the city's main club", ground: 'an ordinary ground',
  conscience: 'little inclusion work', voice: 'fans have little say', stewardship: 'run as a business', women: 'no strong women\'s side',
  geography: 'far away', contender: 'rarely contends', intensity: 'a cautious style',
  stateOwner: 'state-owned', incidents: 'racism or fan-culture record', rival: 'rival' };
// starting weights (per full 0-10 range of a trait, or per flag) before any picks
const PRIOR = { terrace: 0.3, rituals: 0.3, city: 0.3, ground: 0.3, conscience: 0.4, voice: 0.3, stewardship: 0.4, women: 0.1,
  geography: 0.3, contender: 0, intensity: 0.3, stateOwner: -2, incidents: -1, rival: -1, lg_bl: 0, lg_ucl: 0, lg_mls: 0, lg_nwsl: 0, lg_usl: 0 };
const STATE = /\bstate\b|PIF|Qatar|Abu Dhabi|Saudi|sovereign/i;
const NOTHING = /nothing (notable|found)|estimate/i;

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
// State ownership is read from the ownership note; a racism or fan-culture record = inclusion below 3 where the research
// found something (a low score that only means "nothing notable" doesn't count).
export function features(id, c, ctx) {
  c = withGeo(c);
  const lg = ctx.league[id];
  return [...TRAITS.map(t => (c[t] ?? 0) / 10),
    STATE.test(c.why?.stewardship || '') ? 1 : 0,
    (c.conscience ?? 5) < 3 && !NOTHING.test(c.why?.conscience || '') ? 1 : 0,
    ctx.rivals.has(id) ? 1 : 0,
    ...FAMILIAR.map(f => (lg === f.slice(3) ? 1 : 0))];
}

const sig = z => 1 / (1 + Math.exp(-z));
const PULL = FEATURES.map(f => TRAITS.includes(f)), PUSH = FEATURES.map(f => FLAGS.includes(f)), FAM = FEATURES.map(f => FAMILIAR.includes(f));

// Shared engine (clubs and players): regularised logistic regression on "which would you rather" picks.
// X: {id: feature vector}; spec: {names, pull, push, fam (bool arrays), flags (names never shown as a plus), prior (array)}.
// Pull weights stay >= 0, push weights <= 0; fam (familiarity) is fitted but left out of the score.
export function fitPairs(X, spec, picks, { lambda = 1, lambdaItem = 2, iters = 1200 } = {}) {
  const ids = Object.keys(X), names = spec.names;
  const b0 = spec.prior.slice(), beta = b0.slice(), u = Object.fromEntries(ids.map(id => [id, 0]));
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
    for (let j = 0; j < beta.length; j++) {
      beta[j] -= 0.3 * g[j] / n;
      // a trait can only pull you toward a club or player; flags only push away
      if (spec.pull[j]) beta[j] = Math.max(0, beta[j]); else if (spec.push[j]) beta[j] = Math.min(0, beta[j]);
    }
    for (const id in gu) u[id] -= 0.3 * (gu[id] + lambdaItem * u[id]) / n;
  }
  const FAMj = spec.fam;
  // familiarity is fitted but not part of Affinity
  const traitPart = id => X[id].reduce((s, v, j) => s + (FAMj[j] ? 0 : v * beta[j]), 0);
  const raw = Object.fromEntries(ids.map(id => [id, traitPart(id) + u[id]]));
  const sorted = Object.values(raw).sort((a, b) => a - b), mid = sorted[sorted.length >> 1] ?? 0;
  const mean = names.map((_, j) => ids.reduce((s, id) => s + X[id][j], 0) / ids.length);
  return {
    beta: Object.fromEntries(names.map((f, j) => [f, beta[j]])), u, raw, n: used.length,
    affinity: id => (raw[id] == null ? null : 100 * sig(raw[id] - mid)),
    // P(you'd pull for a over b), from Affinity alone
    prefer: (a, b) => sig(raw[a] - raw[b]),
    // P(you'd pick a over b in the quiz): Affinity plus familiarity (what the fit predicts; used to test it)
    predict: (a, b) => sig(raw[a] - raw[b] + X[a].reduce((s, v, j) => s + (FAMj[j] ? (v - X[b][j]) * beta[j] : 0), 0)),
    // biggest reasons above and below a typical one
    reasons(id) {
      if (!X[id]) return { good: [], bad: [], picks: 0 };
      const parts = names.map((f, j) => [f, FAMj[j] ? 0 : beta[j] * (X[id][j] - mean[j])]).filter(([, v]) => Math.abs(v) > 0.08);
      // the absence of a red flag isn't a reason to like someone, so flags only appear as minuses
      return { good: parts.filter(p => p[1] > 0 && !spec.flags.includes(p[0])).sort((a, b) => b[1] - a[1]).slice(0, 3).map(p => p[0]),
        bad: parts.filter(p => p[1] < 0 && !(spec.plusOnly || []).includes(p[0])).sort((a, b) => a[1] - b[1]).slice(0, 2).map(p => p[0]), picks: u[id] };
    },
  };
}

const CLUB_SPEC = { names: FEATURES, pull: PULL, push: PUSH, fam: FAM, flags: FLAGS, prior: FEATURES.map(f => PRIOR[f]) };
// traits: {id: {...}}; picks: [{a, b, win}] (win null = can't say). Returns the fitted model.
export function fit(traits, ctx, picks, opts = {}) {
  const X = Object.fromEntries(Object.keys(traits).map(id => [id, features(id, traits[id], ctx)]));
  return fitPairs(X, CLUB_SPEC, picks, { lambdaItem: opts.lambdaClub ?? 2, ...opts });
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
    const close = 1 - Math.abs(model.predict(a, b) - 0.5) * 2; // 1 = a coin flip for the model
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
