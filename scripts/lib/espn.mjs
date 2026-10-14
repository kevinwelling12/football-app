// ESPN public scoreboard API (site.api.espn.com: free, no key, unofficial). One day per request;
// date ranges answer 400. Responses are parsed into compact match records (see docs/data.md).
import { LEAGUES } from './leagues.mjs';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function getJSON(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { headers: { 'accept': 'application/json' } });
      if (r.ok) return await r.json();
      if (r.status === 404 || r.status === 400) return null;
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (i >= tries) throw new Error(`${url}: ${e.message}`);
      await sleep(500 * 2 ** i);
    }
  }
}

// Run fn over items with at most n in flight.
export async function pool(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
export const scoreboard = (key, day) => getJSON(`${BASE}/${LEAGUES[key].espn}/scoreboard?dates=${day}&limit=200`);

// Match days of a season. Domestic leagues list them in the calendar; UEFA calendars are stage ranges,
// so every Tuesday-Thursday in them is asked (plus the final's weekend day).
export async function seasonDays(key, season) {
  const L = LEAGUES[key];
  let lg = null;
  for (const probe of L.probes || (L.euro ? ['0915', '1022', '1203'] : ['0601', '0815'])) {
    const d = await scoreboard(key, `${season}${probe}`);
    lg = d?.leagues?.[0];
    if (lg && lg.season?.year === season && lg.calendar?.length) break;
    lg = null;
  }
  if (!lg) return [];
  const cal = lg.calendar || [];
  if (cal.length && typeof cal[0] === 'string') return [...new Set(cal.map(s => ymd(new Date(Date.parse(s) + 0))))];
  const days = new Set();
  for (const sec of cal) for (const e of (sec.entries || [sec])) {
    const a = Date.parse(e.startDate), b = Math.min(Date.parse(e.endDate), Date.parse(lg.season.endDate || e.endDate));
    for (let t = a; t <= b; t += 864e5) {
      const dt = new Date(t), wd = dt.getUTCDay();
      if (L.uefa ? (wd >= 2 && wd <= 4) || /final/i.test(e.label || '') : true) days.add(ymd(dt));
    }
  }
  return [...days].sort();
}

import { parseEvent, teamRecord } from '../../web/espn.js';
export { parseEvent, teamRecord };

// Fetch a whole season: {teams: {id: record}, matches: [...]}, sorted by kickoff.
export async function fetchSeason(key, season, { concurrency = 8, days } = {}) {
  days = days || await seasonDays(key, season);
  const teams = {}, byId = new Map();
  await pool(days, concurrency, async day => {
    const d = await scoreboard(key, day); if (!d) return;
    for (const e of d.events || []) {
      if (e.season?.year && e.season.year !== season) continue;
      const p = parseEvent(e); if (!p) continue;
      byId.set(p.m.id, p.m);
      for (const t of p.teams) if (!teams[t.id]) teams[t.id] = teamRecord(t);
    }
  });
  const matches = [...byId.values()].sort((x, y) => x.t.localeCompare(y.t) || x.id.localeCompare(y.id));
  return { league: key, season, fetched: new Date().toISOString(), teams, matches };
}
