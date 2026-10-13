// One-time (and occasional) history download: every league in LEAGUES, FIRST_SEASON..current, into history/<key>/<season>.json.
// Finished seasons already on disk are skipped unless --force. Usage: node scripts/backfill.mjs [--only epl,mls] [--from 2016] [--force]
import fs from 'node:fs';
import { LEAGUES, FIRST_SEASON, currentSeason } from './lib/leagues.mjs';
import { fetchSeason } from './lib/espn.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const only = arg('only', '') ? arg('only').split(',') : Object.keys(LEAGUES);
const from = +arg('from', FIRST_SEASON), force = process.argv.includes('--force');

for (const key of only) {
  const cur = currentSeason(key);
  for (let season = from; season <= cur; season++) {
    const file = `history/${key}/${season}.json`;
    if (!force && season < cur && fs.existsSync(file)) continue;
    const t0 = Date.now();
    try {
      const s = await fetchSeason(key, season, { concurrency: 10 });
      if (!s.matches.length) { console.log(`${key} ${season}: no matches`); continue; }
      fs.mkdirSync(`history/${key}`, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(s));
      const done = s.matches.filter(m => m.hs != null).length;
      console.log(`${key} ${season}: ${s.matches.length} matches (${done} played), ${Object.keys(s.teams).length} teams, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    } catch (e) { console.log(`${key} ${season}: ERROR ${e.message}`); }
  }
}
