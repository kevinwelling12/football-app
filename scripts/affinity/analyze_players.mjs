// What Kevin's "who would you rather your son look up to?" picks say about player Affinity.
// Usage: node scripts/affinity/analyze_players.mjs player_picks.json [club_picks.json]
// (Settings > Copy my player picks / Copy my club picks; the club picks set the "clubs you like" link.)
import fs from 'node:fs';
import * as AF from '../../web/affinity.js';
import * as PL from '../../web/players.js';

const P = JSON.parse(fs.readFileSync('data/affinity/players.json', 'utf8'));
const T = JSON.parse(fs.readFileSync('data/affinity/traits.json', 'utf8'));
const RV = JSON.parse(fs.readFileSync('data/affinity/rivals.json', 'utf8'));
const league = {};
for (const k of ['epl', 'bl', 'mls', 'nwsl', 'usl', 'esp', 'ita', 'fra', 'eng2', 'ucl']) for (const t of JSON.parse(fs.readFileSync(`web/data/${k}.json`, 'utf8')).teams) league[t.id] ??= k;
const rivals = new Set(Object.entries(RV).filter(([k]) => k !== '_note').flatMap(([, v]) => Object.keys(v.rivals)));
const toPicks = (raw, name) => raw.map(p => ({ a: p.ida, b: p.idb, win: p.pick === "can't say" ? null : p.pick === name(p.ida) ? p.ida : p.idb }));
const clubPicks = process.argv[3] ? toPicks(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), id => T[id]?.name) : [];
const clubModel = AF.fit(T, { league, rivals }, clubPicks);
const favs = new Set(['364', '124', '17828', '9723', '15362']);
const clubAff = id => (favs.has(id) ? null : clubModel.affinity(id));
const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const picks = toPicks(raw, id => P[id]?.n).filter(p => P[p.a] && P[p.b]);
const ans = picks.filter(p => p.win);
const pct = x => `${Math.round(x * 100)}%`;

console.log(`# Player picks: ${raw.length} total, ${ans.length} answered\n`);
let ok = 0;
for (let k = 0; k < 10; k++) {
  const m = PL.fitPlayers(P, clubAff, favs, picks.filter((p, i) => !p.win || i % 10 !== k));
  for (const p of picks.filter((p, i) => p.win && i % 10 === k)) if (m.predict(p.win, p.win === p.a ? p.b : p.a) > 0.5) ok++;
}
const prior = PL.fitPlayers(P, clubAff, favs, []);
const priorOk = ans.filter(p => prior.prefer(p.win, p.win === p.a ? p.b : p.a) > 0.5).length;
console.log(`## Prediction\n- Starting weights: ${pct(priorOk / ans.length)}\n- Fitted, on picks it didn't see (10-fold): ${pct(ok / ans.length)}\n`);
const m = PL.fitPlayers(P, clubAff, favs, picks);
console.log('## What it learned');
for (const [f, b] of Object.entries(m.beta).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))) console.log(`- ${PL.PLABEL[f].padEnd(30)} ${b >= 0 ? '+' : '−'}${Math.abs(b).toFixed(2)}`);
const adj = Object.entries(m.u).filter(([, v]) => Math.abs(v) > 0.3).sort((a, b) => b[1] - a[1]);
console.log(`- Above their traits: ${adj.filter(x => x[1] > 0).slice(0, 10).map(([id, v]) => `${P[id].n} +${v.toFixed(1)}`).join(', ') || 'none'}`);
console.log(`- Below: ${adj.filter(x => x[1] < 0).reverse().slice(0, 10).map(([id, v]) => `${P[id].n} ${v.toFixed(1)}`).join(', ') || 'none'}`);
