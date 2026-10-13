// Walk-forward backtest and tuning. For each pool, refit every 7 days on matches before that day and predict the next 7 days.
// Usage: node scripts/backtest.mjs [--pool eur|mls|nwsl|usl] [--from 2021] [--tune] [--out model/params.json]
import fs from 'node:fs';
import { loadPool, played, POOLS } from './lib/history.mjs';
import { Elo, fitShotModel, fitStrength, rates } from './lib/ratings.mjs';
import { LEAGUES } from './lib/leagues.mjs';
import { attachOdds } from './lib/fdco.mjs';
import { grid, outcomes, bestPick, pickPoints, marketGrid, blend } from '../web/engine.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const pools = arg('pool') ? [arg('pool')] : Object.keys(POOLS);
const FROM = +arg('from', 2021), TUNE = process.argv.includes('--tune');
export const DEFAULT = { halfLife: 300, wGoals: 0.5, k: 6, gamma: 1.0 };

// Predict every tracked-league match from season FROM on. Returns [{m, lh, la}] (m = the match).
export function walkForward(pool, data, P, { currentOnly = false, from = FROM, only = null } = {}) {
  const { matches } = data, sm = fitShotModel(matches.filter(m => m.season < from));
  const elo = new Elo(), out = [];
  const test = matches.filter(m => LEAGUES[m.lg].track && (!only || m.lg === only) && m.season >= from && played(m) && !m.stage);
  if (!test.length) return out;
  let i = 0, ei = 0;
  for (let day = Math.floor(test[0].d); i < test.length; day += 7) {
    while (ei < matches.length && matches[ei].d < day) elo.add(matches[ei++]);
    const src = currentOnly ? matches.filter(m => m.d < day && test[i] && m.season === test[i].season && m.lg === test[i].lg) : matches;
    const fit = fitStrength(src, day, P, elo.R, sm);
    while (i < test.length && test[i].d < day + 7) {
      const m = test[i++];
      const [lh, la] = rates(fit, m, elo.R, P);
      out.push({ m, lh, la, eh: elo.R[m.h], ea: elo.R[m.a] });
    }
  }
  return out;
}

// Scores predictions with rho, draw scaling and an optional market weight.
export function score(preds, { rho = -0.08, drawK = 1, mktW = 0, onlyOdds = false } = {}) {
  let ll = 0, rps = 0, pts = 0, n = 0;
  for (const p of preds) {
    if (onlyOdds && !p.m.co) continue;
    let g = grid(p.lh, p.la, rho, drawK);
    if (mktW && p.m.co) g = blend(g, marketGrid(p.m.co, p.lh, p.la, rho), mktW);
    const r = outcomes(g), o = Math.sign(p.m.hs - p.m.as);
    ll -= Math.log(o > 0 ? r.H : o === 0 ? r.D : r.A);
    const c1 = r.H - (o > 0 ? 1 : 0), c2 = r.H + r.D - (o >= 0 ? 1 : 0); rps += (c1 * c1 + c2 * c2) / 2;
    pts += pickPoints(bestPick(g).pick, p.m.hs, p.m.as); n++;
  }
  return { n, logloss: +(ll / n).toFixed(4), rps: +(rps / n).toFixed(4), pts: +(pts / n).toFixed(3) };
}

// Market-only score on the same matches (closing odds), for reference.
function marketScore(preds) {
  const withOdds = preds.filter(p => p.m.co);
  return score(withOdds.map(p => p), { mktW: 1, onlyOdds: true });
}

function tuneDraw(preds) {
  let best = null;
  for (const rho of [0.08, 0.04, 0, -0.04, -0.08, -0.12, -0.16]) for (const drawK of [0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3]) {
    const s = score(preds, { rho, drawK }); if (!best || s.logloss < best.s.logloss) best = { rho, drawK, s };
  }
  return best;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = fs.existsSync('model/params.json') ? JSON.parse(fs.readFileSync('model/params.json', 'utf8')) : {};
  for (const pool of pools) {
    const t0 = Date.now(), data = loadPool(pool);
    for (const lg of POOLS[pool]) attachOdds(data.matches, data.teams, lg);
    let P = { ...DEFAULT, ...(results[pool]?.P || {}) };
    const run = (P) => { const preds = walkForward(pool, data, P); const d = tuneDraw(preds); return { P, preds, d }; };
    let best = run(P);
    console.log(`${pool}: start ${JSON.stringify(P)} -> ${JSON.stringify(best.d.s)} rho ${best.d.rho} drawK ${best.d.drawK} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (TUNE) {
      const grid = { halfLife: [60, 90, 120, 160, 200, 260, 350, 500], wGoals: [0, 0.1, 0.2, 0.35, 0.5, 0.7, 0.85, 1], k: [2, 4, 6, 10, 16, 24, 36, 50], gamma: [0.2, 0.35, 0.5, 0.6, 0.8, 1, 1.2, 1.6, 2, 2.5] };
      for (let pass = 0; pass < 2; pass++) for (const key of Object.keys(grid)) {
        for (const v of grid[key]) {
          if (v === best.P[key]) continue;
          const r = run({ ...best.P, [key]: v });
          if (r.d.s.logloss < best.d.s.logloss - 1e-4) { best = r; console.log(`  ${key}=${v} -> ${JSON.stringify(r.d.s)}`); }
        }
      }
    }
    const base = walkForward(pool, data, { halfLife: 120, wGoals: 1, k: 3, gamma: 0 }, { currentOnly: true });
    const baseS = score(base, { rho: -0.08 });
    const mkt = marketScore(best.preds);
    const blends = {};
    for (const w of [0, 0.25, 0.5, 0.6, 0.7, 0.8, 0.9]) blends[w] = score(best.preds, { rho: best.d.rho, drawK: best.d.drawK, mktW: w, onlyOdds: true });
    const byLeague = {};
    for (const lg of POOLS[pool].filter(l => LEAGUES[l].track)) byLeague[lg] = score(best.preds.filter(p => p.m.lg === lg), { rho: best.d.rho, drawK: best.d.drawK });
    results[pool] = { P: best.P, rho: best.d.rho, drawK: best.d.drawK, test: best.d.s, byLeague, oldStyle: baseS, market: mkt, blends, from: FROM, at: new Date().toISOString() };
    console.log(JSON.stringify(results[pool], null, 1));
  }
  fs.mkdirSync('model', { recursive: true });
  fs.writeFileSync('model/params.json', JSON.stringify(results, null, 1));
}
