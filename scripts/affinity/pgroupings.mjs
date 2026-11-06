// Backtest feature groupings for player Affinity on Kevin's picks (Settings > Copy my player picks), the way
// groupings.mjs does for clubs.
//   node scripts/affinity/pgroupings.mjs player_picks.json club_picks.json [variant prefixes...] [--weights]
// The "clubs you like" link uses the live club model fitted on the club picks. Tests on decisive picks (log loss /
// accuracy): picks = random 10-fold; players = 5-fold over players, every pick touching a held-out player hidden (the
// score comes from traits alone); time = first 70% by time -> the rest.
import fs from 'node:fs';
import * as AF from '../../web/affinity.js';
import * as PL from '../../web/players.js';

const P = JSON.parse(fs.readFileSync('data/affinity/players.json', 'utf8'));
const T = JSON.parse(fs.readFileSync('data/affinity/traits.json', 'utf8'));
const LEAGUE = {}, STANDING = {};
for (const k of ['epl', 'bl', 'mls', 'nwsl', 'usl', 'esp', 'ita', 'fra', 'eng2', 'mex', 'ucl', 'uel', 'uecl']) {
  const ts = JSON.parse(fs.readFileSync(`web/data/${k}.json`, 'utf8')).teams.sort((a, b) => (b.elo || 0) - (a.elo || 0));
  ts.forEach((t, i) => { LEAGUE[t.id] ??= k; STANDING[t.id] ??= 1 - i / Math.max(1, ts.length - 1); });
}
const favs = new Set(['364', '124', '17828', '9723', '15362']);
const cw = p => (p.pick === T[p.ida]?.name ? p.ida : p.pick === T[p.idb]?.name ? p.idb : p.pick === 'no strong opinion' ? '=' : null);
const clubPicks = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).map(p => ({ a: p.ida, b: p.idb, win: cw(p) }));
const clubModel = AF.fit(T, { league: LEAGUE, rivals: new Set(), standing: STANDING, city: AF.cityGroups(T, Object.keys(T).filter(id => !id.startsWith('_'))) }, clubPicks);
const clubAff = id => (T[id] ? clubModel.affinity(id) : null);

const pw = p => (p.pick === P[p.ida]?.n ? p.ida : p.pick === P[p.idb]?.n ? p.idb : p.pick === 'no strong opinion' ? '=' : null);
const picks = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).map(p => ({ a: p.ida, b: p.idb, win: pw(p), t: p.t }))
  .filter(p => P[p.a] && P[p.b]).sort((x, y) => String(x.t).localeCompare(String(y.t)));

// raw per-player values, from players.js pfeatures (0-1 traits, links, flags, familiarity)
const B = {};
for (const [id, p] of Object.entries(P)) { const x = PL.pfeatures(p, clubAff, favs); B[id] = Object.fromEntries(PL.PFEATURES.map((f, j) => [f, x[j]])); }
const mean = (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
// familiarity controls (fitted, not counted): how big his clubs were (seasons-weighted Elo standing of the clubs he
// played for), and the league of his current or last club (EPL as the base)
const LGS = ['bl', 'mls', 'nwsl', 'usl', 'esp', 'ita', 'fra', 'other'];
for (const [id, p] of Object.entries(P)) {
  let w = 0, s = 0; for (const c of p.clubs) { const st = c[1] ? STANDING[c[1]] : null; if (st != null) { const n = Math.max(0.5, (c[3] ?? 2026) - (c[2] ?? 2026)); w += n; s += n * st; } }
  B[id].fame = w ? s / w : 0.3;
  const last = [...p.clubs].reverse().find(c => c[1] && LEAGUE[c[1]]); const lg = last ? LEAGUE[last[1]] : 'other';
  for (const l of LGS) B[id]['lg_' + l] = (lg === l || (l === 'other' && !['epl', ...LGS].includes(lg))) ? 1 : 0;
}
const FAMF = process.env.FAME ? ['active', 'women', 'fame', ...LGS.map(l => 'lg_' + l)] : ['active', 'women'];

const VARIANTS = {
  'all 17 features, nothing pre-set': { feats: Object.fromEntries(PL.PFEATURES.filter(f => !FAMF.includes(f)).map(f => [f, b => b[f]])) },
  'A: 8 groups': { feats: {
    character: b => mean(b.CH, b.SP, b.VO, b.CO, b.HU), team: b => b.WK, loyalty: b => b.LO, class: b => mean(b.AB, b.ST, b.LE),
    myClub: b => b.myClub, clubs: b => b.clubs, usa: b => b.usa,
    wrongdoing: b => Math.max(b.serious, b.lesser * 0.5), moneymoves: b => Math.max(b.money, b.moves) } },
  'B: 6 groups (team in character, links merged)': { feats: {
    character: b => mean(b.CH, b.SP, b.VO, b.CO, b.HU, b.WK), loyalty: b => b.LO, class: b => mean(b.AB, b.ST, b.LE),
    connection: b => mean(b.myClub, b.clubs), usa: b => b.usa,
    wrongdoing: b => Math.max(b.serious, b.lesser * 0.5), moneymoves: b => Math.max(b.money, b.moves) } },
  'C: 8 groups, greatness apart from style and legacy': { feats: {
    character: b => mean(b.CH, b.SP, b.VO, b.CO, b.HU), team: b => b.WK, loyalty: b => b.LO, great: b => b.AB, flair: b => mean(b.ST, b.LE),
    myClub: b => b.myClub, clubs: b => b.clubs, usa: b => b.usa,
    wrongdoing: b => Math.max(b.serious, b.lesser * 0.5), moneymoves: b => Math.max(b.money, b.moves) } },
  'D: A with the character parts kept apart': { feats: {
    CH: b => b.CH, SP: b => b.SP, VO: b => b.VO, CO: b => b.CO, HU: b => b.HU, team: b => b.WK, loyalty: b => b.LO, class: b => mean(b.AB, b.ST, b.LE),
    myClub: b => b.myClub, clubs: b => b.clubs, usa: b => b.usa,
    wrongdoing: b => Math.max(b.serious, b.lesser * 0.5), moneymoves: b => Math.max(b.money, b.moves) } },
};

function build(v) {
  const names = [...Object.keys(v.feats), ...FAMF];
  const X = {}; for (const id in B) X[id] = [...Object.values(v.feats).map(f => f(B[id])), ...FAMF.map(f => B[id][f])];
  return { X, spec: { names, pull: names.map(() => false), push: names.map(() => false), fam: names.map(n => FAMF.includes(n)),
    flags: names.filter(n => ['serious', 'lesser', 'money', 'moves', 'wrongdoing', 'moneymoves'].includes(n)), prior: names.map(() => 0), free: true } };
}
const decisive = p => p.win === p.a || p.win === p.b;
function score(m, test) { let ll = 0, ok = 0; for (const p of test) { const q = Math.min(1 - 1e-6, Math.max(1e-6, m.predict(p.win, p.win === p.a ? p.b : p.a))); ll -= Math.log(q); if (q > 0.5) ok++; } return [ll, ok, test.length]; }
function run(fit) {
  const add = (acc, r) => r.map((x, i) => (acc[i] || 0) + x); let a = [], b = [];
  for (let k = 0; k < 10; k++) a = add(a, score(fit(picks.filter((p, i) => !decisive(p) || i % 10 !== k)), picks.filter((p, i) => decisive(p) && i % 10 === k)));
  const ids = Object.keys(P).sort(), fold = Object.fromEntries(ids.map((id, i) => [id, i % 5]));
  for (let k = 0; k < 5; k++) { const held = p => fold[p.a] === k || fold[p.b] === k; b = add(b, score(fit(picks.filter(p => !held(p))), picks.filter(p => held(p) && decisive(p)))); }
  const cut = Math.floor(picks.length * 0.7);
  return { picks: a, players: b, time: score(fit(picks.slice(0, cut)), picks.slice(cut).filter(decisive)), m: fit(picks) };
}
const f = ([ll, ok, n]) => `${(ll / n).toFixed(3)} / ${Math.round(ok / n * 100)}%`;
const only = process.argv.slice(4).filter(a => !a.startsWith('--'));
console.log(`${picks.filter(decisive).length} decisive player picks. Log loss / accuracy (lower is better)\n`);
console.log('variant'.padEnd(52), 'n'.padStart(3), '  picks'.padEnd(16), 'players'.padEnd(16), 'time');
const show = (name, n, r) => { console.log(name.padEnd(52), String(n).padStart(3), ' ', f(r.picks).padEnd(16), f(r.players).padEnd(16), f(r.time)); if (process.argv.includes('--weights')) console.log('   ', Object.entries(r.m.beta).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(', ')); };
if (!only.length || only.some(o => 'live'.startsWith(o))) show('live (pre-set weights, sign locks, per-player adj.)', PL.PFEATURES.length, run(ps => PL.fitPlayers(P, clubAff, favs, ps)));
for (const [name, v] of Object.entries(VARIANTS)) {
  if (only.length && !only.some(o => name.startsWith(o))) continue;
  const { X, spec } = build(v);
  show(name, Object.keys(v.feats).length, run(ps => AF.fitPairs(X, spec, ps, { items: false })));
  if (process.env.ITEMS) show(name + ' + per-player adj.', Object.keys(v.feats).length, run(ps => AF.fitPairs(X, spec, ps, { items: true })));
}
