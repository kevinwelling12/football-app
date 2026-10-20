// Nightly sync: ESPN -> history/ (current seasons) -> ratings -> web/data/<league>.json for the app.
// Usage: node scripts/sync.mjs [--no-fetch] [--back 10]
//  - Tracked leagues: the whole current season is refetched (dates move, kickoffs get confirmed).
//  - Rating-only leagues (Europe): the last --back days are refetched and merged.
//  - Odds and pre-match predictions are kept once a match starts (ESPN drops odds after kickoff), so the
//    app can show an honest record of what the model said beforehand.
import fs from 'node:fs';
import { LEAGUES, TRACKED, currentSeason } from './lib/leagues.mjs';
import { fetchSeason, getJSON, pool } from './lib/espn.mjs';
import { loadPool, POOLS, poolOf, played, dayNum } from './lib/history.mjs';
import { Elo, fitShotModel, fitStrength, rates } from './lib/ratings.mjs';
import { matchGrid, bestPick, grid, outcomes, HOUSE, HOUSE_NEUTRAL } from '../web/engine.js';
import { walkForward, DEFAULT } from './backtest.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const FETCH = !process.argv.includes('--no-fetch'), BACK = +arg('back', 10);
const today = new Date(), ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');
const params = fs.existsSync('model/params.json') ? JSON.parse(fs.readFileSync('model/params.json', 'utf8')) : {};
const traits = JSON.parse(fs.readFileSync('data/affinity/traits.json', 'utf8'));
const pubTraits = {};
const report = [];

const fileOf = (k, s) => `history/${k}/${s}.json`;
const read = f => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);

// Keep what ESPN no longer gives once a match has started: odds, and our frozen pre-match prediction.
function mergeSeason(prev, next) {
  if (!prev) return next;
  const old = new Map(prev.matches.map(m => [m.id, m]));
  for (const m of next.matches) {
    const o = old.get(m.id); if (!o) continue;
    if (!m.o && o.o) m.o = o.o;
    if (o.pk) m.pk = o.pk;
  }
  // matches ESPN didn't return this time (outside a partial window) stay as they were
  const seen = new Set(next.matches.map(m => m.id));
  for (const m of prev.matches) if (!seen.has(m.id)) next.matches.push(m);
  next.matches.sort((x, y) => x.t.localeCompare(y.t) || x.id.localeCompare(y.id));
  next.teams = { ...prev.teams, ...next.teams };
  return next;
}

async function fetchAll() {
  for (const k of Object.keys(LEAGUES)) {
    const season = currentSeason(k), f = fileOf(k, season), prev = read(f);
    try {
      let days;
      if (!LEAGUES[k].track && prev) {
        days = []; for (let i = -BACK; i <= 3; i++) days.push(ymd(new Date(today.getTime() + i * 864e5)));
      }
      const next = await fetchSeason(k, season, { concurrency: 10, days });
      if (!next.matches.length && !prev) continue;
      const merged = mergeSeason(prev, next);
      fs.mkdirSync(`history/${k}`, { recursive: true });
      fs.writeFileSync(f, JSON.stringify(merged));
      report.push(`${k}: ${merged.matches.filter(played).length}/${merged.matches.length} played`);
    } catch (e) { report.push(`${k}: ERROR ${e.message}`); }
  }
}

// Conference membership (and ESPN's own order, for checking our tiebreakers).
async function groupsFor(k) {
  const d = await getJSON(`https://site.api.espn.com/apis/v2/sports/soccer/${LEAGUES[k].espn}/standings?season=${currentSeason(k)}`);
  const g = {}, rank = {};
  for (const c of d?.children || []) for (const e of c.standings.entries) {
    g[e.team.id] = c.name.replace(/ Conference$/, '');
    const r = e.stats.find(s => s.name === 'rank'); if (r) rank[e.team.id] = r.value;
  }
  return { g, rank };
}


async function publish() {
  const index = { updated: new Date().toISOString(), leagues: {} };
  fs.mkdirSync('web/data', { recursive: true });
  for (const pl of Object.keys(POOLS)) {
    const data = loadPool(pl), P = { ...DEFAULT, ...(params[pl]?.P || {}) };
    const rho = params[pl]?.rho ?? -0.06, drawK = params[pl]?.drawK ?? 1;
    const blends = params[pl]?.blends, mktW = pickMarketWeight(blends);
    const elo = new Elo(), now = dayNum(today.toISOString()) + 0.5;
    for (const m of data.matches) if (m.d < now) elo.add(m);
    const sm = fitShotModel(data.matches), fit = fitStrength(data.matches, now, P, elo.R, sm);
    for (const k of POOLS[pl].filter(x => LEAGUES[x].track)) {
      const season = currentSeason(k), file = fileOf(k, season), S = read(file);
      if (!S) continue;
      // if ESPN's standings fail (it sometimes refuses GitHub's runners), keep the conferences already published
      const was = Object.fromEntries((read(`web/data/${k}.json`)?.teams || []).map(t => [t.id, t]));
      const ko = LEAGUES[k].ko; // domestic cup: no table, every club drawn counts
      const { g, rank } = ko ? { g: {}, rank: {} } : await groupsFor(k).catch(e => { report.push(`${k}: standings ${e.message}, kept last conferences`); return { g: {}, rank: {} }; });
      for (const id in was) { if (!g[id] && was[id].g) g[id] = was[id].g; if (rank[id] == null && was[id].espnRank != null) rank[id] = was[id].espnRank; }
      // Liga MX: only the current tournament (Apertura or Clausura) is published, so the table is that tournament's
      const tour = LEAGUES[k].split ? currentTournament(S.matches) : null;
      const SM = tour ? S.matches.filter(m => m.tn === tour) : S.matches;
      // clubs: those with at least 4 matches this season in this competition (any, in a cup)
      const games = {}; for (const m of SM) { games[m.h] = (games[m.h] || 0) + 1; games[m.a] = (games[m.a] || 0) + 1; }
      const ids = Object.keys(S.teams).filter(id => games[id] >= (ko ? 1 : 4));
      const idx = Object.fromEntries(ids.map((id, i) => [id, i]));
      const noTraits = [];
      const teams = ids.map(id => {
        const t = S.teams[id], A = fit.A[id] ?? Math.exp(P.gamma * (((elo.R[id] ?? fit.eloMean) - fit.eloMean) / 400) / 2), D = fit.D[id] ?? 1 / A;
        // Affinity is computed in the page from researched traits (data/affinity/traits.json, keyed by ESPN id)
        if (traits[id]) { const { src, ...tr } = traits[id]; pubTraits[id] = tr; }
        else noTraits.push(`${t.n} (${id})`);
        return { id, n: t.n, s: t.s, a: t.a, c: t.c, logo: t.logo, g: g[id] || '', elo: Math.round(elo.R[id] ?? 1500), A: +A.toFixed(4), D: +D.toFixed(4), espnRank: rank[id] };
      });
      if (noTraits.length && !ko) report.push(`${k}: no Affinity traits for ${noTraits.length} club(s), research them and add them to data/affinity/traits.json: ${noTraits.join(', ')}`);
      const lg = { ...data.matches.find(m => m.lg === k) }.lg || k;
      const bk = LEAGUES[k].base || k, base = (fit.base[bk] || [1.5, 1.2]).map(x => +x.toFixed(4));
      const Pm = { rho, drawK, mktW };
      // walk-forward predictions for played matches that have none yet (first run of a season)
      const missing = SM.some(m => played(m) && (!m.pk || m.pk.wf) && !m.stage);
      let wf = new Map();
      if (missing) {
        const preds = walkForward(pl, { ...data, matches: data.matches }, P, { from: season, only: k });
        wf = new Map(preds.map(p => [p.m.id, p]));
      }
      const matches = [];
      for (const m of SM) {
        if (idx[m.h] == null || idx[m.a] == null) continue;
        const [lh, la] = rates(fit, { ...m, lg: bk }, elo.R, P);
        const out = { id: m.id, t: m.t, h: idx[m.h], a: idx[m.a], st: m.st };
        for (const f of ['hs', 'as', 'stage', 'leg', 'series', 'n', 'so', 'sh', 'sot', 'tv', 'clock']) if (m[f] != null) out[f] = m[f];
        if (!played(m) && m.st !== 'canc') {
          out.lh = +lh.toFixed(3); out.la = +la.toFixed(3);
          if (m.o) out.o = m.o;
          // the prediction as of now; frozen once the match kicks off
          if (m.st === 'pre' || m.st === 'ppd') {
            const g2 = matchGrid({ lh, la, o: m.o }, Pm), b = bestPick(g2), hp = bestPick(g2, m.n ? HOUSE_NEUTRAL : HOUSE).pick;
            m.pk = { pH: +b.H.toFixed(3), pD: +b.D.toFixed(3), pA: +b.A.toFixed(3), pick: b.pick, hp, hv: HOUSE.v, lh: out.lh, la: out.la, mkt: m.o ? 1 : 0, at: today.toISOString().slice(0, 10) };
          }
        } else if ((!m.pk || m.pk.wf) && wf.has(m.id)) {
          const p = wf.get(m.id), g2 = grid(p.lh, p.la, rho, drawK), r = outcomes(g2), b = bestPick(g2), hp = bestPick(g2, m.n ? HOUSE_NEUTRAL : HOUSE).pick;
          m.pk = { pH: +r.H.toFixed(3), pD: +r.D.toFixed(3), pA: +r.A.toFixed(3), pick: b.pick, hp, hv: HOUSE.v, lh: +p.lh.toFixed(3), la: +p.la.toFixed(3), mkt: 0, wf: 1 };
        }
        if (m.o && !out.o) out.o = m.o;
        if (m.pk) out.pk = m.pk;
        matches.push(out);
      }
      fs.writeFileSync(file, JSON.stringify(S)); // keeps the frozen predictions
      const L = { key: k, season, ...(tour ? { tour: tourName(tour) } : {}), updated: index.updated, teams, base, ucl: fit.base.ucl, P: Pm, model: { ...P, shots: sm, test: params[pl]?.byLeague?.[k] }, matches };
      fs.writeFileSync(`web/data/${k}.json`, JSON.stringify(L));
      index.leagues[k] = { teams: teams.length, matches: matches.length, played: matches.filter(m => m.hs != null && m.st !== 'live').length };
      report.push(`${k}: published ${teams.length} clubs, ${matches.length} matches, market weight ${mktW}`);
    }
  }
  fs.writeFileSync('web/data/index.json', JSON.stringify(index));
  fs.writeFileSync('web/data/traits.json', JSON.stringify(pubTraits));
  fs.copyFileSync('data/affinity/rivals.json', 'web/data/rivals.json');
  fs.copyFileSync('data/affinity/players.json', 'web/data/players.json');
}

// Liga MX tournaments ('A2026', 'C2027'): the latest one whose first match is at most a week away, so the app moves
// to the Clausura in the week before it starts.
function currentTournament(matches) {
  const first = {};
  for (const m of matches) if (m.tn && (!first[m.tn] || m.t < first[m.tn])) first[m.tn] = m.t;
  const soon = new Date(today.getTime() + 7 * 864e5).toISOString();
  const started = Object.keys(first).filter(t => first[t] <= soon).sort((a, b) => first[a].localeCompare(first[b]));
  return started.at(-1) || Object.keys(first).sort((a, b) => first[a].localeCompare(first[b]))[0] || null;
}
const tourName = tn => `${tn[0] === 'A' ? 'Apertura' : 'Clausura'} ${tn.slice(1)}`;

// The backtest scores model/market blends on matches with closing odds; take the best weight (default 0.7).
function pickMarketWeight(blends) {
  if (!blends) return 0.7;
  let best = 0.7, bl = Infinity;
  for (const [w, s] of Object.entries(blends)) if (s.n > 100 && s.logloss < bl) { bl = s.logloss; best = +w; }
  return best;
}

if (FETCH) await fetchAll();
await publish();
console.log(report.join('\n'));
if (arg('report')) fs.writeFileSync(arg('report'), report.map(l => `- ${l}`).join('\n') + '\n');
