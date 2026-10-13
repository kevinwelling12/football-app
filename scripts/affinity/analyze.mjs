// What Kevin's "which would you rather support?" picks say about the Affinity model.
// Usage: node scripts/affinity/analyze.mjs picks.json   (the JSON from Settings > Copy my Affinity picks)
import fs from 'node:fs';
import * as AF from '../../web/affinity.js';

const traits = JSON.parse(fs.readFileSync('data/affinity/traits.json', 'utf8'));
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const FAVS = ['364', '124', '17828', '9723', '15362'];
const LEAGUE = {};
for (const k of ['epl', 'bl', 'ucl', 'mls', 'nwsl', 'usl']) for (const t of JSON.parse(fs.readFileSync(`web/data/${k}.json`, 'utf8')).teams) LEAGUE[t.id] ??= k;
const answered0 = raw.filter(p => p.pick !== "can't say" && traits[p.ida] && traits[p.idb]).map(p => ({ a: p.ida, b: p.idb, win: p.pick === traits[p.ida].name ? p.ida : p.idb, t: p.t }));
const skipped = raw.filter(p => p.pick === "can't say");
const out = [];
const say = (...x) => out.push(x.join(' '));
const pct = x => `${Math.round(x * 100)}%`;

const answered = answered0;
say(`# Affinity picks: ${raw.length} total, ${answered.length} answered, ${skipped.length} can't say\n`);

// 1. how well the model predicts picks it hasn't seen (10-fold), and what it learned
const RV = JSON.parse(fs.readFileSync('data/affinity/rivals.json', 'utf8'));
const ctx = { league: LEAGUE, rivals: new Set(Object.entries(RV).filter(([k]) => k !== '_note').flatMap(([, v]) => Object.keys(v.rivals))) };
const all = raw.filter(p => traits[p.ida] && traits[p.idb]).map(p => ({ a: p.ida, b: p.idb, win: p.pick === "can't say" ? null : p.pick === traits[p.ida].name ? p.ida : p.idb }));
let ok = 0, tot = 0;
for (let k = 0; k < 10; k++) {
  const m = AF.fit(traits, ctx, all.filter((p, i) => !p.win || i % 10 !== k));
  for (const p of all.filter((p, i) => p.win && i % 10 === k)) { tot++; if (m.prefer(p.win, p.win === p.a ? p.b : p.a) > 0.5) ok++; }
}
const model = AF.fit(traits, ctx, all);
say(`## How well it predicts your picks`);
say(`- On picks it didn't see (10-fold): ${pct(ok / tot)} of ${tot}\n`);
say(`## What it learned (weight per full trait range or per flag; + pulls you toward a club)`);
for (const [f, b] of Object.entries(model.beta).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) say(`- ${AF.LABEL[f].padEnd(26)} ${b >= 0 ? '+' : '−'}${Math.abs(b).toFixed(2)}`);
const adj = Object.entries(model.u).filter(([, v]) => Math.abs(v) > 0.3).sort((a, b) => b[1] - a[1]);
say(`- Clubs your picks rate above their traits: ${adj.filter(x => x[1] > 0).slice(0, 8).map(([id, v]) => `${traits[id].name} +${v.toFixed(1)}`).join(', ') || 'none'}`);
say(`- ...and below: ${adj.filter(x => x[1] < 0).reverse().slice(0, 8).map(([id, v]) => `${traits[id].name} ${v.toFixed(1)}`).join(', ') || 'none'}\n`);
const full = { w: null };

// 3. consistency: triads where A>B, B>C, C>A
const beats = new Map(); for (const p of answered) beats.set(`${p.win}>${p.win === p.a ? p.b : p.a}`, 1);
const ids = [...new Set(answered.flatMap(p => [p.a, p.b]))];
let cyc = 0, tri = 0;
for (const a of ids) for (const b of ids) for (const c of ids) if (a < b && b < c) {
  const e = (x, y) => beats.has(`${x}>${y}`) ? 1 : beats.has(`${y}>${x}`) ? -1 : 0;
  const ab = e(a, b), bc = e(b, c), ca = e(c, a);
  if (ab && bc && ca) { tri++; if (ab === bc && bc === ca) cyc++; }
}
say(`## Consistency`);
say(`- Closed triangles of picks: ${tri}; going in a circle (A over B over C over A): ${cyc}`);
// clubs that keep winning or losing
const rec = {}; for (const p of answered) { const l = p.win === p.a ? p.b : p.a; (rec[p.win] ||= [0, 0])[0]++; (rec[l] ||= [0, 0])[1]++; }
const surprise = Object.entries(rec).filter(([, r]) => r[0] + r[1] >= 3).map(([id, r]) => [traits[id].name, r, Math.round(model.affinity(id))]);
const won = surprise.filter(x => x[1][1] === 0).sort((a, b) => a[2] - b[2]).slice(0, 8), lost = surprise.filter(x => x[1][0] === 0).sort((a, b) => b[2] - a[2]).slice(0, 8);
say(`- Always picked (lowest Affinity first): ${won.map(x => `${x[0]} ${x[1][0]}-0 (${x[2]})`).join(', ') || 'none'}`);
say(`- Never picked (highest Affinity first): ${lost.map(x => `${x[0]} 0-${x[1][1]} (${x[2]})`).join(', ') || 'none'}\n`);

// 4. can't say
if (skipped.length) {
  const lg = {}; for (const p of skipped) for (const id of [p.ida, p.idb]) lg[LEAGUE[id]] = (lg[LEAGUE[id]] || 0) + 1;
  const all = {}; for (const p of raw) for (const id of [p.ida, p.idb]) all[LEAGUE[id]] = (all[LEAGUE[id]] || 0) + 1;
  const gap = skipped.map(p => Math.abs(model.affinity(p.ida) - model.affinity(p.idb)));
  say(`## Can't say`);
  say(`- By league (share of that league's appearances): ${Object.keys(all).map(k => `${k} ${pct((lg[k] || 0) / all[k])}`).join(', ')}`);
  say(`- Median Affinity gap on can't-say pairs: ${gap.sort((a, b) => a - b)[gap.length >> 1]?.toFixed(1)}`);
}
console.log(out.join('\n'));
