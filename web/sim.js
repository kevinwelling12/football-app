// Season simulation: tables, finishing distributions, zone odds and post-season brackets.
// L = published league data (data/<key>.json) with the user's own results already applied (see prepare()).
import { matchGrid, liveGrid, grid, cdf, sample, rng, W } from './engine.js';

const DONE = new Set(['ft', 'aet', 'pen']);
export const isPlayed = m => m.hs != null && DONE.has(m.st);

// Apply the user's entries ({matchId: {hs, as, live, min, rc}}) on top of the published data. Returns a new matches array.
// live = ESPN scores fetched by the page ({matchId: {st, hs, as, min, rc}}); your own entries win over both.
export function prepare(L, entries = {}, live = {}) {
  return L.matches.map(m => {
    const e = entries[m.id];
    if (!e) { const v = live[m.id]; return v ? { ...m, ...v } : m; }
    if (e.live) return { ...m, st: 'live', hs: e.hs, as: e.as, min: e.min ?? 45, rc: e.rc || [0, 0], mine: true };
    return { ...m, st: e.st || 'ft', hs: e.hs, as: e.as, mine: true };
  });
}

export const regular = matches => matches.filter(m => !m.stage);

// ---------------------------------------------------------------- tables
export function blankRow(i) { return { i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, awayGf: 0, cp: 0, cpts: 0, form: [] }; }
// in-conference points per game (USL), scaled to fit a 1024 slot of the sort key
export const ppgKey = (cpts, cp) => (cp ? Math.round(cpts / cp * 341) : 0);
// conf: both clubs in the same conference (counts toward in-conference points per game)
export function addResult(T, m, hs = m.hs, as = m.as, conf = false) {
  const H = T[m.h], A = T[m.a];
  H.p++; A.p++;
  if (conf) { H.cp++; A.cp++; H.cpts += hs > as ? 3 : hs === as ? 1 : 0; A.cpts += as > hs ? 3 : hs === as ? 1 : 0; } H.gf += hs; H.ga += as; A.gf += as; A.ga += hs; A.awayGf += as; H.gd = H.gf - H.ga; A.gd = A.gf - A.ga;
  if (hs > as) { H.w++; A.l++; H.pts += 3; H.form.push('W'); A.form.push('L'); }
  else if (hs < as) { A.w++; H.l++; A.pts += 3; H.form.push('L'); A.form.push('W'); }
  else { H.d++; A.d++; H.pts++; A.pts++; H.form.push('D'); A.form.push('D'); }
}
const crit = (r, c) => (c === 'gd' ? r.gd + 512 : c === 'h2h' ? (r.h2h || 0) : c === 'cppg' ? ppgKey(r.cpts, r.cp) : r[c]);
// criterion by criterion (six criteria packed into one number would run past a double's 53 bits)
export const compareRows = (x, y, tb) => { for (const c of tb) { const d = crit(x, c) - crit(y, c); if (d) return d; } return 0; };
export const sameConf = (L, m) => L.teams[m.h].g != null && L.teams[m.h].g === L.teams[m.a].g;

// Head-to-head points and goal difference among clubs level on everything before 'h2h' in the tiebreak order
// (points, or points and goal difference). complete: only once every match between the tied clubs is played
// (La Liga, Serie A, Ligue 1); until then it is skipped and the next criterion decides.
function h2hKeys(rows, matches, tb, complete = false) {
  const before = tb.slice(0, tb.indexOf('h2h')), tieKey = r => before.map(c => r[c]).join('|');
  const ties = new Map(); for (const r of rows) { const k = tieKey(r); (ties.get(k) || ties.set(k, []).get(k)).push(r); }
  for (const r of rows) r.h2h = 0;
  for (const tied of ties.values()) {
    if (tied.length < 2) continue;
    const set = new Set(tied.map(r => r.i)), mini = new Map(tied.map(r => [r.i, { p: 0, gd: 0 }]));
    const mutual = matches.filter(m => m.st !== 'canc' && set.has(m.h) && set.has(m.a));
    if (complete && mutual.some(m => !isPlayed(m))) continue;
    for (const m of mutual) {
      if (!isPlayed(m)) continue;
      const H = mini.get(m.h), A = mini.get(m.a); H.gd += m.hs - m.as; A.gd += m.as - m.hs;
      if (m.hs > m.as) H.p += 3; else if (m.hs < m.as) A.p += 3; else { H.p++; A.p++; }
    }
    for (const r of tied) { const x = mini.get(r.i); r.h2h = x.p * 32 + Math.max(-15, Math.min(15, x.gd)) + 16; }
  }
}

export function standings(L, matches, rules) {
  const T = L.teams.map((_, i) => blankRow(i));
  const conf = rules.tiebreak.includes('cppg');
  for (const m of regular(matches)) if (isPlayed(m)) addResult(T, m, m.hs, m.as, conf && sameConf(L, m));
  for (const a of L.adjust || []) { T[a.i].pts += a.pts; T[a.i].adj = (T[a.i].adj || 0) + a.pts; }
  const groups = groupsOf(L, rules);
  if (rules.tiebreak.includes('h2h')) for (const g of groups) h2hKeys(g.idx.map(i => T[i]), regular(matches), rules.tiebreak, rules.h2hComplete);
  // level on everything: alphabetical by the name shown (UEFA's rule too, by abbreviated name; matters before a league
  // phase starts, when every club is level)
  const nm = i => L.teams[i].s || L.teams[i].n, byName = (x, y) => nm(x.i).localeCompare(nm(y.i));
  for (const g of groups) {
    const rows = g.idx.map(i => T[i]).sort((x, y) => compareRows(y, x, rules.tiebreak) || byName(x, y));
    rows.forEach((r, k) => { r.pos = k + 1; r.group = g.name; });
  }
  const all = [...T].sort((x, y) => compareRows(y, x, rules.tiebreak) || byName(x, y));
  all.forEach((r, k) => { r.opos = k + 1; if (!rules.groups) r.pos = k + 1; });
  return { rows: T, groups };
}

export function groupsOf(L, rules) {
  const ids = L.teams.map((_, i) => i).filter(i => L.teams[i].inLeague !== false);
  if (!rules.groups) return [{ name: '', idx: ids }];
  const names = [...new Set(ids.map(i => L.teams[i].g))].sort();
  return names.map(name => ({ name, idx: ids.filter(i => L.teams[i].g === name) }));
}

// ---------------------------------------------------------------- knockouts
// Expected goals between any two clubs (for brackets): base x attack x defence, neutral = average of home and away rates.
export function lam(L, h, a, neutral = false, base = L.base) {
  const [bh, ba] = neutral ? [(base[0] + base[1]) / 2, (base[0] + base[1]) / 2] : base;
  const H = L.teams[h], A = L.teams[a];
  return [bh * H.A * A.D, ba * A.A * H.D];
}
const gridCache = new Map();
function cachedCdf(L, h, a, neutral, base) {
  const k = `${L.key}|${h}|${a}|${neutral ? 1 : 0}|${base[0]}`;
  let c = gridCache.get(k);
  if (!c) { const [lh, la] = lam(L, h, a, neutral, base); c = cdf(grid(lh, la, L.P.rho, L.P.drawK)); gridCache.set(k, c); }
  return c;
}
const poisson = (r, l) => { let k = 0, p = Math.exp(-l), s = p; const u = r(); while (u > s && k < 15) { k++; p *= l / k; s += p; } return k; };
// One match that must have a winner: 90 minutes, then extra time (a third of a match), then penalties (coin flip).
export function koMatch(L, r, h, a, neutral = false, base = L.base, et = true) {
  const s = sample(cachedCdf(L, h, a, neutral, base), r()), hs = (s / W) | 0, as = s % W;
  if (hs !== as) return hs > as ? h : a;
  if (et) { const [lh, la] = lam(L, h, a, neutral, base); const eh = poisson(r, lh / 3), ea = poisson(r, la / 3); if (eh !== ea) return eh > ea ? h : a; }
  return r() < 0.5 ? h : a;
}
// Two legs, the better seed (b) at home second; away goals no longer count.
export function twoLegs(L, r, a, b, base) {
  const s1 = sample(cachedCdf(L, a, b, false, base), r()), s2 = sample(cachedCdf(L, b, a, false, base), r());
  const ga = ((s1 / W) | 0) + s2 % W, gb = s1 % W + ((s2 / W) | 0);
  if (ga !== gb) return ga > gb ? a : b;
  const [lh, la] = lam(L, b, a, false, base); const eb = poisson(r, lh / 3), ea = poisson(r, la / 3);
  if (eb !== ea) return eb > ea ? b : a;
  return r() < 0.5 ? a : b;
}
// Best of three with no draws (level after 90 = penalties): games at the better seed, the other, then the better seed.
function bestOf3(L, r, top, low) {
  let wt = 0, wl = 0; const homes = [top, low, top];
  for (let g = 0; g < 3 && wt < 2 && wl < 2; g++) {
    const h = homes[g], a = h === top ? low : top;
    const w = koMatch(L, r, h, a, false, L.base, false);
    if (w === top) wt++; else wl++;
  }
  return wt === 2 ? top : low;
}

// Actual results so far: winner of a decided tie between x and y in the post-season, if any.
function decidedWinner(L, matches, x, y) {
  const ms = matches.filter(m => m.stage && isPlayed(m) && ((m.h === x && m.a === y) || (m.h === y && m.a === x)));
  if (!ms.length) return null;
  const last = ms[ms.length - 1];
  if (last.series) {
    let wx = 0, wy = 0;
    for (const m of ms) { const w = m.so ? (m.so[0] > m.so[1] ? m.h : m.a) : m.hs > m.as ? m.h : m.hs < m.as ? m.a : null; if (w === x) wx++; else if (w === y) wy++; }
    return wx >= 2 ? x : wy >= 2 ? y : null;
  }
  if (last.leg === 1) return null;
  let gx = 0, gy = 0; for (const m of ms) { if (m.h === x) { gx += m.hs; gy += m.as; } else { gx += m.as; gy += m.hs; } }
  if (last.so) return (last.h === x) === (last.so[0] > last.so[1]) ? x : y;
  return gx > gy ? x : gy > gx ? y : null;
}

// Post-season brackets. seeds: per group, team indices in finishing order. pts: points (higher seed hosts finals).
// Returns {round: [team indices reaching it]} ending with 'champ'.
function bracket(type, L, r, seeds, pts, matches) {
  const play = (x, y, f) => decidedWinner(L, matches, x, y) ?? f(x, y);
  const host = (x, y) => (pts[x] >= pts[y] ? [x, y] : [y, x]);
  const single = (x, y, neutral = false) => play(x, y, () => { const [h, a] = host(x, y); return koMatch(L, r, h, a, neutral); });
  const out = {};
  const mark = (k, list) => { out[k] = list; };
  if (type === 'nwsl') {
    const s = seeds[0];
    const qf = [single(s[0], s[7]), single(s[3], s[4]), single(s[1], s[6]), single(s[2], s[5])];
    mark('sf', qf);
    const sf = [single(qf[0], qf[1]), single(qf[2], qf[3])]; mark('final', sf);
    mark('champ', [play(sf[0], sf[1], () => koMatch(L, r, sf[0], sf[1], true))]);
  } else if (type === 'usl') {
    const finals = [], semis = [], qfs = [];
    for (const s of seeds) {
      const qf = [single(s[0], s[7]), single(s[3], s[4]), single(s[1], s[6]), single(s[2], s[5])]; qfs.push(...qf);
      const sf = [single(qf[0], qf[1]), single(qf[2], qf[3])]; semis.push(...sf);
      finals.push(single(sf[0], sf[1]));
    }
    mark('csf', qfs); mark('cf', semis); mark('final', finals);
    mark('champ', [single(finals[0], finals[1])]);
  } else if (type === 'mls') {
    const finals = [], semis = [], r1 = [];
    for (const s of seeds) {
      const wc = single(s[7], s[8]);
      const ro = [play(s[0], wc, () => bestOf3(L, r, s[0], wc)), play(s[3], s[4], () => bestOf3(L, r, s[3], s[4])),
        play(s[1], s[6], () => bestOf3(L, r, s[1], s[6])), play(s[2], s[5], () => bestOf3(L, r, s[2], s[5]))];
      r1.push(s[0], s[1], s[2], s[3], s[4], s[5], s[6], wc);
      const sf = [single(ro[0], ro[1]), single(ro[2], ro[3])]; semis.push(...ro);
      finals.push(single(sf[0], sf[1])); out.cf = (out.cf || []).concat(sf);
    }
    mark('r1', r1); mark('csf', semis); mark('final', finals);
    mark('champ', [single(finals[0], finals[1])]);
  } else if (type === 'ucl') {
    // UEFA cups (Champions, Europa and Conference League share the format; only the league-phase match count differs,
    // and that is in the fixtures). seeds[0] = league phase order. Play-offs: 9/10 v 23/24, 11/12 v 21/22, 13/14 v 19/20, 15/16 v 17/18 (pair drawn at random).
    const s = seeds[0], pick2 = (a, b) => (r() < 0.5 ? [a, b] : [b, a]);
    const base = L.base;
    const po = [];
    for (const [hi, lo] of [[8, 22], [10, 20], [12, 18], [14, 16]]) {
      const [x1, x2] = pick2(s[hi], s[hi + 1]), [y1, y2] = pick2(s[lo], s[lo + 1]);
      po.push(play(y1, x1, () => twoLegs(L, r, y1, x1, base)), play(y2, x2, () => twoLegs(L, r, y2, x2, base)));
    }
    mark('r16', [...s.slice(0, 8), ...po]);
    // Round of 16: 1/2 v play-off winners from 15-18, 3/4 v 13/14 & 19/20, 5/6 v 11/12 & 21/22, 7/8 v 9/10 & 23/24.
    // The draw puts one club of each pair (and one of the two matching play-off winners) in each half of the bracket;
    // in a half the 1/2 tie meets the 7/8 tie in the quarter-finals and the 3/4 tie meets the 5/6 tie, so 1 and 2 can
    // only meet in the final. po: [9/10 v 23/24 (two ties), 11/12 v 21/22, 13/14 v 19/20, 15/16 v 17/18]
    const halves = [[], []];
    for (const [top, k] of [[0, 3], [6, 0], [2, 2], [4, 1]]) {
      const [a1, a2] = pick2(s[top], s[top + 1]), [b1, b2] = pick2(po[2 * k], po[2 * k + 1]);
      halves[0].push(play(b1, a1, () => twoLegs(L, r, b1, a1, base))); halves[1].push(play(b2, a2, () => twoLegs(L, r, b2, a2, base)));
    }
    mark('qf', [...halves[0], ...halves[1]]);
    const qf = halves.flatMap(h => [play(h[0], h[1], () => twoLegs(L, r, ...pick2(h[0], h[1]), base)), play(h[2], h[3], () => twoLegs(L, r, ...pick2(h[2], h[3]), base))]);
    mark('sf', qf);
    const sf = [0, 2].map(j => { const [x, y] = pick2(qf[j], qf[j + 1]); return play(x, y, () => twoLegs(L, r, x, y, base)); });
    mark('final', sf);
    mark('champ', [play(sf[0], sf[1], () => koMatch(L, r, sf[0], sf[1], true, base))]);
  } else if (type === 'efl') {
    // EFL Championship: top two go up; 3rd v 6th and 4th v 5th over two legs (higher place at home second), then a
    // final at Wembley. 'champ' = play-off winner, 'up' = the three promoted clubs.
    const s = seeds[0];
    const sf = [play(s[5], s[2], () => twoLegs(L, r, s[5], s[2], L.base)), play(s[4], s[3], () => twoLegs(L, r, s[4], s[3], L.base))];
    mark('sf', s.slice(2, 6)); mark('final', sf);
    const w = play(sf[0], sf[1], () => koMatch(L, r, sf[0], sf[1], true));
    mark('champ', [w]); mark('up', [s[0], s[1], w]);
  } else if (type === 'mex') {
    // Liga MX Liguilla: top eight, 1v8 2v7 3v6 4v5, semi-finals reseeded (best remaining v worst). Two legs, the
    // higher place at home second. Level on aggregate: the higher place goes through (quarters and semis); the final
    // has extra time and penalties.
    const s = seeds[0], rank = new Map(s.map((t, k) => [t, k]));
    const tie = (x, y, final = false) => { const [hi, lo] = rank.get(x) < rank.get(y) ? [x, y] : [y, x]; return mexTie(L, r, matches, lo, hi, final); };
    const qf = [tie(s[0], s[7]), tie(s[1], s[6]), tie(s[2], s[5]), tie(s[3], s[4])];
    mark('sf', qf);
    const q = [...qf].sort((a, b) => rank.get(a) - rank.get(b));
    const sf = [tie(q[0], q[3]), tie(q[1], q[2])]; mark('final', sf);
    mark('champ', [tie(sf[0], sf[1], true)]);
  }
  return out;
}

// One Liga MX two-legged tie, lo at home first, hi (the higher place) at home second. Uses legs already played.
export function mexTie(L, r, matches, lo, hi, final) {
  const legs = matches.filter(m => m.stage && ((m.h === lo && m.a === hi) || (m.h === hi && m.a === lo)));
  const leg1 = legs.find(m => m.h === lo && isPlayed(m)), leg2 = legs.find(m => m.h === hi && isPlayed(m));
  let gl, gh;
  if (leg1) { gl = leg1.hs; gh = leg1.as; } else { const k = sample(cachedCdf(L, lo, hi, false, L.base), r()); gl = (k / W) | 0; gh = k % W; }
  if (leg2) {
    gl += leg2.as; gh += leg2.hs;
    if (gl !== gh) return gl > gh ? lo : hi;
    if (leg2.so) return leg2.so[0] > leg2.so[1] ? hi : lo;
    if (!final) return hi;
  } else {
    const k = sample(cachedCdf(L, hi, lo, false, L.base), r()); gh += (k / W) | 0; gl += k % W;
    if (gl !== gh) return gl > gh ? lo : hi;
    if (!final) return hi;
  }
  const [lh, la] = lam(L, hi, lo, false, L.base), eh = poisson(r, lh / 3), el = poisson(r, la / 3);
  if (eh !== el) return eh > el ? hi : lo;
  return r() < 0.5 ? hi : lo;
}

// ---------------------------------------------------------------- simulation
// opts: {sims, seed}. Returns per-team distributions and zone/round probabilities.
// focus: team indices (your clubs) whose chances are also tracked for every remaining match, for the match of the day/week
export function simulate(L, rules, matches, { sims = 10000, seed = 7, focus = [] } = {}) {
  gridCache.clear();
  const r = rng(seed), N = L.teams.length, tb = rules.tiebreak;
  const reg = regular(matches);
  const base = L.teams.map((_, i) => blankRow(i)), conf = tb.includes('cppg');
  for (const m of reg) if (isPlayed(m)) addResult(base, m, m.hs, m.as, conf && sameConf(L, m));
  for (const a of L.adjust || []) base[a.i].pts += a.pts;
  const rem = reg.filter(m => !isPlayed(m) && m.st !== 'canc' && m.lh);
  const remConf = rem.map(m => conf && sameConf(L, m));
  const cdfs = rem.map(m => m.st === 'live' ? cdf(liveGrid(m.lh, m.la, m.min ?? 45, m.rc, L.P.rho)) : cdf(matchGrid(m, L.P)));
  const groups = groupsOf(L, rules);
  const maxPos = Math.max(...groups.map(g => g.idx.length));
  const pos = Array.from({ length: N }, () => new Float64Array(maxPos + 1));
  const opos = Array.from({ length: N }, () => new Float64Array(N + 1));
  const ptsSum = new Float64Array(N), ptsHist = Array.from({ length: N }, () => new Map());
  const zone = {}; for (const z of rules.zones) zone[z.key] = new Float64Array(N);
  const rounds = {};
  const pts = new Float64Array(N), w = new Float64Array(N), gd = new Float64Array(N), gf = new Float64Array(N), agf = new Float64Array(N);
  const cp = new Float64Array(N), cpts = new Float64Array(N);
  const resultCount = rem.map(() => new Float64Array(3));
  const key = new Float64Array(N);
  // match importance: for each remaining match, how often each side lands in each zone (and wins the title/cup)
  // given home win / draw / away win. Stakes = how far a result moves those chances.
  // the post-season outcome that matters most: winning it ('champ'), or promotion in the Championship ('up')
  const OUT = rules.playoffs?.outcome || 'champ';
  const ZK = [...rules.zones.map(z => z.key), ...(rules.playoffs ? [OUT] : [])], Z = ZK.length;
  const inZ = new Uint8Array(Z * N), res = new Int8Array(rem.length);
  const cond = rem.map(() => new Float64Array(3 * 2 * Z));
  const F = focus.length, condF = rem.map(() => new Float64Array(3 * F * Z));
  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < N; i++) { pts[i] = base[i].pts; w[i] = base[i].w; gd[i] = base[i].gd; gf[i] = base[i].gf; agf[i] = base[i].awayGf; cp[i] = base[i].cp; cpts[i] = base[i].cpts; }
    for (let j = 0; j < rem.length; j++) {
      const m = rem[j], k = sample(cdfs[j], r());
      let hs = (k / W) | 0, as = k % W;
      if (m.st === 'live') { hs += m.hs; as += m.as; }
      gf[m.h] += hs; gf[m.a] += as; gd[m.h] += hs - as; gd[m.a] += as - hs; agf[m.a] += as;
      const o = hs > as ? 0 : hs === as ? 1 : 2; res[j] = o; resultCount[j][o]++;
      if (o === 0) { pts[m.h] += 3; w[m.h]++; } else if (o === 2) { pts[m.a] += 3; w[m.a]++; } else { pts[m.h]++; pts[m.a]++; }
      if (remConf[j]) { cp[m.h]++; cp[m.a]++; cpts[m.h] += o === 0 ? 3 : o === 1 ? 1 : 0; cpts[m.a] += o === 2 ? 3 : o === 1 ? 1 : 0; }
    }
    for (let i = 0; i < N; i++) {
      let k = 0;
      for (const c of tb) if (c !== 'h2h') k = k * 1024 + (c === 'pts' ? pts[i] : c === 'w' ? w[i] : c === 'gd' ? gd[i] + 512 : c === 'gf' ? gf[i] : c === 'cppg' ? ppgKey(cpts[i], cp[i]) : agf[i]);
      key[i] = k + r() * 0.5;
      ptsSum[i] += pts[i]; const hm = ptsHist[i]; hm.set(pts[i], (hm.get(pts[i]) || 0) + 1);
    }
    const seeds = groups.map(g => [...g.idx].sort((x, y) => key[y] - key[x]));
    seeds.forEach(sd => sd.forEach((t, k) => { pos[t][k + 1]++; }));
    const all = groups.flatMap(g => g.idx).sort((x, y) => key[y] - key[x]);
    all.forEach((t, k) => { opos[t][k + 1]++; });
    inZ.fill(0);
    rules.zones.forEach((z, zi) => {
      const list = (z.scope === 'group') ? seeds.flatMap(sd => sd.slice(z.from - 1, z.to)) : (rules.groups ? all : seeds[0]).slice(z.from - 1, z.to);
      for (const t of list) { zone[z.key][t]++; inZ[zi * N + t] = 1; }
    });
    if (rules.playoffs) {
      const b = bracket(rules.playoffs.type, L, r, rules.groups ? seeds : [all], pts, matches);
      for (const k in b) { const a = rounds[k] || (rounds[k] = new Float64Array(N)); for (const t of b[k]) a[t]++; }
      for (const t of b[OUT] || []) inZ[(Z - 1) * N + t] = 1;
    }
    for (let j = 0; j < rem.length; j++) {
      const c = cond[j], o = res[j] * 2 * Z, h = rem[j].h, a = rem[j].a;
      for (let zi = 0; zi < Z; zi++) { c[o + zi] += inZ[zi * N + h]; c[o + Z + zi] += inZ[zi * N + a]; }
      if (F) { const cf = condF[j], of = res[j] * F * Z; for (let q = 0; q < F; q++) for (let zi = 0; zi < Z; zi++) cf[of + q * Z + zi] += inZ[zi * N + focus[q]]; }
    }
  }
  const f = x => x / sims;
  const teams = L.teams.map((_, i) => ({
    i, pos: Array.from(pos[i], f), opos: Array.from(opos[i], f), pts: ptsSum[i] / sims,
    ptsRange: quantiles(ptsHist[i], sims),
    zone: Object.fromEntries(rules.zones.map(z => [z.key, f(zone[z.key][i])])),
    rounds: Object.fromEntries(Object.keys(rounds).map(k => [k, f(rounds[k][i])])),
  }));
  for (const t of teams) t.avgPos = t.pos.reduce((s, p, k) => s + p * k, 0);
  const W8 = { gold: 1, good: 0.8, ok: 0.6, warn: 0.5, bad: 0.8 };
  const weight = k => (k === OUT ? 1 : W8[rules.zones.find(z => z.key === k).tone] ?? 0.6);
  const fixtures = rem.map((m, j) => {
    const rc = resultCount[j], c = cond[j], swings = [];
    let imp = 0;
    for (let side = 0; side < 2; side++) for (let zi = 0; zi < Z; zi++) {
      const pr = [0, 1, 2].map(o => (rc[o] ? c[o * 2 * Z + side * Z + zi] / rc[o] : null));
      if (pr[0] == null || pr[2] == null) continue;
      const sw = Math.abs(pr[0] - pr[2]);
      imp += weight(ZK[zi]) * sw;
      if (sw >= 0.03) swings.push({ side, key: ZK[zi], H: +pr[0].toFixed(3), D: pr[1] == null ? null : +pr[1].toFixed(3), A: +pr[2].toFixed(3), sw: +sw.toFixed(3) });
    }
    swings.sort((x, y) => y.sw - x.sw);
    // how much the result moves your clubs' chances (whether or not they play in it): spread across home win / draw /
    // away win, weighted like imp; best = the single biggest move, for the card's line
    let fimp = 0, best = null;
    for (let q = 0; q < F; q++) for (let zi = 0; zi < Z; zi++) {
      const pr = [0, 1, 2].map(o => (rc[o] >= 30 ? condF[j][o * F * Z + q * Z + zi] / rc[o] : null)), ok = pr.filter(x => x != null);
      if (ok.length < 2) continue;
      const sw = Math.max(...ok) - Math.min(...ok);
      if (sw < 0.03) continue; // smaller moves are simulation noise
      fimp += weight(ZK[zi]) * sw;
      if (!best || sw > best.sw) best = { t: focus[q], key: ZK[zi], H: pr[0] == null ? null : +pr[0].toFixed(3), D: pr[1] == null ? null : +pr[1].toFixed(3), A: pr[2] == null ? null : +pr[2].toFixed(3), sw: +sw.toFixed(3) };
    }
    const fav = F ? { imp: +fimp.toFixed(4), best } : null;
    return { id: m.id, p: Array.from(rc, f), imp: +imp.toFixed(4), swings: swings.slice(0, 4), fav };
  });
  return { sims, teams, fixtures, rounds: Object.keys(rounds) };
}

function quantiles(hist, n) {
  const ks = [...hist.keys()].sort((a, b) => a - b); let c = 0, lo = null, hi = null;
  for (const k of ks) { c += hist.get(k); if (lo == null && c >= n * 0.1) lo = k; if (hi == null && c >= n * 0.9) { hi = k; break; } }
  return [lo, hi];
}
