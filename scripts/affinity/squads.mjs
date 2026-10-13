// Each club's regulars this season (for player research): appearances and starts counted from ESPN match lineups across
// every league we fetch (domestic + UEFA), then the 15 most-used players per club, with ESPN roster details.
// Usage: node scripts/affinity/squads.mjs [--top 15]  ->  data/affinity/squads.json
import fs from 'node:fs';
import { LEAGUES, TRACKED, currentSeason } from '../lib/leagues.mjs';
import { getJSON, pool } from '../lib/espn.mjs';

const TOP = +(process.argv[process.argv.indexOf('--top') + 1] || 15) || 15;
const WEB = 'https://site.web.api.espn.com/apis/site/v2/sports/soccer';
const clubs = {}; // espn team id -> {name, league}
for (const k of TRACKED) for (const t of JSON.parse(fs.readFileSync(`web/data/${k}.json`, 'utf8')).teams) clubs[t.id] ??= { name: t.n, league: k };
const ids = new Set(Object.keys(clubs));

// played matches this season involving our clubs, from every league file we have
const jobs = [];
for (const k of Object.keys(LEAGUES)) {
  const f = `history/${k}/${currentSeason(k)}.json`; if (!fs.existsSync(f)) continue;
  for (const m of JSON.parse(fs.readFileSync(f, 'utf8')).matches)
    if (m.hs != null && ['ft', 'aet', 'pen'].includes(m.st) && (ids.has(m.h) || ids.has(m.a))) jobs.push([LEAGUES[k].espn, m.id]);
}
console.log(`${jobs.length} match lineups to read`);
const apps = {}; // team -> athlete -> {name, apps, starts, pos}
await pool(jobs, 12, async ([slug, id]) => {
  const d = await getJSON(`${WEB}/${slug}/summary?event=${id}`).catch(() => null);
  for (const r of d?.rosters || []) {
    if (!ids.has(r.team?.id)) continue;
    const T = apps[r.team.id] ||= {};
    for (const p of r.roster || []) {
      if (!(p.starter || p.subbedIn)) continue;
      const a = T[p.athlete.id] ||= { name: p.athlete.displayName, apps: 0, starts: 0, pos: p.position?.abbreviation };
      a.apps++; if (p.starter) a.starts++;
    }
  }
});

// rosters for nationality, age, and to drop players who have left
const out = {};
await pool(Object.keys(clubs), 8, async tid => {
  const c = clubs[tid], slug = LEAGUES[c.league].espn;
  const r = await getJSON(`${WEB}/${slug}/teams/${tid}/roster`).catch(() => null);
  const roster = Object.fromEntries((r?.athletes || []).map(a => [a.id, a]));
  const counted = Object.entries(apps[tid] || {}).filter(([aid]) => !Object.keys(roster).length || roster[aid]);
  let list = counted.sort((a, b) => (b[1].starts + 0.4 * (b[1].apps - b[1].starts)) - (a[1].starts + 0.4 * (a[1].apps - a[1].starts))).slice(0, TOP)
    .map(([aid, a]) => ({ id: aid, name: a.name, apps: a.apps, starts: a.starts, pos: a.pos }));
  if (list.length < TOP) for (const [aid, a] of Object.entries(roster)) { // no lineups yet: fill from the roster
    if (list.length >= TOP) break;
    if (!list.some(x => x.id === aid)) list.push({ id: aid, name: a.displayName, apps: 0, starts: 0, pos: a.position?.abbreviation });
  }
  out[tid] = { club: c.name, league: c.league, players: list.map(p => ({ ...p, nat: roster[p.id]?.citizenship || null, age: roster[p.id]?.age || null, gender: roster[p.id]?.gender || null })) };
});
fs.writeFileSync('data/affinity/squads.json', JSON.stringify(out, null, 1));
const n = Object.values(out).reduce((s, c) => s + c.players.length, 0);
console.log(`${Object.keys(out).length} clubs, ${n} players; thin squads:`, Object.values(out).filter(c => c.players.length < 10).map(c => `${c.club} ${c.players.length}`).join(', ') || 'none');
