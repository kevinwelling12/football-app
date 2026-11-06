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

// comeback and punch since 2026-11-06 (research/story/BRIEF.md): Kevin's pull toward Villa, Brighton, Columbus, Vancouver
// lean since 2026-11-07 (research/politics/BRIEF.md): the club's and its supporters' political culture, 0 right to 10 left
export const TRAITS = ['terrace', 'rituals', 'city', 'ground', 'conscience', 'voice', 'stewardship', 'women', 'geography', 'contender', 'intensity', 'comeback', 'punch', 'lean'];
// feeder (2026-11-07, Kevin: "the ownership situations in NY are the bigger drag"): a club named for its corporate
// owner or run as a secondary club in a multi-club group (Red Bull, City Football Group's satellites, BlueCo's
// Strasbourg); set by hand in traits.json
// manufactured (2026-11-07, Kevin): took another city's club (Houston: "stealing a team"), or a franchise added to a
// city that already had one ("an unnecessary second club"); set by hand in traits.json
export const FLAGS = ['stateOwner', 'incidents', 'rival', 'feeder', 'manufactured'];
// love: a club in a city Kevin loves (ctx.love, a Set of ids; app.js LOVE_CITIES). Not researched, so not in TRAITS.
export const PERSONAL = ['love'];
export const FAMILIAR = ['lg_bl', 'lg_ucl', 'lg_mls', 'lg_nwsl', 'lg_usl', 'lg_esp', 'lg_ita', 'lg_fra', 'lg_eng2', 'lg_mex', 'lg_uel', 'lg_uecl']; // relative to the Premier League
// Glory and fame (Kevin, 2026-11-06: "not just popular clubs", no glory hunting): winning (the contender trait) and
// being a big club (its Elo standing in its league) are fitted like league familiarity, so picks of famous, winning
// clubs are explained by fame and success, and neither counts toward Affinity.
export const GLORY = ['contender', 'fame'];
export const FEATURES = [...TRAITS, ...PERSONAL, ...FLAGS, ...FAMILIAR, 'fame'];
export const LABEL = { terrace: 'Iconic singing end', rituals: 'Rituals and tifo', city: "The city's club", ground: 'Great home ground',
  conscience: 'Inclusive fan culture', voice: 'Fans have a say', stewardship: 'Run for the club', women: "Women's side",
  geography: 'Near Sacramento', contender: 'Contender', fame: 'Big club', comeback: 'Comeback story', punch: 'Punches above its weight', lean: 'Left-leaning culture', intensity: 'High-energy football',
  stateOwner: 'State ownership', incidents: 'Racism or fan-culture record', rival: 'Rival of your club', feeder: 'Feeder or brand club', manufactured: 'Moved or manufactured franchise', love: 'A city you love',
  lg_bl: 'Bundesliga', lg_ucl: 'Other Champions League', lg_mls: 'MLS', lg_nwsl: 'NWSL', lg_usl: 'USL',
  lg_esp: 'La Liga', lg_ita: 'Serie A', lg_fra: 'Ligue 1', lg_eng2: 'Championship', lg_mex: 'Liga MX',
  lg_uel: 'Other Europa League', lg_uecl: 'Other Conference League' };
// how to say a shortfall (a trait below the typical club's, costing Affinity) or a flag that applies
export const SHORT = { terrace: 'no famous singing end', rituals: 'few rituals', city: "not the city's main club", ground: 'an ordinary ground',
  conscience: 'little inclusion work', voice: 'fans have little say', stewardship: 'run as a business', women: 'no strong women\'s side',
  geography: 'far away', contender: 'rarely contends', comeback: 'no comeback story', punch: 'does what its money says', lean: 'a right-leaning culture', intensity: 'a cautious style',
  stateOwner: 'state-owned', incidents: 'racism or fan-culture record', rival: 'rival', feeder: 'a feeder or brand club', manufactured: 'a moved or manufactured franchise', love: 'a city you love' };
// starting weights (per full 0-10 range of a trait, or per flag) before any picks
const PRIOR = { terrace: 0.3, rituals: 0.3, city: 0.3, ground: 0.3, conscience: 0.4, voice: 0.3, stewardship: 0.4, women: 0.1,
  geography: 0.3, contender: 0, intensity: 0.3, stateOwner: -2, incidents: -1, rival: -1, lg_bl: 0, lg_ucl: 0, lg_mls: 0, lg_nwsl: 0, lg_usl: 0,
  lg_esp: 0, lg_ita: 0, lg_fra: 0, lg_eng2: 0, lg_mex: 0, lg_uel: 0, lg_uecl: 0, fame: 0 };
// State ownership: an explicit flag in traits.json (majority owner is a state or sovereign fund). Word-matching the owner note
// caught sponsors (Atlético's Saudi airline), state grants (Sabah) and negations ("not state").
const isState = c => (c.state != null ? !!c.state : /\bstate\b|PIF|Qatar|Abu Dhabi|Saudi|sovereign/i.test(c.why?.stewardship || ''));
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

// ctx: {league: {id: key}, rivals: Set of ids}. A club's league is its domestic one where we have it (Real Madrid: La Liga);
// 'ucl', 'uel', 'uecl' only for clubs in the UEFA cups from leagues the app doesn't show (Benfica, Celtic).
// State ownership is read from the ownership note; a racism or fan-culture record = inclusion below 3 where the research
// found something (a low score that only means "nothing notable" doesn't count).
export function features(id, c, ctx) {
  c = withGeo(c);
  const lg = ctx.league[id];
  return [...TRAITS.map(t => (c[t] ?? (t === 'lean' ? 5 : 0)) / 10), // lean unknown = no clear politics (5), not far right
    ctx.love?.has(id) ? 1 : 0,
    isState(c) ? 1 : 0,
    (c.conscience ?? 5) < 3 && !NOTHING.test(c.why?.conscience || '') ? 1 : 0,
    ctx.rivals.has(id) ? 1 : 0,
    c.feeder ? 1 : 0,
    c.manufactured ? 1 : 0,
    ...FAMILIAR.map(f => (lg === f.slice(3) ? 1 : 0)),
    ctx.standing?.[id] ?? 0.5];
}

const sig = z => 1 / (1 + Math.exp(-z));
const PULL = FEATURES.map(f => TRAITS.includes(f)), PUSH = FEATURES.map(f => FLAGS.includes(f)), FAM = FEATURES.map(f => FAMILIAR.includes(f) || GLORY.includes(f));

// Shared engine (clubs and players): regularised logistic regression on "which would you rather" picks.
// X: {id: feature vector}; spec: {names, pull, push, fam (bool arrays), flags (names never shown as a plus), prior (array)}.
// Pull weights stay >= 0, push weights <= 0; fam (familiarity) is fitted but left out of the score.
export function fitPairs(X, spec, picks, { lambda = 1, lambdaItem = 2, iters = 1200 } = {}) {
  const ids = Object.keys(X), names = spec.names;
  const b0 = spec.prior.slice(), beta = b0.slice(), u = Object.fromEntries(ids.map(id => [id, 0]));
  // a pick counts fully; "no strong opinion" (win '=') counts as half a pick each way, which pulls the two together
  const used = [];
  for (const p of picks) {
    if (!X[p.a] || !X[p.b]) continue;
    if (p.win === p.a || p.win === p.b) used.push({ w: p.win, l: p.win === p.a ? p.b : p.a, k: 1 });
    else if (p.win === '=') used.push({ w: p.a, l: p.b, k: 0.5 }, { w: p.b, l: p.a, k: 0.5 });
  }
  const n = Math.max(1, Math.sqrt(used.length));
  for (let it = 0; it < (used.length ? iters : 0); it++) {
    const g = beta.map((b, j) => lambda * (b - b0[j])), gu = {};
    for (const p of used) {
      const xw = X[p.w], xl = X[p.l]; let z = u[p.w] - u[p.l];
      for (let j = 0; j < beta.length; j++) z += beta[j] * (xw[j] - xl[j]);
      const e = (1 - sig(z)) * p.k;
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
  // familiarity is fitted but not part of Affinity; a negOnly feature counts only when its weight came out negative
  // (contender: an underdog lean is liking, a pull toward winners is glory hunting)
  const FAMj = spec.fam.map((f, j) => f && !(spec.negOnly?.[j] && beta[j] < 0));
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
      // a trait you've turned out to dislike (negative weight) is a reason against the clubs that have it ('+trait'),
      // and lacking it isn't a strength worth naming
      const neg = j => spec.free && beta[names.indexOf(j)] < 0 && !spec.flags.includes(j);
      return { good: parts.filter(p => p[1] > 0 && !spec.flags.includes(p[0]) && !neg(p[0])).sort((a, b) => b[1] - a[1]).slice(0, 3).map(p => p[0]),
        bad: parts.filter(p => p[1] < 0 && !(spec.plusOnly || []).includes(p[0])).sort((a, b) => a[1] - b[1]).slice(0, 2).map(p => (neg(p[0]) ? '+' + p[0] : p[0])), picks: u[id] };
    },
  };
}

// Kevin, 2026-11-06: nothing pre-established. Every weight starts at 0 and may go either way, so what a trait is worth,
// and in which direction, comes from his picks alone (PRIOR, PULL and PUSH are kept for reference and the players).
const CLUB_SPEC = { names: FEATURES, pull: FEATURES.map(() => false), push: FEATURES.map(() => false), fam: FAM, flags: FLAGS, prior: FEATURES.map(() => 0), free: true, negOnly: FEATURES.map(f => f === 'contender'), plusOnly: ['love'] };
// Answers (win): a club's id = that one; '=' = no strong opinion; '?<id>' = not familiar enough with that club, '??' =
// with either (2026-11-06); null = can't say (before then). Clubs he doesn't know yet go on a list to look into and
// aren't asked about until he says he knows them (ctx.known: {id: time}).
export const isUnsure = w => typeof w === 'string' && w[0] === '?';
export function unknownClubs(picks, known = {}) {
  const last = {};
  for (const p of picks) if (isUnsure(p.win)) for (const id of p.win === '??' ? [p.a, p.b] : [p.win.slice(1)]) last[id] = Math.max(last[id] || 0, p.t || 0);
  return Object.entries(last).filter(([id, t]) => !(known[id] > t)).sort((x, y) => y[1] - x[1]).map(([id]) => id);
}
// traits: {id: {...}}; picks: [{a, b, win}]. Returns the fitted model.
export function fit(traits, ctx, picks, opts = {}) {
  const X = Object.fromEntries(Object.keys(traits).map(id => [id, features(id, traits[id], ctx)]));
  return fitPairs(X, CLUB_SPEC, picks, { lambdaItem: opts.lambdaClub ?? 2, ...opts });
}

// Next pair to ask about: usually two clubs from the same league. Prefers clubs you're likely to know (big clubs,
// leagues you answer for), and pairs the model finds close; skips clubs you've passed on twice, your own clubs, repeats.
const KNOWN = { epl: 1, bl: 0.9, mls: 0.9, nwsl: 0.9, ucl: 0.5, usl: 0.5, esp: 0.4, ita: 0.4, fra: 0.4, eng2: 0.4, mex: 0.4, uel: 0.4, uecl: 0.4 };
// Pairs to settle the top of the list (Kevin, 2026-10-14): his ten favourite clubs overall in a round robin (since
// 2026-11-06 without his own clubs, which Affinity leaves out). Unasked ones only, closest first.
export function focusPairs(model, ids, ctx, picks, favs) {
  const asked = new Set(picks.map(p => [p.a, p.b].sort().join('|')));
  const score = id => model.affinity(id) ?? -1;
  const unknown = new Set(unknownClubs(picks, ctx.known));
  const top = [...ids].filter(id => !favs.has(id) && !unknown.has(id)).sort((a, b) => score(b) - score(a)).slice(0, 10);
  const out = new Map();
  const add = (a, b) => { const k = [a, b].sort().join('|'); if (a !== b && !asked.has(k)) out.set(k, [a, b]); };
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) add(top[i], top[j]);
  return [...out.values()].sort((x, y) => Math.abs(model.predict(x[0], x[1]) - 0.5) - Math.abs(model.predict(y[0], y[1]) - 0.5));
}

export function nextPair(model, ids, ctx, picks, favs, rnd = Math.random) {
  const asked = new Set(picks.map(p => [p.a, p.b].sort().join('|')));
  // a club he doesn't know (yet) counts as a skip for itself only, not for the club it was paired with
  const unsureOf = (p, id) => !p.win || p.win === '??' || p.win === '?' + id;
  const seen = {}, skips = {};
  for (const p of picks) for (const id of [p.a, p.b]) { seen[id] = (seen[id] || 0) + 1; if (unsureOf(p, id)) skips[id] = (skips[id] || 0) + 1; }
  // answer rate per league, starting from KNOWN and moved by his answers and skips
  const ln = {}, ls = {};
  for (const p of picks) for (const id of [p.a, p.b]) { const l = ctx.league[id]; ln[l] = (ln[l] || 0) + 1; if (unsureOf(p, id)) ls[l] = (ls[l] || 0) + 1; }
  const rate = l => ((ln[l] || 0) - (ls[l] || 0) + 8 * (KNOWN[l] ?? 0.5)) / ((ln[l] || 0) + 8); // a few "don't know"s move it
  const unknown = new Set(unknownClubs(picks, ctx.known));
  const pool = ids.filter(id => !favs.has(id) && !unknown.has(id) && (skips[id] || 0) < 2 + (ctx.known?.[id] ? 2 : 0));
  // big clubs first: the top of a league by Elo counts fully, the bottom a fifth (UCL visitors from smaller leagues
  // sit low in the Champions League file)
  // Variety (Kevin, 2026-11-06: "lots of repeats"): a club from the last ten pairs is rested, and each time a club has
  // been asked costs it a quarter of its weight, so the quiz moves through the clubs instead of circling the big ones.
  const recent = new Set(picks.slice().sort((x, y) => (y.t || 0) - (x.t || 0)).slice(0, 10).flatMap(p => [p.a, p.b]));
  const weight = id => (rate(ctx.league[id]) * (0.5 + 0.5 * (ctx.standing?.[id] ?? 0.5))) ** 2 * (skips[id] ? 0.3 : 1) / (1 + (seen[id] || 0) / 4) * (recent.has(id) ? 0.02 : 1);
  // Mostly within a league (Kevin, 2026-10-13: a USL club against a Bundesliga club is hard to call). Same-league picks
  // teach the trait weights without league differences in the way, and the weights then apply across leagues.
  const byLeague = {};
  for (const id of pool) (byLeague[ctx.league[id]] ||= []).push(id);
  const same = rnd() < 0.85;
  // draw a pair in proportion to its score (always taking the best one asked about the same few clubs every time)
  const cand = []; let tot = 0;
  for (let n = 0; n < 1500; n++) {
    const a = pool[(rnd() * pool.length) | 0], from = same ? byLeague[ctx.league[a]] || pool : pool;
    const b = from[(rnd() * from.length) | 0];
    if (!a || a === b || asked.has([a, b].sort().join('|'))) continue;
    const close = 1 - Math.abs(model.predict(a, b) - 0.5) * 2; // 1 = a coin flip for the model
    const s = weight(a) * weight(b) * (0.4 + close);
    cand.push([s, a, b]); tot += s;
  }
  if (!cand.length) return null;
  let x = rnd() * tot;
  for (const [s, a, b] of cand) { x -= s; if (x <= 0) return [a, b]; }
  return cand.at(-1).slice(1);
}

// Three short facts for the quiz card, from the research notes.
export function facts(c) {
  const cut = s => (s && s.length > 90 ? s.slice(0, 88).replace(/[ ,;:]+\S*$/, '') + '…' : s || '');
  return [['Owners', cut(c.why?.stewardship)], ['Fans', cut(c.why?.terrace)], ['Style', cut(c.why?.intensity)]].filter(f => f[1]);
}
