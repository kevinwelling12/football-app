// Clinching and elimination. Proofs are conservative: a place is "clinched" only if no combination of the remaining
// results can take it away (a tie on points counts against the club, unless the first tiebreaker is total wins and the
// rival can't match the club's), "eliminated" only if no combination can deliver it.
// Scenarios: for the club's next match (and the other matches of that round that involve its rivals) we enumerate every
// combination of results and describe the ones that clinch or eliminate, e.g. "Win, or draw and Chicago don't win".
import { isPlayed, regular, groupsOf } from './sim.js';

function table(L, matches) {
  const N = L.teams.length, pts = new Array(N).fill(0), left = new Array(N).fill(0), wins = new Array(N).fill(0);
  for (const m of regular(matches)) {
    if (m.st === 'canc') continue;
    if (isPlayed(m)) { if (m.hs > m.as) { pts[m.h] += 3; wins[m.h]++; } else if (m.hs < m.as) { pts[m.a] += 3; wins[m.a]++; } else { pts[m.h]++; pts[m.a]++; } }
    else { left[m.h]++; left[m.a]++; }
  }
  for (const a of L.adjust || []) pts[a.i] += a.pts;
  return { pts, left, wins };
}

// peers: the indices a zone is decided among (the group, or the whole league).
function peersFor(L, rules, z, t) {
  const groups = groupsOf(L, rules);
  if (z.scope === 'group') return groups.find(g => g.idx.includes(t)).idx;
  return groups.flatMap(g => g.idx);
}

// Status of club t for zone z (places from..to): 'in' (certain), 'out' (impossible) or null.
// Level on points counts against t both ways, so tiebreakers never make a claim wrong.
function zoneStatus(z, t, peers, pts, left) {
  const max = i => pts[i] + 3 * left[i];
  let canCatch = 0, surelyAbove = 0;
  for (const i of peers) { if (i === t) continue; if (max(i) >= pts[t]) canCatch++; if (pts[i] > max(t)) surelyAbove++; }
  const atMostTo = canCatch < z.to, atLeastFrom = surelyAbove >= z.from - 1;
  if (atMostTo && atLeastFrom) return 'in';
  if (surelyAbove >= z.to || canCatch < z.from - 1) return 'out';
  return null;
}

// ---- exact-ish proofs with remaining fixtures (rivals that still meet can't all win)
// Relaxations keep both proofs sound: for "clinched" a match may hand its 3 points out in any split (more outcomes than
// real football), for "eliminated" a match hands out only 2 (every real result gives at least that). If even the relaxed
// version can't break the claim, no real combination can.
function maxflow(n, edges, s, tt) {
  const cap = Array.from({ length: n }, () => new Float64Array(n));
  for (const [u, v, c] of edges) cap[u][v] += c;
  let flow = 0;
  for (;;) {
    const prev = new Int32Array(n).fill(-1); prev[s] = s; const q = [s];
    while (q.length && prev[tt] < 0) { const u = q.shift(); for (let v = 0; v < n; v++) if (prev[v] < 0 && cap[u][v] > 1e-9) { prev[v] = u; q.push(v); } }
    if (prev[tt] < 0) return flow;
    let f = Infinity; for (let v = tt; v !== s; v = prev[v]) f = Math.min(f, cap[prev[v]][v]);
    for (let v = tt; v !== s; v = prev[v]) { cap[prev[v]][v] -= f; cap[v][prev[v]] += f; }
    flow += f;
  }
}
function* subsets(arr, k, start = 0, cur = []) {
  if (cur.length === k) { yield cur; return; }
  for (let i = start; i <= arr.length - (k - cur.length); i++) yield* subsets(arr, k, i + 1, [...cur, arr[i]]);
}
const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; };
const LIMIT = 4000;

// Is t certain to finish in the top k of peers? (t loses everything left; a rival level on points counts as above.)
// wins (when the competition's first tiebreaker is total wins, MLS): a rival level on points only counts as above if it
// could get there with at least t's wins; one that can't (too few games left to win enough) has to pass t outright.
function clinchedTop(k, t, peers, pts, rem, wins) {
  if (k >= peers.length) return true;
  const X0 = pts[t], set = new Set(peers), base = {}, games = {};
  for (const m of rem) { games[m.h] = (games[m.h] || 0) + 1; games[m.a] = (games[m.a] || 0) + 1; }
  // points rival i needs to be above t: X0, or X0 + 1 if at exactly X0 it must have fewer wins than t (most wins at a
  // given points total: as many wins as the points allow, the rest draws, within the games it has left)
  const need = i => {
    if (!wins) return X0;
    const g = X0 - pts[i]; if (g < 0) return X0;
    const nw = Math.min(Math.floor(g / 3), games[i] || 0), canLevel = g - 3 * nw <= (games[i] || 0) - nw;
    return canLevel && wins[i] + nw >= wins[t] ? X0 : X0 + 1;
  };
  for (const i of peers) base[i] = pts[i];
  const inner = [];
  for (const m of rem) {
    const h = set.has(m.h), a = set.has(m.a);
    if (m.h === t || m.a === t) { const o = m.h === t ? m.a : m.h; if (set.has(o)) base[o] += 3; continue; }
    if (h && a) inner.push(m); else if (h) base[m.h] += 3; else if (a) base[m.a] += 3;
  }
  const others = peers.filter(i => i !== t), X = {}; for (const i of others) X[i] = need(i);
  const reach = others.filter(i => base[i] >= X[i]).length; // already there without needing rivals' games
  const short = k - reach; if (short <= 0) return false;
  const maxOf = i => base[i] + 3 * inner.filter(m => m.h === i || m.a === i).length;
  const cands = others.filter(i => base[i] < X[i] && maxOf(i) >= X[i]);
  if (cands.length < short) return true;
  if (choose(cands.length, short) > LIMIT) return false;
  for (const S of subsets(cands, short)) {
    const inS = new Set(S), ms = inner.filter(m => inS.has(m.h) || inS.has(m.a));
    const dem = {}; for (const i of S) dem[i] = X[i] - base[i];
    // matches between a member and an outsider: the member takes all 3
    for (const m of ms) if (!(inS.has(m.h) && inS.has(m.a))) dem[inS.has(m.h) ? m.h : m.a] -= 3;
    const both = ms.filter(m => inS.has(m.h) && inS.has(m.a));
    const idx = new Map(S.map((i, n) => [i, 1 + both.length + n])), N = 2 + both.length + S.length, sink = N - 1;
    const edges = []; let need2 = 0;
    both.forEach((m, n) => { edges.push([0, 1 + n, 3], [1 + n, idx.get(m.h), 3], [1 + n, idx.get(m.a), 3]); });
    for (const i of S) { const d = Math.max(0, dem[i]); need2 += d; edges.push([idx.get(i), sink, d]); }
    if (need2 === 0 || maxflow(N, edges, 0, sink) >= need2 - 1e-9) return false; // all of S can get there: not clinched
  }
  return true;
}

// Is t certain to finish below the top k? (t wins everything left; a rival level on points does not count as above.)
// wins (MLS): a rival that already has more wins than t can reach is above t even when level on points.
function eliminatedTop(k, t, peers, pts, rem, wins) {
  if (k <= 0) return true;
  const set = new Set(peers);
  let M = pts[t], Wt = wins ? wins[t] : 0; for (const m of rem) if (m.h === t || m.a === t) { M += 3; Wt++; }
  const cap = i => (wins && wins[i] > Wt ? M - 1 : M); // most points i can have and still be below t
  const others = peers.filter(i => i !== t);
  const above = others.filter(i => pts[i] > cap(i)).length;
  const free = k - 1 - above; if (free < 0) return true;
  const cands = others.filter(i => pts[i] <= cap(i));
  const inner = rem.filter(m => m.h !== t && m.a !== t && set.has(m.h) && set.has(m.a));
  const tries = free >= cands.length ? [cands] : choose(cands.length, free) > LIMIT ? null : subsets(cands, free);
  if (!tries) return false;
  for (const A of tries) {
    const inA = new Set(A), below = cands.filter(i => !inA.has(i));
    const ms = inner.filter(m => !inA.has(m.h) && !inA.has(m.a) && below.includes(m.h) && below.includes(m.a));
    const idx = new Map(below.map((i, n) => [i, 1 + ms.length + n])), N = 2 + ms.length + below.length, sink = N - 1;
    const edges = [];
    ms.forEach((m, n) => { edges.push([0, 1 + n, 2], [1 + n, idx.get(m.h), 2], [1 + n, idx.get(m.a), 2]); });
    for (const i of below) edges.push([idx.get(i), sink, cap(i) - pts[i]]);
    if (maxflow(N, edges, 0, sink) >= 2 * ms.length - 1e-9) return false; // everyone else can stay at or below t
  }
  return true;
}

function provenStatus(z, t, peers, pts, rem, p, wins) {
  // a simulated season is a real possible outcome: if one put t in the zone, it can't be eliminated, and vice versa
  if (p != null && p > 0 && p < 1) return null;
  const inTo = clinchedTop(z.to, t, peers, pts, rem, wins), outFrom = z.from <= 1 || eliminatedTop(z.from - 1, t, peers, pts, rem, wins);
  if (inTo && outFrom) return 'in';
  if (eliminatedTop(z.to, t, peers, pts, rem, wins) || (z.from > 1 && clinchedTop(z.from - 1, t, peers, pts, rem, wins))) return 'out';
  return null;
}

// sim (optional): simulation results, used to skip proofs that a simulated season already disproves
export function statuses(L, rules, matches, sim) {
  const { pts, left, wins: w } = table(L, matches), out = {};
  const rem = regular(matches).filter(m => !isPlayed(m) && m.st !== 'canc');
  // total wins as the first tiebreaker (MLS) is used in the proofs; other first tiebreakers (goal difference,
  // head-to-head) can't be bounded, so ties count against the club there
  const wins = rules.tiebreak[1] === 'w' ? w : null;
  for (const z of rules.zones) {
    out[z.key] = {};
    for (let t = 0; t < L.teams.length; t++) {
      if (L.teams[t].inLeague === false) continue;
      const peers = peersFor(L, rules, z, t);
      const s = zoneStatus(z, t, peers, pts, left) || provenStatus(z, t, peers, pts, rem, sim?.teams[t].zone[z.key], wins);
      if (s) out[z.key][t] = s;
    }
  }
  return out;
}

const OUTS = ['H', 'D', 'A'];
const apply = (pts, left, m, o) => { left[m.h]--; left[m.a]--; if (o === 'H') pts[m.h] += 3; else if (o === 'A') pts[m.a] += 3; else { pts[m.h]++; pts[m.a]++; } };

// Scenario text for club t and zone z in its next round. Returns null when nothing can change this round.
export function scenarios(L, rules, matches, t, z, { maxOthers = 6, windowDays = 4 } = {}) {
  const { pts, left } = table(L, matches);
  const peers = peersFor(L, rules, z, t);
  const now = zoneStatus(z, t, peers, pts, left);
  if (now) return { already: now };
  const upcoming = regular(matches).filter(m => !isPlayed(m) && m.st !== 'canc').sort((a, b) => a.t.localeCompare(b.t));
  const own = upcoming.filter(m => m.h === t || m.a === t), mine = own[0]; if (!mine) return null;
  // the round: matches up to a few days after this one, and before the club plays again
  const t0 = Date.parse(mine.t), t1 = Math.min(t0 + windowDays * 864e5, own[1] ? Date.parse(own[1].t) - 1 : Infinity);
  const inWindow = m => Date.parse(m.t) >= t0 - windowDays * 864e5 && Date.parse(m.t) <= t1;
  const max = i => pts[i] + 3 * left[i];
  // rivals: peers whose results can matter (within reach either way)
  const rivals = new Set(peers.filter(i => i !== t && max(i) >= pts[t] - 3 && pts[i] <= max(t) + 3));
  const others = upcoming.filter(m => m.h !== t && m.a !== t && inWindow(m) && (rivals.has(m.h) || rivals.has(m.a)) && peers.includes(m.h))
    .sort((a, b) => Math.abs(pts[a.h] - pts[t]) - Math.abs(pts[b.h] - pts[t])).slice(0, maxOthers);
  const res = { match: mine, clinch: {}, elim: {} };
  const tOut = o => (mine.h === t ? o : o === 'H' ? 'A' : o === 'A' ? 'H' : 'D'); // t's W/D/L -> H/D/A of its match
  for (const [label, o] of [['W', 'H'], ['D', 'D'], ['L', 'A']]) {
    const combos = [];
    const n = others.length, total = 3 ** n;
    for (let c = 0; c < total; c++) {
      const p = pts.slice(), lf = left.slice(); apply(p, lf, mine, tOut(o));
      const asg = []; let x = c;
      for (let j = 0; j < n; j++) { const oo = OUTS[x % 3]; x = (x / 3) | 0; asg.push(oo); apply(p, lf, others[j], oo); }
      combos.push({ asg, s: zoneStatus(z, t, peers, p, lf) });
    }
    for (const kind of ['in', 'out']) {
      const good = combos.filter(c => c.s === kind);
      if (!good.length) continue;
      const bucket = kind === 'in' ? res.clinch : res.elim;
      if (good.length === combos.length) { bucket[label] = []; continue; }
      bucket[label] = conditions(combos, kind, others).map(conj => conj.map(([j, set]) => phrase(L, others[j], set)));
    }
  }
  if (!Object.keys(res.clinch).length && !Object.keys(res.elim).length) return null;
  res.others = others;
  return res;
}

// Minimal conjunctions (up to 3 conditions) of "match j ends in one of set" that guarantee the outcome.
// Combos are bit positions; each condition is a bitset of the combos it allows, so checks are a few word ops.
function conditions(combos, kind, others) {
  const sets = [['D', 'A'], ['H', 'D'], ['H', 'A'], ['A'], ['H'], ['D']]; // widest first
  const nW = Math.ceil(combos.length / 32), bits = () => new Uint32Array(nW);
  const good = bits(); combos.forEach((c, i) => { if (c.s === kind) good[i >> 5] |= 1 << (i & 31); });
  const lits = [];
  others.forEach((_, j) => sets.forEach(S => {
    const b = bits(); combos.forEach((c, i) => { if (S.includes(c.asg[j])) b[i >> 5] |= 1 << (i & 31); });
    lits.push({ j, S, b });
  }));
  // only matches whose result can change the outcome are worth naming
  const useful = lits.filter(l => { for (let w = 0; w < nW; w++) if (l.b[w] & good[w]) return true; return false; });
  const found = [];
  const covers = (f, conj) => f.every(x => conj.some(y => y.j === x.j && y.S.every(v => x.S.includes(v))));
  const test = conj => {
    let any = false;
    for (let w = 0; w < nW; w++) {
      let sat = ~0; for (const l of conj) sat &= l.b[w];
      if (w === nW - 1 && combos.length % 32) sat &= (1 << (combos.length % 32)) - 1;
      if (sat & ~good[w]) return false;
      if (sat) any = true;
    }
    return any;
  };
  for (let size = 1; size <= 3 && found.length < 3; size++) {
    const rec = (start, conj) => {
      if (found.length >= 3) return;
      if (conj.length === size) { if (!found.some(f => covers(f, conj)) && test(conj)) found.push(conj); return; }
      for (let k = start; k < useful.length; k++) { if (conj.some(c => c.j === useful[k].j)) continue; rec(k + 1, [...conj, useful[k]]); }
    };
    rec(0, []);
  }
  return found.sort((a, b) => b.reduce((s, x) => s + x.S.length, 0) - a.reduce((s, x) => s + x.S.length, 0)).map(c => c.map(l => [l.j, l.S]));
}

function phrase(L, m, set) {
  const H = L.teams[m.h].s, A = L.teams[m.a].s, k = set.slice().sort().join('');
  return { AD: `${H} don't win`, DH: `${A} don't win`, A: `${A} beat ${H}`, H: `${H} beat ${A}`, D: `${H} and ${A} draw`, AH: `${H} v ${A} isn't a draw` }[k];
}

export function describe(sc, teamName) {
  const word = { W: 'Win', D: 'Draw', L: 'Lose' }, lines = [];
  for (const kind of ['clinch', 'elim']) {
    const parts = [];
    for (const r of ['W', 'D', 'L']) {
      const c = sc[kind][r]; if (!c) continue;
      if (!c.length) parts.push(r === 'W' ? 'a win' : r === 'D' ? 'a draw' : 'a loss');
      else parts.push(c.map(conj => `${r === 'W' ? 'a win' : r === 'D' ? 'a draw' : 'a loss'} and ${conj.join(' and ')}`).join(', or '));
    }
    if (parts.length) lines.push({ kind, text: `${kind === 'clinch' ? 'Clinch' : 'Out'} with ${parts.join(', or ')}` });
  }
  void word; void teamName;
  return lines;
}
