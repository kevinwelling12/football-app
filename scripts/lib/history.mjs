// Loads history/<league>/<season>.json into rating pools. A pool is a set of leagues whose clubs meet each other:
// Europe (domestic leagues + UEFA cups, linked by European nights and promotion), MLS, NWSL, USL.
import fs from 'node:fs';
import { LEAGUES } from './leagues.mjs';

export const POOLS = {
  eur: Object.keys(LEAGUES).filter(k => LEAGUES[k].euro),
  mls: ['mls'], nwsl: ['nwsl'], usl: ['usl'],
};
export const poolOf = k => Object.keys(POOLS).find(p => POOLS[p].includes(k));

const DAY = 864e5;
export const dayNum = iso => Date.parse(iso) / DAY;

// All matches of a pool, oldest first: {id, lg, season, d (day number), h, a, hs, as, st, stage, n, sh, sot, o}
export function loadPool(pool, { through } = {}) {
  const teams = {}, out = [];
  for (const lg of POOLS[pool]) {
    const dir = `history/${lg}`; if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
      const s = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
      Object.assign(teams, s.teams);
      // league matches between clubs that play the season (drops all-star games and other one-offs)
      const games = {};
      for (const m of s.matches) { games[m.h] = (games[m.h] || 0) + 1; games[m.a] = (games[m.a] || 0) + 1; }
      for (const m of s.matches) {
        if (!LEAGUES[lg].uefa && (games[m.h] < 4 || games[m.a] < 4)) continue;
        if (through && m.t > through) continue;
        out.push({ ...m, lg, season: s.season, d: dayNum(m.t) });
      }
    }
  }
  out.sort((x, y) => x.d - y.d);
  return { teams, matches: out };
}

export const played = m => m.hs != null && m.as != null && ['ft', 'aet', 'pen'].includes(m.st);
// Shots and shots on target are only trusted when both sides have numbers and the match had some (old NWSL rows are zeros).
export const hasShots = m => m.sh && m.sot && m.sh[0] != null && m.sh[1] != null && m.sot[0] != null && m.sot[1] != null && (m.sh[0] + m.sh[1]) > 0;
