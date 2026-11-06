// Backtest trait groupings for club Affinity on Kevin's picks (the JSON from Settings > Copy my club picks).
//   node scripts/affinity/groupings.mjs picks.json
// Each variant builds its own feature matrix (composites are means of 0-10 traits; combined flags are a max) and is
// fitted with the page's engine (affinity.js fitPairs). Three tests on decisive picks, log loss and accuracy:
//   picks  random 10-fold over picks (a club's own adjustment helps)
//   clubs  5-fold over clubs: every pick touching a held-out club is hidden, so its score comes from traits alone
//   time   train on the first 70% of picks by time, test on the rest
import fs from 'node:fs';
import * as AF from '../../web/affinity.js';

const traits = JSON.parse(fs.readFileSync('data/affinity/traits.json', 'utf8'));
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const LEAGUE = {}, STANDING = {};
for (const k of ['epl', 'bl', 'mls', 'nwsl', 'usl', 'esp', 'ita', 'fra', 'eng2', 'mex', 'ucl', 'uel', 'uecl']) {
  const ts = JSON.parse(fs.readFileSync(`web/data/${k}.json`, 'utf8')).teams.sort((a, b) => (b.elo || 0) - (a.elo || 0));
  ts.forEach((t, i) => { LEAGUE[t.id] ??= k; STANDING[t.id] ??= 1 - i / Math.max(1, ts.length - 1); });
}
const FAVS = new Set(['364', '124', '17828', '9723', '15362']);
const LOVE = [[32.72, -117.16], [45.52, -122.68], [47.61, -122.33], [30.27, -97.74]];
const km = (a, b) => { const r = x => x * Math.PI / 180, h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };
const NOTHING = /nothing (notable|found)|estimate/i;
const winOf = p => (p.pick === p.a ? p.ida : p.pick === p.b ? p.idb : p.pick === 'no strong opinion' ? '=' : null);
const picks = raw.map(p => ({ a: p.ida, b: p.idb, win: winOf(p), t: p.t }))
  .filter(p => traits[p.a] && traits[p.b] && LEAGUE[p.a] && LEAGUE[p.b] && !FAVS.has(p.a) && !FAVS.has(p.b))
  .sort((x, y) => String(x.t).localeCompare(String(y.t)));

// raw per-club values (0-1)
const base = id => {
  const c = AF.withGeo(traits[id]), v = t => (c[t] ?? (t === 'lean' ? 5 : 0)) / 10;
  return {
    terrace: v('terrace'), rituals: v('rituals'), city: v('city'), ground: v('ground'), conscience: v('conscience'), voice: v('voice'),
    stewardship: v('stewardship'), women: v('women'), geography: v('geography'), contender: v('contender'), intensity: v('intensity'),
    comeback: v('comeback'), punch: v('punch'), lean: v('lean'),
    love: c.ll && LOVE.some(ll => km(ll, c.ll) < 60) ? 1 : 0,
    state: c.state ? 1 : 0, incidents: (c.conscience ?? 5) < 3 && !NOTHING.test(c.why?.conscience || '') ? 1 : 0,
    rival: 0, /* no rivalry factor since 2026-11-07 */ feeder: c.feeder ? 1 : 0, manufactured: c.manufactured ? 1 : 0,
  };
};
const B = Object.fromEntries(Object.keys(traits).filter(id => LEAGUE[id]).map(id => [id, base(id)]));
const mean = (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const FAM = ['bl', 'ucl', 'mls', 'nwsl', 'usl', 'esp', 'ita', 'fra', 'eng2', 'mex', 'uel', 'uecl'];

// a variant: named features (f => value from b), which are flags, and which are negOnly
const VARIANTS = {
  'current (14 traits, 6 flags)': {
    feats: { terrace: b => b.terrace, rituals: b => b.rituals, city: b => b.city, ground: b => b.ground, conscience: b => b.conscience, voice: b => b.voice,
      stewardship: b => b.stewardship, women: b => b.women, geography: b => b.geography, contender: b => b.contender, intensity: b => b.intensity,
      comeback: b => b.comeback, punch: b => b.punch, lean: b => b.lean, love: b => b.love,
      state: b => b.state, incidents: b => b.incidents, rival: b => b.rival, feeder: b => b.feeder, manufactured: b => b.manufactured },
  },
  'A: 9 groups': {
    feats: { atmosphere: b => mean(b.terrace, b.rituals, b.ground), city: b => b.city, fanpower: b => mean(b.voice, b.stewardship),
      values: b => mean(b.conscience, b.lean), story: b => mean(b.comeback, b.punch), style: b => b.intensity, women: b => b.women,
      geography: b => b.geography, contender: b => b.contender, love: b => b.love,
      redflag: b => Math.max(b.state, b.feeder, b.manufactured), incidents: b => b.incidents, rival: b => b.rival },
  },
  'B: 6 groups': {
    feats: { atmosphere: b => mean(b.terrace, b.rituals, b.ground, b.city), fanpower: b => mean(b.voice, b.stewardship),
      values: b => mean(b.conscience, b.lean, b.women), story: b => mean(b.comeback, b.punch), contender: b => b.contender, love: b => b.love,
      redflag: b => Math.max(b.state, b.feeder, b.manufactured, b.incidents), rival: b => b.rival },
  },
  'C: 9 groups, state kept apart': {
    feats: { atmosphere: b => mean(b.terrace, b.rituals, b.ground), city: b => b.city, fanpower: b => mean(b.voice, b.stewardship),
      values: b => mean(b.conscience, b.lean), story: b => mean(b.comeback, b.punch), style: b => b.intensity, women: b => b.women,
      geography: b => b.geography, contender: b => b.contender, love: b => b.love,
      state: b => b.state, franchise: b => Math.max(b.feeder, b.manufactured), incidents: b => b.incidents, rival: b => b.rival },
  },
  'D: current minus weak (rituals, women, conscience, lean, geography)': {
    feats: { terrace: b => b.terrace, city: b => b.city, ground: b => b.ground, voice: b => b.voice, stewardship: b => b.stewardship,
      contender: b => b.contender, intensity: b => b.intensity, comeback: b => b.comeback, punch: b => b.punch, love: b => b.love,
      state: b => b.state, incidents: b => b.incidents, rival: b => b.rival, feeder: b => b.feeder, manufactured: b => b.manufactured },
  },
  'E: 10 groups (atmosphere, fan power, story, franchise merged; weak ones dropped)': {
    feats: { atmosphere: b => mean(b.terrace, b.ground), city: b => b.city, fanpower: b => mean(b.voice, b.stewardship),
      story: b => mean(b.comeback, b.punch), style: b => b.intensity, contender: b => b.contender, love: b => b.love,
      state: b => b.state, incidents: b => b.incidents, franchise: b => Math.max(b.feeder, b.manufactured), rival: b => b.rival },
  },
  'F: 8 groups (B plus style, with racism kept apart)': {
    feats: { atmosphere: b => mean(b.terrace, b.rituals, b.ground, b.city), fanpower: b => mean(b.voice, b.stewardship),
      story: b => mean(b.comeback, b.punch), style: b => b.intensity, contender: b => b.contender, love: b => b.love,
      ownership: b => Math.max(b.state, b.feeder, b.manufactured), incidents: b => b.incidents, rival: b => b.rival },
  },
  'G: 7 groups (F with atmosphere = terrace, ground; no rituals or city)': {
    feats: { atmosphere: b => mean(b.terrace, b.ground), fanpower: b => mean(b.voice, b.stewardship, b.city),
      story: b => mean(b.comeback, b.punch), style: b => b.intensity, contender: b => b.contender, love: b => b.love,
      ownership: b => Math.max(b.state, b.feeder, b.manufactured), incidents: b => b.incidents, rival: b => b.rival },
  },
};

function build(v) {
  const names = [...Object.keys(v.feats), ...FAM.map(f => 'lg_' + f), 'fame'];
  const X = {};
  for (const id in B) X[id] = [...Object.values(v.feats).map(f => f(B[id])), ...FAM.map(f => (LEAGUE[id] === f ? 1 : 0)), STANDING[id] ?? 0.5];
  const spec = { names, pull: names.map(() => false), push: names.map(() => false), fam: names.map(n => n.startsWith('lg_') || n === 'fame' || n === 'contender'),
    flags: names.filter(n => ['state', 'incidents', 'rival', 'feeder', 'manufactured', 'redflag', 'franchise'].includes(n)), prior: names.map(() => 0), free: true,
    negOnly: names.map(n => n === 'contender'), plusOnly: ['love'] };
  return { X, spec };
}
const decisive = p => p.win === p.a || p.win === p.b;
function score(m, test) {
  let ll = 0, ok = 0;
  for (const p of test) { const l = p.win === p.a ? p.b : p.a, q = Math.min(1 - 1e-6, Math.max(1e-6, m.predict(p.win, l))); ll -= Math.log(q); if (q > 0.5) ok++; }
  return [ll, ok, test.length];
}
function run(v) {
  const { X, spec } = build(v), fit = ps => AF.fitPairs(X, spec, ps, { lambdaItem: 2 });
  const add = (acc, r) => r.map((x, i) => (acc[i] || 0) + x);
  let a = [], b = [];
  for (let k = 0; k < 10; k++) a = add(a, score(fit(picks.filter((p, i) => !decisive(p) || i % 10 !== k)), picks.filter((p, i) => decisive(p) && i % 10 === k)));
  const clubs = Object.keys(B).sort(), fold = Object.fromEntries(clubs.map((id, i) => [id, i % 5]));
  for (let k = 0; k < 5; k++) {
    const held = p => fold[p.a] === k || fold[p.b] === k;
    b = add(b, score(fit(picks.filter(p => !held(p))), picks.filter(p => held(p) && decisive(p))));
  }
  const cut = Math.floor(picks.length * 0.7), c = score(fit(picks.slice(0, cut)), picks.slice(cut).filter(decisive));
  const m = fit(picks);
  return { picks: a, clubs: b, time: c, n: Object.keys(v.feats).length, beta: m.beta };
}
const f = ([ll, ok, n]) => `${(ll / n).toFixed(3)} / ${Math.round(ok / n * 100)}%`;
console.log(`${picks.filter(decisive).length} decisive picks. Log loss / accuracy (lower log loss is better)\n`);
console.log('variant'.padEnd(64), 'n'.padStart(3), '  picks'.padEnd(16), 'clubs'.padEnd(16), 'time');
for (const [name, v] of Object.entries(VARIANTS)) {
  if (process.argv[3] && !process.argv.slice(3).some(a => name.startsWith(a))) continue;
  const r = run(v);
  console.log(name.padEnd(64), String(r.n).padStart(3), ' ', f(r.picks).padEnd(16), f(r.clubs).padEnd(16), f(r.time));
  if (process.argv.includes('--weights')) console.log('   ', Object.entries(r.beta).filter(([k]) => !k.startsWith('lg_')).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(', '));
}
