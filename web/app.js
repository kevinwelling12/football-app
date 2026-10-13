// Football: page shell, data, live scores, views. Views are plain template strings rendered into #view.
import { LEAGUES, ORDER, FAVORITES } from './leagues.js';
import { prepare, standings, isPlayed, regular, simulate } from './sim.js';
import { matchGrid, bestPick, outcomes, liveGrid, marketProbs, grid as dcGrid, pickPoints, W } from './engine.js';
import { statuses, scenarios as scenFor, describe } from './clinch.js';
import { parseEvent } from './espn.js';
import { store, initSync, signIn, signOut } from './store.js';

const $ = s => document.querySelector(s);
const D = {}, SIM = {}, LIVE = {};
const SIMS = 10000;
let route = { tab: 'today', lg: localGet('lg') || 'mls', sub: localGet('sub') || 'table' };
const ui = { tableMode: 'now', ratingsLg: 'eur', week: {} };

function localGet(k) { try { return localStorage.getItem('fa-' + k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem('fa-' + k, v); } catch { /* ignore */ } }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ------------------------------------------------------------------ formatting
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
function crest(t, cls = '') {
  if (!t) return `<span class="crest ${cls}"></span>`;
  // local copies (scripts/logos.py clears ESPN's white squares); ESPN's resizer if a new club isn't saved yet
  const v = dark() ? '-d' : '', espn = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/${dark() ? '500-dark' : '500'}/${t.id}.png&w=80&h=80`;
  return `<img class="crest ${cls}" src="logos/${t.id}${v}.png" alt="" loading="lazy" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='${espn}'}else this.style.visibility='hidden'">`;
}
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const fmtTime = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', ' ');
const dayKey = t => new Date(t).toLocaleDateString('en-CA', { timeZone: tz });
function dayLabel(key) {
  const today = dayKey(Date.now()), tmw = dayKey(Date.now() + 864e5), yest = dayKey(Date.now() - 864e5);
  if (key === today) return 'Today'; if (key === tmw) return 'Tomorrow'; if (key === yest) return 'Yesterday';
  return new Date(key + 'T12:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function pct(p, status) {
  if (status === 'in') return '<span class="tick">✓</span>';
  if (status === 'out') return '<span class="cross">–</span>';
  if (p == null) return '';
  // only a proof shows certainty: unproven extremes stay ">99" / "<1" even if every simulation agrees
  if (p >= 0.995) return '>99'; if (p < 0.005) return '<1';
  return Math.round(p * 100);
}
const pctTxt = p => (p >= 0.995 ? '>99%' : p < 0.005 ? '<1%' : Math.round(p * 100) + '%');
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const toneVar = t => ({ gold: 'var(--gold)', good: 'var(--good)', ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)' }[t]);

// ------------------------------------------------------------------ data
const favIds = () => {
  const s = store.get();
  if (s.favs) return new Set(s.favs);
  const want = FAVORITES.map(n => n.toLowerCase()), ids = new Set();
  for (const k of ORDER) for (const t of D[k]?.teams || []) if (want.includes(t.n.toLowerCase())) ids.add(t.id);
  return ids;
};
const entriesFor = k => store.get().entries[k] || {};
const matchesOf = k => prepare(D[k], entriesFor(k), LIVE[k] || {});

async function loadData() {
  await Promise.all(ORDER.map(async k => {
    const r = await fetch(`data/${k}.json`, { cache: 'no-cache' });
    if (r.ok) { const L = await r.json(); L.byId = new Map(L.matches.map(m => [m.id, m])); D[k] = L; }
  }));
}

// grid for an upcoming or live match (blended with the market when there are odds)
function gridFor(L, m) {
  if (m.st === 'live') return liveGrid(m.lh, m.la, m.min ?? 45, m.rc, L.P.rho);
  return matchGrid(m, L.P);
}
function probsFor(L, m) {
  if (!m.lh) return null;
  const g = gridFor(L, m);
  if (m.st !== 'live') return outcomes(g);
  let H = 0, Dd = 0, A = 0;
  for (let h = 0; h < W; h++) for (let a = 0; a < W; a++) { const p = g[h * W + a], d = (m.hs + h) - (m.as + a); if (d > 0) H += p; else if (d === 0) Dd += p; else A += p; }
  return { H, D: Dd, A };
}

// ------------------------------------------------------------------ simulations (worker)
// a few workers so the league on screen isn't stuck behind the others
let workers = null, jobId = 0, rr = 0;
const pending = new Map();
function getWorker() {
  if (workers === null) {
    try {
      workers = Array.from({ length: Math.min(3, navigator.hardwareConcurrency || 2) }, () => {
        const w = new Worker('worker.js', { type: 'module' });
        w.onmessage = e => { const p = pending.get(e.data.id); if (p) { pending.delete(e.data.id); p(e.data); } };
        return w;
      });
    } catch { workers = false; }
  }
  return workers ? workers[rr++ % workers.length] : false;
}
const simStamp = k => JSON.stringify([entriesFor(k), LIVE[k] || {}, D[k]?.updated, [...favIds()]]);
function runSim(k) {
  const stamp = simStamp(k);
  if (SIM[k] && (SIM[k].stamp === stamp || SIM[k].running === stamp)) return;
  SIM[k] = { ...(SIM[k] || {}), running: stamp };
  const L = D[k], msg = { L: { ...L, byId: undefined }, entries: entriesFor(k), live: LIVE[k] || {}, sims: SIMS, favs: [...favIds()] };
  const done = res => {
    if (res.error) { console.error(res.error); SIM[k].running = null; return; }
    SIM[k] = { ...res, stamp }; render();
  };
  const w = getWorker();
  if (w) { const id = ++jobId; pending.set(id, done); w.postMessage({ id, ...msg }); }
  else setTimeout(() => { // no module workers: run here
    const rules = LEAGUES[k], ms = matchesOf(k), sim = simulate(L, rules, ms, { sims: 3000 }), status = statuses(L, rules, ms, sim);
    const scen = [];
    for (const z of rules.zones) for (let t = 0; t < L.teams.length; t++) {
      if (status[z.key]?.[t]) continue;
      const s = scenFor(L, rules, ms, t, z); if (s && !s.already) scen.push({ t, z: z.key, s: { match: s.match.id, clinch: s.clinch, elim: s.elim } });
    }
    done({ sim, status, scen });
  }, 0);
}

// ------------------------------------------------------------------ live scores from ESPN
const ESPN = { epl: 'eng.1', bl: 'ger.1', ucl: 'uefa.champions', mls: 'usa.1', nwsl: 'usa.nwsl', usl: 'usa.usl.1' };
async function pollLive() {
  const now = Date.now();
  for (const k of ORDER) {
    const L = D[k]; if (!L) continue;
    const near = L.matches.filter(m => !isPlayed(m) && m.st !== 'canc' && Math.abs(Date.parse(m.t) - now) < 3 * 36e5 && Date.parse(m.t) - now < 10 * 6e4);
    if (!near.length) continue;
    const days = [...new Set(near.map(m => m.t.slice(0, 10).replace(/-/g, '')))];
    let changed = false;
    for (const day of days) {
      try {
        const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN[k]}/scoreboard?dates=${day}`);
        const d = await r.json();
        for (const e of d.events || []) {
          const p = parseEvent(e); if (!p || !L.byId.has(p.m.id)) continue;
          const m = p.m; if (m.st === 'pre') continue;
          const v = { st: m.st, hs: m.hs, as: m.as, min: m.min, rc: m.rc, clock: m.clock };
          const cur = LIVE[k]?.[m.id];
          if (!cur || cur.hs !== v.hs || cur.as !== v.as || cur.st !== v.st || cur.min !== v.min) { (LIVE[k] = LIVE[k] || {})[m.id] = v; changed = true; }
        }
      } catch { /* offline: manual entry still works */ }
    }
    if (changed) { runSim(k); render(); }
  }
}

// ------------------------------------------------------------------ match rows
function matchRow(k, m, { showLeague = false, withDay = false } = {}) {
  const L = D[k], H = L.teams[m.h], A = L.teams[m.a], fav = favIds();
  const played = isPlayed(m), live = m.st === 'live';
  let time;
  if (live) time = `<span class="live">${esc(m.clock || (m.min ? m.min + "'" : 'Live'))}</span>`;
  else if (played) time = m.st === 'pen' ? 'Pens' : m.st === 'aet' ? 'AET' : 'FT';
  else if (m.st === 'ppd') time = 'Ppd'; else if (m.st === 'canc') time = 'Canc';
  else time = fmtTime(m.t);
  if (withDay && !played && !live && dayKey(m.t) !== dayKey(Date.now())) time = `<div class="tiny">${new Date(m.t).toLocaleDateString([], { weekday: 'short' })}</div>${time}`;
  const wl = side => (played ? (Math.sign(m.hs - m.as) * (side === 'h' ? 1 : -1) > 0 ? 'win' : m.hs === m.as ? '' : 'lose') : '');
  let right = '';
  if (played || live) right = `<div class="mside"><b class="score">${m.hs}</b><b class="score">${m.as}</b></div>`;
  else if (m.lh) {
    const p = probsFor(L, m);
    const lead = p.H >= p.A ? [H.a, p.H] : [A.a, p.A];
    right = `<div class="mprob"><span class="lead">${esc(lead[0])} ${Math.round(lead[1] * 100)}%</span><div class="pbar"><i class="h" style="width:${p.H * 100}%"></i><i class="d" style="width:${p.D * 100}%"></i><i class="a" style="width:${p.A * 100}%"></i></div></div>`;
  }
  const star = t => (fav.has(t.id) ? '<span class="fav">★</span>' : '');
  return `<button class="mrow" data-match="${k}:${m.id}">
    <div class="mtime">${time}${m.mine ? '<div class="mine-tag">yours</div>' : ''}${showLeague ? `<div class="tiny faint">${LEAGUES[k].tag}</div>` : ''}</div>
    <div class="mteams"><div class="tm ${wl('h')}">${crest(H)}<span>${esc(H.s)}</span>${star(H)}</div><div class="tm ${wl('a')}">${crest(A)}<span>${esc(A.s)}</span>${star(A)}</div></div>
    ${right}</button>`;
}
const lgLabel = k => `<div class="lg-label"><span class="dot" style="background:${LEAGUES[k].color}"></span>${LEAGUES[k].name}</div>`;

// ------------------------------------------------------------------ Today
function viewToday() {
  const now = Date.now(), fav = favIds(), out = [];
  // your clubs
  const cards = [], seen = new Set();
  for (const k of ['epl', 'bl', 'mls', 'nwsl', 'usl', 'ucl']) {
    const L = D[k]; if (!L) continue;
    L.teams.forEach((t, i) => { if (fav.has(t.id) && !seen.has(t.id)) { seen.add(t.id); cards.push(clubCard(k, i)); } });
  }
  const todays = []; for (const k of ORDER) if (D[k]) for (const m of matchesOf(k)) if (dayKey(m.t) === dayKey(now)) todays.push([k, m]);
  out.push(featureCard('Match of the day', featured(todays, 'day:' + dayKey(now))));
  if (cards.length) out.push(`<div class="section"><h2>Your clubs</h2></div><div class="card row-gap">${cards.join('')}</div>`);
  // live
  const live = [];
  for (const k of ORDER) if (D[k]) for (const m of matchesOf(k)) if (m.st === 'live') live.push([k, m]);
  if (live.length) out.push(`<div class="section"><h2>Live</h2></div><div class="card row-gap">${live.map(([k, m]) => matchRow(k, m, { showLeague: true })).join('')}</div>`);
  // the next three match days (today included, with its results)
  const byDay = new Map();
  for (const k of ORDER) if (D[k]) for (const m of matchesOf(k)) {
    const t = Date.parse(m.t); if (t < now - 18 * 36e5 && dayKey(t) !== dayKey(now)) continue;
    if (m.st === 'live') continue;
    const dk = dayKey(t); (byDay.get(dk) || byDay.set(dk, []).get(dk)).push([k, m]);
  }
  const days = [...byDay.keys()].sort().filter(d => d >= dayKey(now)).slice(0, 3);
  for (const dk of days) {
    const list = byDay.get(dk);
    const parts = ORDER.map(k => { const ms = list.filter(x => x[0] === k).sort((a, b) => a[1].t.localeCompare(b[1].t)); return ms.length ? lgLabel(k) + ms.map(([, m]) => matchRow(k, m)).join('') : ''; }).join('');
    out.push(`<div class="section"><h2>${dayLabel(dk)}</h2><span class="aside">${list.length} matches</span></div><div class="card">${parts}</div>`);
  }
  if (!days.length) out.push('<div class="empty">No matches in the next few days.</div>');
  return out.join('');
}

// headline zone for a club: the first one still in doubt (else the post-season title)
function headline(k, i) {
  const S = SIM[k]?.sim; if (!S) return null;
  const t = S.teams[i], rules = LEAGUES[k];
  let best = null;
  for (const z of rules.zones) {
    const p = t.zone[z.key]; if (p <= 0.005 || p >= 0.995) continue;
    if (!best || Math.abs(p - 0.5) < Math.abs(best.p - 0.5)) best = { p, label: z.tone === 'bad' ? 'Relegation' : z.short };
  }
  if (best) return best;
  const champ = t.rounds.champ; if (champ != null) return { p: champ, label: rules.playoffs?.type === 'ucl' ? 'Win it' : 'Champion' };
  const title = t.zone.title ?? t.zone.shield; return title != null ? { p: title, label: 'Title' } : null;
}

function clubCard(k, i) {
  const L = D[k], t = L.teams[i], ms = matchesOf(k), rules = LEAGUES[k];
  const st = standings(L, ms, rules).rows[i];
  const next = ms.find(m => (m.h === i || m.a === i) && !isPlayed(m) && m.st !== 'canc');
  const hl = headline(k, i);
  const where = `${ord(st.pos)}${rules.groups ? ' in the ' + st.group.replace(/ern$/, '') : ''} · ${st.pts} pts`;
  let nx = '';
  if (next) { const opp = L.teams[next.h === i ? next.a : next.h]; nx = `${next.st === 'live' ? 'Live' : dayLabel(dayKey(next.t)) + ' ' + fmtTime(next.t)} · ${next.h === i ? 'vs' : 'at'} ${esc(opp.s)}`; }
  return `<button class="club-card" data-club="${k}:${i}">${crest(t, 'lg')}<div><div><b>${esc(t.n)}</b> <span class="faint small">${LEAGUES[k].tag}</span></div><div class="meta">${where}</div><div class="meta">${nx}</div></div>
    ${hl ? `<div><div class="big-num">${pctTxt(hl.p)}</div><div class="tiny muted" style="text-align:right">${esc(hl.label)}</div></div>` : '<div></div>'}</button>`;
}

// ------------------------------------------------------------------ League views
function viewLeague() {
  const k = route.lg, L = D[k]; if (!L) return '<div class="spinner">Loading…</div>';
  runSim(k);
  if (route.sub === 'matches') return viewMatches(k);
  if (route.sub === 'odds') return viewOdds(k);
  if (route.sub === 'scenarios') return viewScenarios(k);
  return viewTable(k);
}

function viewMatches(k) {
  const ms = matchesOf(k).filter(m => m.st !== 'canc');
  // weeks (Monday-Sunday); start on the week with the next match
  const wk = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const weeks = [...new Set(ms.map(m => wk(m.t)))].sort((a, b) => a - b);
  const nextM = ms.find(m => !isPlayed(m)) || ms[ms.length - 1];
  let cur = ui.week[k] ?? weeks.indexOf(wk(nextM.t)); cur = Math.max(0, Math.min(weeks.length - 1, cur)); ui.week[k] = cur;
  const inWeek = ms.filter(m => wk(m.t) === weeks[cur]);
  const byDay = new Map(); for (const m of inWeek) { const d = dayKey(m.t); (byDay.get(d) || byDay.set(d, []).get(d)).push(m); }
  const label = new Date(weeks[cur]).toLocaleDateString([], { month: 'short', day: 'numeric' });
  const motw = featureCard('Match of the week', featured(inWeek.map(m => [k, m]), `${k}:${weeks[cur]}`));
  let html = motw + `<div class="section"><h2>Week of ${label}</h2><span class="toggle"><button data-week="-1" aria-label="Previous week">‹</button><button data-week="0">This week</button><button data-week="1" aria-label="Next week">›</button></span></div>`;
  for (const [d, list] of [...byDay].sort()) html += `<div class="section"><h2 style="font-size:12px">${dayLabel(d)}</h2></div><div class="card row-gap">${list.map(m => matchRow(k, m)).join('')}</div>`;
  if (!inWeek.length) html += '<div class="empty">No matches this week.</div>';
  return html;
}

function zoneColor(rules, pos, scope) {
  for (const z of rules.zones) if ((z.scope || 'all') === scope && pos >= z.from && pos <= z.to && z.key !== 'title' && z.key !== 'shield') return toneVar(z.tone);
  for (const z of rules.zones) if ((z.scope || 'all') === scope && pos >= z.from && pos <= z.to) return toneVar(z.tone);
  return 'transparent';
}

function viewTable(k) {
  const L = D[k], rules = LEAGUES[k], ms = matchesOf(k), st = standings(L, ms, rules), S = SIM[k]?.sim, fav = favIds();
  const scope = rules.groups ? 'group' : 'all', proj = ui.tableMode === 'proj' && S;
  let html = `<div class="section"><h2>${proj ? 'Projected finish' : 'Standings'}</h2><span class="toggle"><button data-tmode="now" class="${!proj ? 'on' : ''}">Now</button><button data-tmode="proj" class="${proj ? 'on' : ''}">Projected</button></span></div>`;
  for (const g of st.groups) {
    let rows = g.idx.map(i => st.rows[i]);
    if (proj) rows = rows.slice().sort((a, b) => S.teams[a.i].avgPos - S.teams[b.i].avgPos);
    else rows.sort((a, b) => a.pos - b.pos);
    const cuts = new Set(rules.zones.filter(z => (z.scope || 'all') === scope && z.key !== 'title' && z.key !== 'shield').flatMap(z => [z.from - 1, z.to]));
    const head = proj
      ? `<tr><th>#</th><th class="club">${esc(g.name || 'Club')}</th><th>Pts</th><th class="wide">Range</th><th>Avg</th></tr>`
      : `<tr><th>#</th><th class="club">${esc(g.name || 'Club')}</th><th>P</th><th class="wide">W</th><th class="wide">D</th><th class="wide">L</th><th class="wide">GF</th><th class="wide">GA</th><th>GD</th><th>Pts</th></tr>`;
    const body = rows.map((r, n) => {
      const pos = n + 1, t = L.teams[r.i], T = S?.teams[r.i];
      const cls = `click${cuts.has(n) && n ? ' cut' : ''}${fav.has(t.id) ? ' me' : ''}`;
      const name = `<td class="club"><div class="cl">${crest(t)}<span>${esc(t.s)}</span>${fav.has(t.id) ? '<span class="faint">★</span>' : ''}</div></td>`;
      const z = `style="--z:${zoneColor(rules, pos, scope)}"`;
      if (proj) return `<tr class="${cls}" data-club="${k}:${r.i}"><td class="pos" ${z}>${pos}</td>${name}<td class="pts">${Math.round(T.pts)}</td><td class="wide muted">${T.ptsRange[0]}–${T.ptsRange[1]}</td><td class="muted">${T.avgPos.toFixed(1)}</td></tr>`;
      return `<tr class="${cls}" data-club="${k}:${r.i}"><td class="pos" ${z}>${pos}</td>${name}<td>${r.p}</td><td class="wide">${r.w}</td><td class="wide">${r.d}</td><td class="wide">${r.l}</td><td class="wide">${r.gf}</td><td class="wide">${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td></tr>`;
    }).join('');
    html += `<div class="card" style="margin-bottom:10px"><table>${head}${body}</table></div>`;
  }
  html += `<div class="legend">${rules.zones.filter(z => z.key !== 'title' && z.key !== 'shield').map(z => `<span style="--z:${toneVar(z.tone)}">${esc(z.label)}</span>`).join('')}</div>`;
  if (proj) html += `<p class="note">Average points and the likely range (80% of ${SIMS.toLocaleString()} simulated seasons), ordered by average finish.</p>`;
  else if (!S) html += '<p class="note">Running simulations…</p>';
  if (rules.note) html += `<p class="note">${esc(rules.note)}</p>`;
  return html;
}

const colLabel = (rules, key) => rules.zones.find(z => z.key === key)?.short || { champ: 'Win' }[key] || key;

function viewOdds(k) {
  const L = D[k], rules = LEAGUES[k], R = SIM[k]?.sim ? SIM[k] : null; if (!R) return '<div class="spinner">Simulating…</div>';
  const S = R.sim, st = standings(L, matchesOf(k), rules), fav = favIds();
  const cols = rules.columns, roundsAll = S.rounds;
  const groups = st.groups;
  let html = `<div class="section"><h2>Race</h2><span class="aside">${SIMS.toLocaleString()} seasons</span></div>`;
  for (const g of groups) {
    const rows = g.idx.slice().sort((a, b) => S.teams[a].avgPos - S.teams[b].avgPos);
    html += `<div class="card" style="margin-bottom:10px"><table><tr><th class="club">${esc(g.name || 'Club')}</th><th class="wide">Pts</th>${cols.map(c => `<th>${esc(colLabel(rules, c))}</th>`).join('')}</tr>`;
    for (const i of rows) {
      const t = L.teams[i], T = S.teams[i];
      const cells = cols.map(c => {
        const isZone = rules.zones.some(z => z.key === c);
        const p = isZone ? T.zone[c] : T.rounds[c] ?? 0, status = isZone ? R.status[c]?.[i] : null;
        const z = rules.zones.find(z => z.key === c), tone = z ? toneVar(z.tone) : 'var(--gold)';
        const heat = status ? 0 : p * 0.32;
        return `<td class="pct"><span class="heat" style="background:${tone};opacity:${heat}"></span><b>${pct(p, status)}</b></td>`;
      }).join('');
      html += `<tr class="click${fav.has(t.id) ? ' me' : ''}" data-club="${k}:${i}"><td class="club"><div class="cl">${crest(t)}<span>${esc(t.s)}</span></div></td><td class="muted wide">${Math.round(T.pts)}</td>${cells}</tr>`;
    }
    html += '</table></div>';
  }
  html += `<p class="note">Percent chance from ${SIMS.toLocaleString()} simulated seasons. ✓ = clinched, – = eliminated (proven, not simulated). ${roundsAll.length ? 'Post-season brackets follow the competition\'s format; higher seeds host.' : ''} Match odds blend our model with ${blendLabel(L)}.</p>`;
  return html;
}
// ---- match importance / match of the week
const fixInfo = (k, id) => SIM[k]?.sim?.fixtures.find(f => f.id === id);
const zoneName = (k, key) => (key === 'champ' ? (LEAGUES[k].playoffs?.type === 'ucl' ? 'Win the competition' : 'Win the title') : LEAGUES[k].zones.find(z => z.key === key)?.label || key);
function stakeLine(k, m, s) {
  const t = D[k].teams[s.side ? m.a : m.h], win = s.side ? s.A : s.H, loss = s.side ? s.H : s.A;
  return { team: t, zone: zoneName(k, s.key), win, draw: s.D, loss };
}
// pick = highest blend of importance (vs the best in the set) and closeness; locked once the chosen match kicks off
function featured(list, lockKey) {
  const scored = list.map(([k, m]) => { const f = fixInfo(k, m.id); if (!f) return null; const p = f.p; return { k, m, f, close: 1 - Math.abs(p[0] - p[2]) }; }).filter(Boolean);
  const stored = store.get().motw?.[lockKey];
  if (stored) {
    const hit = list.find(([k, m]) => `${k}:${m.id}` === stored);
    if (hit && (Date.parse(hit[1].t) <= Date.now() || isPlayed(hit[1]) || hit[1].st === 'live')) return { k: hit[0], m: hit[1], f: fixInfo(hit[0], hit[1].id), locked: true };
  }
  if (!scored.length) return null;
  const mx = Math.max(...scored.map(x => x.f.imp)) || 1;
  for (const x of scored) x.score = 0.75 * x.f.imp / mx + 0.25 * x.close;
  const best = scored.sort((a, b) => b.score - a.score)[0], id = `${best.k}:${best.m.id}`;
  if (stored !== id) setTimeout(() => store.set(s => { (s.motw || (s.motw = {}))[lockKey] = id; }), 0);
  return best;
}
function featureCard(title, x) {
  if (!x) return '';
  const s = x.f?.swings?.[0], line = s ? stakeLine(x.k, x.m, s) : null;
  const why = line ? `<div class="small muted" style="padding:0 16px 12px 82px">${esc(line.team.s)}: ${esc(line.zone.toLowerCase())} ${pctTxt(line.win)} with a win, ${pctTxt(line.loss)} with a loss</div>` : '';
  return `<div class="section"><h2>${title}</h2><span class="aside">${LEAGUES[x.k].tag}</span></div><div class="card">${matchRow(x.k, x.m, { withDay: true })}${why}</div>`;
}

const blendLabel = L => `the betting line where there is one (${Math.round(L.P.mktW * 100)}% market)`;

function viewScenarios(k) {
  const L = D[k], rules = LEAGUES[k], R = SIM[k]?.sim ? SIM[k] : null; if (!R) return '<div class="spinner">Working out scenarios…</div>';
  const fav = favIds(), S = R.sim;
  let html = '';
  // this round
  const items = R.scen.map(x => ({ ...x, team: L.teams[x.t], zone: rules.zones.find(z => z.key === x.z), p: S.teams[x.t].zone[x.z] }))
    // worth showing: your clubs, a clinch that's in play, or an elimination that would matter
    .filter(x => x.zone && (fav.has(x.team.id) || (Object.keys(x.s.clinch).length && x.p > 0.02) || (Object.keys(x.s.elim).length && x.p > 0.03)))
    .sort((a, b) => (fav.has(b.team.id) - fav.has(a.team.id)) || rules.zones.indexOf(a.zone) - rules.zones.indexOf(b.zone) || b.p - a.p);
  html += `<div class="section"><h2>This round</h2></div>`;
  if (items.length) {
    html += '<div class="card row-gap">' + items.map(x => {
      const m = L.byId.get(x.s.match), opp = L.teams[m.h === x.t ? m.a : m.h];
      const lines = describeLines(x.s);
      return `<div class="scen"><h3>${crest(x.team)}${esc(x.team.s)}${fav.has(x.team.id) ? ' <span class="faint">★</span>' : ''}</h3>
        <div class="sub">${esc(x.zone.label)} · ${pctTxt(x.p)} now · ${m.h === x.t ? 'vs' : 'at'} ${esc(opp.s)}, ${dayLabel(dayKey(m.t))}</div>
        <ul>${lines.map(l => `<li><span class="k ${l.kind === 'clinch' ? 'in' : 'out'}">${l.kind === 'clinch' ? (x.zone.tone === 'bad' ? 'DOWN' : 'IN') : (x.zone.tone === 'bad' ? 'SAFE' : 'OUT')}</span><span>${esc(l.text)}</span></li>`).join('')}</ul></div>`;
    }).join('') + '</div>';
  } else html += '<div class="card empty">Nothing can be decided in the next round.</div>';
  // decided so far
  html += `<div class="section"><h2>Decided</h2></div><div class="card">`;
  let any = false;
  for (const z of rules.zones) {
    const s = R.status[z.key] || {}, ins = Object.keys(s).filter(i => s[i] === 'in').map(Number), outs = Object.keys(s).filter(i => s[i] === 'out').map(Number);
    const bad = z.tone === 'bad' || z.tone === 'warn';
    const inL = bad ? 'Confirmed' : 'Clinched', total = L.teams.length;
    if (!ins.length && !(outs.length && outs.length < total - 1)) continue;
    any = true;
    html += `<div class="lg-label" style="padding-top:14px">${esc(z.label)}</div>`;
    if (ins.length) html += `<div class="pillrow"><span class="tiny muted" style="align-self:center">${inL}</span>${ins.map(i => `<span class="pill">${crest(L.teams[i])}${esc(L.teams[i].s)}</span>`).join('')}</div>`;
    if (outs.length && !bad && outs.length <= 12) html += `<div class="pillrow"><span class="tiny muted" style="align-self:center">Out</span>${outs.map(i => `<span class="pill faint">${esc(L.teams[i].s)}</span>`).join('')}</div>`;
  }
  if (!any) html += '<div class="empty">Nothing decided yet.</div>';
  html += '</div><p class="note">A place counts as clinched only when no combination of remaining results can take it away (finishing level on points counts against the club, so tiebreakers can only help). Scenarios cover the club\'s next match and its rivals\' matches in the same round.</p>';
  return html;
}

function describeLines(sc) {
  const lines = [];
  const word = { W: 'Win', D: 'Draw', L: 'Lose' };
  for (const kind of ['clinch', 'elim']) for (const r of ['W', 'D', 'L']) {
    const c = sc[kind]?.[r]; if (!c) continue;
    if (!c.length) { lines.push({ kind, text: word[r] }); continue; }
    const conds = c.slice(0, 2).map(conj => conj.join(' and '));
    lines.push({ kind, text: `${word[r]}, if ${conds.join(', or if ')}${c.length > 2 ? ' (or other combinations)' : ''}` });
  }
  return lines;
}

// ------------------------------------------------------------------ Picks
function viewPicks() {
  const now = Date.now(), up = [], done = [];
  for (const k of ORDER) if (D[k]) for (const m of matchesOf(k)) {
    if (m.stage && !m.lh && !m.pk) continue;
    if (!isPlayed(m) && m.st !== 'canc' && m.st !== 'live' && m.lh && Date.parse(m.t) - now < 8 * 864e5) up.push([k, m]);
    if (isPlayed(m) && m.pk && !m.mine) done.push([k, m]);
  }
  let html = `<div class="section"><h2>FotMob picks</h2><span class="aside">2 pts result · +1 exact</span></div>`;
  // record
  const rec = {}; let P = 0, N = 0, R = 0, X = 0;
  for (const [k, m] of done) {
    const pts = pickPoints(m.pk.pick, m.hs, m.as); if (pts == null) continue;
    const r = rec[k] || (rec[k] = { n: 0, p: 0, res: 0, ex: 0 });
    r.n++; r.p += pts; r.res += pts > 0; r.ex += pts === 3; N++; P += pts; R += pts > 0; X += pts === 3;
  }
  html += `<div class="card"><div class="stats"><div class="stat"><b>${N ? (P / N).toFixed(2) : '–'}</b><span>points a match</span></div><div class="stat"><b>${N ? Math.round(R / N * 100) + '%' : '–'}</b><span>right result</span></div><div class="stat"><b>${N ? Math.round(X / N * 100) + '%' : '–'}</b><span>exact score</span></div></div>
    <table><tr><th class="club">This season</th><th>Matches</th><th>Pts</th><th>Per match</th></tr>${ORDER.filter(k => rec[k]).map(k => `<tr><td class="club">${LEAGUES[k].name}</td><td>${rec[k].n}</td><td>${rec[k].p}</td><td class="pts">${(rec[k].p / rec[k].n).toFixed(2)}</td></tr>`).join('')}</table></div>
    <p class="note">The record uses the pick the model would have made before each match (picks from before this app existed were worked out from data available at the time, without betting lines).</p>`;
  // upcoming by day
  const byDay = new Map(); for (const x of up) { const d = dayKey(x[1].t); (byDay.get(d) || byDay.set(d, []).get(d)).push(x); }
  for (const [d, list] of [...byDay].sort()) {
    html += `<div class="section"><h2>${dayLabel(d)}</h2></div><div class="card">`;
    for (const k of ORDER) {
      const ms = list.filter(x => x[0] === k).sort((a, b) => a[1].t.localeCompare(b[1].t)); if (!ms.length) continue;
      html += lgLabel(k) + ms.map(([, m]) => pickRow(k, m)).join('');
    }
    html += '</div>';
  }
  if (!up.length) html += '<div class="empty">No upcoming matches in the next week.</div>';
  return html;
}
function pickRow(k, m) {
  const L = D[k], H = L.teams[m.h], A = L.teams[m.a], g = gridFor(L, m), b = bestPick(g);
  const mine = store.get().picks[m.id];
  return `<button class="pick" data-match="${k}:${m.id}"><div class="mteams"><div class="tm">${crest(H)}<span>${esc(H.s)}</span></div><div class="tm">${crest(A)}<span>${esc(A.s)}</span></div><div class="tiny faint">${fmtTime(m.t)}${m.o ? ' · with betting line' : ''}</div></div>
    <div><div class="big">${b.pick[0]}–${b.pick[1]}</div><div class="ev">${b.ev.toFixed(2)} exp. pts${mine ? ` · yours ${mine[0]}–${mine[1]}` : ''}</div></div></button>`;
}

// ------------------------------------------------------------------ Clubs
function viewClubs() {
  const fav = favIds();
  let html = '';
  const cards = [], seen = new Set();
  for (const k of ['epl', 'bl', 'mls', 'nwsl', 'usl', 'ucl']) if (D[k]) D[k].teams.forEach((t, i) => { if (fav.has(t.id) && !seen.has(t.id)) { seen.add(t.id); cards.push(clubCard(k, i)); } });
  html += `<div class="section"><h2>Your clubs</h2><span class="aside">tap ☆ on any club to follow</span></div><div class="card row-gap">${cards.join('') || '<div class="empty">None yet.</div>'}</div>`;
  // ratings: Europe is one Elo scale (linked through UEFA matches); each US league is its own
  const POOLS = { eur: ['epl', 'bl', 'ucl'], mls: ['mls'], nwsl: ['nwsl'], usl: ['usl'] }, PN = { eur: 'Europe', mls: 'MLS', nwsl: 'NWSL', usl: 'USL' };
  const sel = POOLS[ui.ratingsLg] ? ui.ratingsLg : 'eur';
  html += `<div class="section"><h2>Power ratings</h2></div><nav class="chips" style="padding:0 0 10px">${Object.keys(POOLS).map(k => `<button class="chip ${sel === k ? 'on' : ''}" data-rlg="${k}">${PN[k]}</button>`).join('')}</nav>`;
  const rows = [], seen2 = new Set();
  for (const k of POOLS[sel]) D[k]?.teams.forEach((t, i) => { if (!seen2.has(t.id)) { seen2.add(t.id); rows.push([k, i, t]); } });
  // expected goal difference a match against an average side in the club's league (from the attack/defence fit)
  const strength = (k, t) => { const b = D[k].base, avg = (b[0] + b[1]) / 2; return avg * t.A - avg * t.D; };
  rows.sort((a, b) => b[2].elo - a[2].elo);
  html += `<div class="card"><table><tr><th>#</th><th class="club">Club</th><th>Elo</th><th>${sel === 'eur' ? 'League' : 'Goals ±'}</th></tr>${rows.slice(0, 50).map(([k, i, t], n) => `<tr class="click${fav.has(t.id) ? ' me' : ''}" data-club="${k}:${i}"><td class="pos">${n + 1}</td><td class="club"><div class="cl">${crest(t)}<span>${esc(t.s)}</span></div></td><td class="pts">${t.elo}</td><td class="muted">${sel === 'eur' ? LEAGUES[k].tag : fmtSigned(strength(k, t))}</td></tr>`).join('')}</table></div>
    <p class="note">Elo is computed here from ten seasons of ESPN results. European clubs share one scale through UEFA matches (with the Championship and 2. Bundesliga for promoted clubs); MLS, NWSL and USL each have their own. "Goals ±" is the model's expected goal difference a match against an average side in that league.</p>`;
  // affinity
  html += `<div class="section"><h2>Affinity</h2><span class="aside">provisional</span></div>`;
  const aff = [], seen3 = new Set();
  for (const k of ['epl', 'bl', 'mls', 'nwsl', 'usl', 'ucl']) D[k]?.teams.forEach((t, i) => { if (t.aff != null && !seen3.has(t.id)) { seen3.add(t.id); aff.push([k, i, t]); } });
  aff.sort((a, b) => b[2].aff - a[2].aff);
  html += `<div class="card"><table><tr><th>#</th><th class="club">Club</th><th>League</th><th>Affinity</th></tr>${aff.slice(0, 25).map(([k, i, t], n) => `<tr class="click" data-club="${k}:${i}"><td class="pos">${n + 1}</td><td class="club"><div class="cl">${crest(t)}<span>${esc(t.s)}</span></div></td><td class="muted">${LEAGUES[k].tag}</td><td class="pts">${Math.round(t.aff)}</td></tr>`).join('')}</table></div>
    <p class="note">Starting point only: your five clubs at 100, everyone else carried over from the old app's archetype scores. We'll revisit the method.</p>`;
  return html;
}
const fmtSigned = x => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);

// ------------------------------------------------------------------ sheets
function openSheet(html) { $('#sheet-body').innerHTML = html; $('#sheet').hidden = false; $('#scrim').hidden = false; $('#sheet').scrollTop = 0; document.body.style.overflow = 'hidden'; }
function closeSheet() { $('#sheet').hidden = true; $('#scrim').hidden = true; document.body.style.overflow = ''; sheetCtx = null; }
let sheetCtx = null;

function matchSheet(k, id) {
  const L = D[k], m = matchesOf(k).find(x => x.id === id); if (!m) return;
  sheetCtx = { type: 'match', k, id };
  const H = L.teams[m.h], A = L.teams[m.a], played = isPlayed(m), live = m.st === 'live';
  const when = new Date(m.t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  let mid = played || live ? `${m.hs}–${m.as}<small>${live ? esc(m.clock || m.min + "'") : m.st === 'pen' ? `Pens ${m.so?.join('–') || ''}` : 'Full time'}</small>` : `${fmtTime(m.t)}<small>${dayLabel(dayKey(m.t))}</small>`;
  let html = `<div class="head"><div class="small muted">${LEAGUES[k].name}${m.stage ? ' · ' + esc(m.stage.replace(/-+/g, ' ')) : ''} · ${when}${m.tv ? ' · ' + esc(m.tv) : ''}</div></div>
    <div class="vs"><button class="side" data-club="${k}:${m.h}">${crest(H, 'lg')}${esc(H.s)}</button><div class="mid">${mid}</div><button class="side" data-club="${k}:${m.a}">${crest(A, 'lg')}${esc(A.s)}</button></div>`;
  // probabilities
  const p = m.lh ? probsFor(L, m) : m.pk ? { H: m.pk.pH, D: m.pk.pD, A: m.pk.pA } : null;
  if (p) {
    html += `<div class="block"><h4>${played ? 'Before kickoff' : live ? 'From here' : 'Chances'}</h4>
      <div class="tri"><i class="h" style="width:${p.H * 100}%"></i><i class="d" style="width:${p.D * 100}%"></i><i class="a" style="width:${p.A * 100}%"></i></div>
      <div class="tri-labels"><span><b>${pctTxt(p.H)}</b> ${esc(H.a)}</span><span><b>${pctTxt(p.D)}</b> Draw</span><span><b>${pctTxt(p.A)}</b> ${esc(A.a)}</span></div>`;
    if (!played && !live && m.lh) {
      const model = outcomes(dcGrid(m.lh, m.la, L.P.rho, L.P.drawK)), mk = m.o ? marketProbs(m.o) : null;
      html += `<div class="kv" style="margin-top:12px"><div class="hd">&nbsp;</div><div class="hd">${esc(H.a)}</div><div class="hd">Draw</div><div class="hd">${esc(A.a)}</div>
        <div>Our model</div><div>${pctTxt(model.H)}</div><div>${pctTxt(model.D)}</div><div>${pctTxt(model.A)}</div>
        ${mk ? `<div>${esc(m.o.p || 'Market')}</div><div>${pctTxt(mk.H)}</div><div>${pctTxt(mk.D)}</div><div>${pctTxt(mk.A)}</div>` : ''}
        <div>Expected goals</div><div>${m.lh.toFixed(2)}</div><div></div><div>${m.la.toFixed(2)}</div>
        <div>Elo</div><div>${H.elo}</div><div></div><div>${A.elo}</div></div>`;
    }
    html += '</div>';
  }
  // what's at stake
  const fi = fixInfo(k, m.id);
  if (fi?.swings?.length) {
    html += `<div class="block"><h4>What's at stake</h4><div class="kv"><div class="hd"></div><div class="hd">Win</div><div class="hd">Draw</div><div class="hd">Loss</div>
      ${fi.swings.map(s => { const x = stakeLine(k, m, s); return `<div>${esc(x.team.s)} · ${esc(x.zone)}</div><div>${pctTxt(x.win)}</div><div class="muted">${x.draw == null ? '–' : pctTxt(x.draw)}</div><div class="muted">${pctTxt(x.loss)}</div>`; }).join('')}</div></div>`;
  }
  // pick
  if (!played && m.lh && !live) {
    const b = bestPick(gridFor(L, m));
    html += `<div class="block"><h4>FotMob pick</h4><div class="kv"><div>Best pick</div><div style="font-weight:700;font-size:18px">${b.pick[0]}–${b.pick[1]}</div><div></div><div class="muted">${b.ev.toFixed(2)} pts</div>
      ${b.top.slice(1, 4).map(x => `<div class="faint">or</div><div>${x.h}–${x.a}</div><div></div><div class="faint">${x.ev.toFixed(2)} pts</div>`).join('')}</div>
      <p class="note" style="margin:8px 18px">Expected points = 2 × chance of the result + 1 × chance of the exact score.</p></div>`;
  } else if (played && m.pk) {
    const pts = pickPoints(m.pk.pick, m.hs, m.as);
    html += `<div class="block"><h4>Pick</h4><div class="kv"><div>Model pick${m.pk.wf ? ' (worked out after)' : ''}</div><div style="font-weight:700">${m.pk.pick[0]}–${m.pk.pick[1]}</div><div></div><div class="${pts === 3 ? 'exact' : pts ? 'hit' : 'miss'}">${pts} pts</div></div></div>`;
  }
  if (m.sh) html += `<div class="block"><h4>Match stats</h4><div class="kv"><div class="hd"></div><div class="hd">${esc(H.a)}</div><div class="hd"></div><div class="hd">${esc(A.a)}</div><div>Shots</div><div>${m.sh[0]}</div><div></div><div>${m.sh[1]}</div><div>On target</div><div>${m.sot[0]}</div><div></div><div>${m.sot[1]}</div></div></div>`;
  // your entry
  const e = entriesFor(k)[id], orig = D[k].byId.get(id);
  const eh = e?.hs ?? m.hs ?? 0, ea = e?.as ?? m.as ?? 0;
  if (!isPlayed(orig) || e) {
    html += `<div class="block"><h4>Enter a score</h4><div class="entry">
      <div class="stepper" data-side="h"><button data-step="-1">−</button><output>${eh}</output><button data-step="1">+</button></div>
      <div class="stepper" data-side="a"><button data-step="-1">−</button><output>${ea}</output><button data-step="1">+</button></div></div>
      <div class="field"><span>Minute (for a match in progress)</span><input type="number" id="e-min" min="1" max="120" value="${e?.live ? e.min : ''}" placeholder="—"></div>
      <div class="btns"><button class="btn" data-save="live">Save as live</button><button class="btn primary" data-save="ft">Save full time</button></div>
      ${e ? '<div class="btns"><button class="btn quiet" data-save="clear">Clear my entry</button></div>' : ''}
      ${e && isPlayed(orig) && (orig.hs !== e.hs || orig.as !== e.as) ? `<p class="note" style="margin:8px 18px">ESPN has ${orig.hs}–${orig.as}. Yours is used until you clear it.</p>` : ''}</div>`;
  }
  openSheet(html);
}

function clubSheet(k, i) {
  const L = D[k], t = L.teams[i], rules = LEAGUES[k], ms = matchesOf(k), st = standings(L, ms, rules).rows[i], R = SIM[k]?.sim ? SIM[k] : null, fav = favIds();
  sheetCtx = { type: 'club', k, i };
  const b = L.base, avg = (b[0] + b[1]) / 2;
  let html = `<div class="vs" style="grid-template-columns:auto 1fr auto;text-align:left;padding:14px 18px">${crest(t, 'lg')}<div><div style="font-size:19px;font-weight:700">${esc(t.n)}</div><div class="small muted">${LEAGUES[k].name} · ${ord(st.pos)}${rules.groups ? ' in the ' + esc(st.group.replace(/ern$/, '')) : ''} · ${st.pts} pts</div></div><button class="star ${fav.has(t.id) ? 'on' : ''}" data-star="${t.id}" aria-label="Follow">${fav.has(t.id) ? '★' : '☆'}</button></div>`;
  html += `<div class="kv"><div>Elo</div><div>${t.elo}</div><div></div><div></div>
    <div>Attack</div><div>${(avg * t.A).toFixed(2)}</div><div></div><div class="muted small">goals / match</div>
    <div>Defence</div><div>${(avg * t.D).toFixed(2)}</div><div></div><div class="muted small">conceded</div>
    ${t.aff != null ? `<div>Affinity</div><div>${Math.round(t.aff)}</div><div></div><div class="muted small">provisional</div>` : ''}
    <div>Form</div><div style="grid-column:span 3;text-align:right;padding-right:18px">${(st.form || []).slice(-5).join(' ') || '–'}</div></div>`;
  if (R) {
    const T = R.sim.teams[i];
    const zs = rules.zones.map(z => `<div>${esc(z.label)}</div><div>${pct(T.zone[z.key], R.status[z.key]?.[i])}${R.status[z.key]?.[i] ? '' : '%'}</div><div></div><div></div>`).join('');
    const rs = Object.entries(T.rounds).filter(([r]) => r === 'champ' || r === 'final').map(([r, p]) => `<div>${r === 'champ' ? (rules.playoffs?.type === 'ucl' ? 'Win the competition' : 'Win the title') : 'Reach the final'}</div><div>${pct(p)}%</div><div></div><div></div>`).join('');
    const dist = T.pos.slice(1), mx = Math.max(...dist);
    html += `<div class="block"><h4>Chances</h4><div class="kv">${zs}${rs}<div>Projected points</div><div>${Math.round(T.pts)}</div><div></div><div class="muted small">${T.ptsRange[0]}–${T.ptsRange[1]}</div></div></div>
      <div class="block"><h4>Finishing position</h4><div class="dist">${dist.map(p => `<i style="height:${mx ? p / mx * 100 : 0}%"></i>`).join('')}</div><div class="dist-axis">${dist.map((_, n) => `<span>${(n + 1) % (dist.length > 20 ? 5 : 1) === 0 || n === 0 ? n + 1 : ''}</span>`).join('')}</div></div>`;
  }
  const mine = ms.filter(m => m.h === i || m.a === i);
  const next = mine.filter(m => !isPlayed(m) && m.st !== 'canc').slice(0, 4), last = mine.filter(isPlayed).slice(-4).reverse();
  if (next.length) html += `<div class="block"><h4>Next</h4><div class="row-gap">${next.map(m => matchRow(k, m)).join('')}</div></div>`;
  if (last.length) html += `<div class="block"><h4>Recent</h4><div class="row-gap">${last.map(m => matchRow(k, m)).join('')}</div></div>`;
  openSheet(html);
}

function settingsSheet() {
  sheetCtx = { type: 'settings' };
  const u = store.user(), st = store.status(), cfg = !!window.FIREBASE_CONFIG;
  const updated = Object.values(D)[0]?.updated;
  const n = Object.values(store.get().entries).reduce((s, e) => s + Object.keys(e).length, 0);
  let html = `<div class="head"><div style="font-size:19px;font-weight:700">Settings</div></div>
    <div class="block"><h4>Sync</h4><div class="field"><span>${u ? `Signed in as ${esc(u.email)}` : cfg ? 'Saved on this device only' : 'Cloud sync not set up yet (saved on this device)'}</span><span class="muted small">${st}</span></div>
    ${cfg ? `<div class="btns">${u ? '<button class="btn" data-act="signout">Sign out</button>' : '<button class="btn primary" data-act="signin">Sign in with Google</button>'}</div>` : ''}</div>
    <div class="block"><h4>Data</h4><div class="field"><span>Results, fixtures and odds</span><span class="muted small">ESPN · ${updated ? new Date(updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–'}</span></div>
    <div class="field"><span>Your entered scores</span><span class="muted small">${n}</span></div>
    ${n ? '<div class="btns"><button class="btn quiet" data-act="clear-entries">Clear all my entries</button></div>' : ''}</div>
    <div class="block"><h4>Model</h4>${ORDER.filter(k => D[k]).map(k => { const M = D[k].model, t = M.test; return `<div class="field"><span>${LEAGUES[k].name}</span><span class="muted small">${t ? `log loss ${t.logloss} · ${t.pts} pts/match` : ''} · market ${Math.round(D[k].P.mktW * 100)}%</span></div>`; }).join('')}
    <p class="note" style="margin:10px 18px">Team strengths come from a Dixon-Coles model fitted on up to ten seasons (recent matches count more; half-life ${D.epl?.model.halfLife ?? '–'} days in Europe), using goals blended with a shots-on-target expected-goals proxy and pulled toward each club's Elo. Where DraftKings or another book has a line, the match odds blend in the market. Figures are from walk-forward backtests since 2021.</p></div>`;
  openSheet(html);
}

// ------------------------------------------------------------------ chrome + routing
function parseHash() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  const tab = ['today', 'league', 'picks', 'clubs'].includes(p[0]) ? p[0] : 'today';
  if (tab === 'league') { if (LEAGUES[p[1]]) route.lg = p[1]; if (['matches', 'table', 'odds', 'scenarios'].includes(p[2])) route.sub = p[2]; localSet('lg', route.lg); localSet('sub', route.sub); }
  route.tab = tab;
}
function chrome() {
  const titles = { today: 'Today', picks: 'Picks', clubs: 'Clubs' };
  $('#title').textContent = route.tab === 'league' ? LEAGUES[route.lg].name : titles[route.tab];
  document.documentElement.style.setProperty('--accent', route.tab === 'league' ? LEAGUES[route.lg].color : 'var(--fg)');
  document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === route.tab));
  $('#tabbar a[data-tab=league]').href = `#/league/${route.lg}/${route.sub}`;
  const chips = $('#chips'), seg = $('#seg');
  chips.hidden = seg.hidden = route.tab !== 'league';
  if (route.tab === 'league') {
    chips.innerHTML = ORDER.map(k => `<a class="chip ${k === route.lg ? 'on' : ''}" href="#/league/${k}/${route.sub}"><span class="dot" style="background:${LEAGUES[k].color}"></span>${LEAGUES[k].tag}</a>`).join('');
    seg.innerHTML = [['matches', 'Matches'], ['table', 'Table'], ['odds', 'Race'], ['scenarios', 'Scenarios']].map(([s, n]) => `<a href="#/league/${route.lg}/${s}" class="${route.sub === s ? 'on' : ''}">${n}</a>`).join('');
  }
  const st = store.status(); $('#sync-dot').className = 'sync-dot' + (st === 'synced' ? ' on' : st === 'error' ? ' err' : '');
}

let renderQueued = false;
function render() {
  if (renderQueued) return; renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    chrome();
    if (!Object.keys(D).length) { $('#view').innerHTML = '<div class="spinner">Loading…</div>'; return; }
    for (const k of ORDER) if (D[k] && (route.tab !== 'league' || k === route.lg)) runSim(k);
    const v = route.tab === 'league' ? viewLeague() : route.tab === 'picks' ? viewPicks() : route.tab === 'clubs' ? viewClubs() : viewToday();
    $('#view').innerHTML = v;
    if (sheetCtx?.type === 'club' && !$('#sheet').hidden) clubSheet(sheetCtx.k, sheetCtx.i);
  });
}

// ------------------------------------------------------------------ events
document.addEventListener('click', e => {
  const t = e.target.closest('[data-match],[data-club],[data-tmode],[data-week],[data-rlg],[data-step],[data-save],[data-star],[data-act]');
  if (!t) return;
  if (t.dataset.match) { const [k, id] = t.dataset.match.split(':'); matchSheet(k, id); return; }
  if (t.dataset.club) { const [k, i] = t.dataset.club.split(':'); clubSheet(k, +i); return; }
  if (t.dataset.tmode) { ui.tableMode = t.dataset.tmode; render(); return; }
  if (t.dataset.week) { const d = +t.dataset.week; if (d === 0) delete ui.week[route.lg]; else ui.week[route.lg] = (ui.week[route.lg] ?? 0) + d; render(); return; }
  if (t.dataset.rlg) { ui.ratingsLg = t.dataset.rlg; render(); return; }
  if (t.dataset.step) { const o = t.parentElement.querySelector('output'); o.textContent = Math.max(0, Math.min(15, +o.textContent + +t.dataset.step)); return; }
  if (t.dataset.save && sheetCtx?.type === 'match') {
    const { k, id } = sheetCtx, kind = t.dataset.save;
    const hs = +$('#sheet [data-side=h] output').textContent, as = +$('#sheet [data-side=a] output').textContent, min = +$('#e-min')?.value || 45;
    store.set(s => {
      const E = s.entries[k] || (s.entries[k] = {});
      if (kind === 'clear') delete E[id];
      else E[id] = kind === 'live' ? { hs, as, live: true, min, at: Date.now() } : { hs, as, at: Date.now() };
    });
    runSim(k); matchSheet(k, id); return;
  }
  if (t.dataset.star) {
    const id = t.dataset.star, cur = favIds();
    store.set(s => { s.favs = cur.has(id) ? [...cur].filter(x => x !== id) : [...cur, id]; });
    render(); if (sheetCtx?.type === 'club') clubSheet(sheetCtx.k, sheetCtx.i); return;
  }
  if (t.dataset.act === 'signin') { signIn(); return; }
  if (t.dataset.act === 'signout') { signOut(); closeSheet(); return; }
  if (t.dataset.act === 'clear-entries' && confirm('Clear every score you entered?')) { store.set(s => { s.entries = {}; }); closeSheet(); render(); }
});
$('#scrim').addEventListener('click', closeSheet);
$('#settings-btn').addEventListener('click', settingsSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
window.addEventListener('hashchange', () => { parseHash(); closeSheet(); window.scrollTo(0, 0); render(); });
store.on(() => { for (const k of ORDER) if (D[k] && SIM[k]) runSim(k); render(); });

// ------------------------------------------------------------------ start
parseHash(); render();
loadData().then(() => { render(); pollLive(); setInterval(pollLive, 60e3); }).catch(e => { $('#view').innerHTML = `<div class="empty">Couldn't load data: ${esc(e.message)}</div>`; });
window.addEventListener('load', () => { initSync().catch(console.warn); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
