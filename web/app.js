// Football: page shell, data, live scores, views. Views are plain template strings rendered into #view.
import { LEAGUES, ORDER, MAIN, FAVORITES } from './leagues.js';
import { prepare, standings, isPlayed, regular, simulate } from './sim.js';
import { matchGrid, bestPick, outcomes, liveGrid, marketProbs, grid as dcGrid, pickPoints, W } from './engine.js';
import { statuses, scenarios as scenFor, describe } from './clinch.js';
import { parseEvent } from './espn.js';
import { store, initSync, signIn, signOut } from './store.js';
import * as AF from './affinity.js';
import * as PL from './players.js';

const $ = s => document.querySelector(s);
const D = {}, SIM = {}, LIVE = {};
let TRAITS = {}, RIVALS = {}, AFF = null, PLAYERS = {}, PAFF = null;
const SIMS = 10000;
let route = { tab: 'today', lg: localGet('lg') || 'mls', sub: localGet('sub') || 'table' };
const ui = { tableMode: 'now', ratingsLg: 'eur', week: {}, more: {} };
// domestic leagues before the UEFA cups: a club belongs to its own league (Real Madrid is La Liga, Aston Villa the
// Premier League); a cup only claims clubs from leagues the app doesn't show (Celtic, Benfica)
const HOME_ORDER = [...ORDER.filter(k => !LEAGUES[k].cup), ...ORDER.filter(k => LEAGUES[k].cup)];

function localGet(k) { try { return localStorage.getItem('fa-' + k); } catch { return null; } }
function localSet(k, v) { try { localStorage.setItem('fa-' + k, v); } catch { /* ignore */ } }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Patch el to match html in place instead of replacing it: unchanged nodes (crest images above all) are kept, so a
// refresh from a live score, a finished simulation or a sync doesn't make every crest blink.
function morph(el, html) {
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  patch(el, tpl.content);
}
function patch(a, b) {
  const an = [...a.childNodes], bn = [...b.childNodes];
  bn.forEach((y, i) => {
    const x = an[i];
    if (!x) { a.appendChild(y); return; }
    if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName) { a.replaceChild(y, x); return; }
    if (x.nodeType !== 1) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; return; }
    const fellBack = x.tagName === 'IMG' && x.dataset.f; // crest that switched to ESPN's copy: leave it alone
    if (!fellBack) {
      for (const at of [...x.attributes]) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
      for (const at of [...y.attributes]) if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
    }
    if (x.tagName === 'INPUT' && document.activeElement === x) return; // don't fight typing
    patch(x, y);
  });
  for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
}

// ------------------------------------------------------------------ formatting
const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
function crest(t, cls = '') {
  if (!t) return `<span class="crest ${cls}"></span>`;
  // local copies (scripts/logos.py clears ESPN's white squares); ESPN's resizer if a new club isn't saved yet
  const v = dark() ? '-d' : '', espn = `https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/${dark() ? '500-dark' : '500'}/${t.id}.png&w=80&h=80`;
  return `<img class="crest ${cls}" src="logos/${t.id}${v}.png" alt="" decoding="async" onerror="if(!this.dataset.f){this.dataset.f=1;this.src='${espn}'}else this.style.visibility='hidden'">`;
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
  fetch('data/traits.json', { cache: 'no-cache' }).then(r => r.json()).then(t => { TRAITS = t; render(); }).catch(() => {});
  fetch('data/rivals.json', { cache: 'no-cache' }).then(r => r.json()).then(t => { RIVALS = t; AFF = null; render(); }).catch(() => {});
  fetch('data/players.json', { cache: 'no-cache' }).then(r => r.json()).then(t => { PLAYERS = t; PAFF = null; render(); }).catch(() => {});
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
const ESPN = { epl: 'eng.1', bl: 'ger.1', ucl: 'uefa.champions', mls: 'usa.1', nwsl: 'usa.nwsl', usl: 'usa.usl.1', esp: 'esp.1', ita: 'ita.1', fra: 'fra.1', eng2: 'eng.2', mex: 'mex.1', uel: 'uefa.europa', uecl: 'uefa.europa.conf' };
async function pollLive() {
  const now = Date.now();
  for (const k of ORDER) {
    const L = D[k]; if (!L) continue;
    // everything that has kicked off (up to 4 days back) without a result in the published data, not only matches on
    // now: if a scheduled sync fails, finished matches still get their scores here; finals are fetched once
    const done = new Set(['ft', 'aet', 'pen', 'canc', 'ppd']);
    const near = L.matches.filter(m => !isPlayed(m) && m.st !== 'canc' && !done.has(LIVE[k]?.[m.id]?.st) && now - Date.parse(m.t) < 4 * 864e5 && Date.parse(m.t) - now < 10 * 6e4);
    if (!near.length) continue;
    // ESPN files matches under the US Eastern date (an evening kickoff in California is the next day in UTC), so ask
    // for both the UTC and the Eastern day
    const et = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
    const days = [...new Set(near.flatMap(m => [m.t.slice(0, 10), et.format(new Date(m.t))]).map(d => d.replace(/-/g, '')))];
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

// ------------------------------------------------------------------ Affinity (web/affinity.js)
// Reference = your followed clubs; weights start from the factor shares and move with your picks.
function affinity() {
  const picks = store.get().affPicks || [], favs = favIds();
  const key = JSON.stringify([picks.length, picks.reduce((m, p) => Math.max(m, p.t || 0), 0), Object.keys(TRAITS).length, Object.keys(RIVALS).length]);
  if (AFF?.key === key) return AFF;
  const league = {}; for (const k of HOME_ORDER) for (const t of D[k]?.teams || []) league[t.id] ??= k;
  const rivals = new Set(Object.entries(RIVALS).filter(([k]) => k !== '_note').flatMap(([, v]) => Object.keys(v.rivals || {})));
  // each club's standing in its league by Elo (1 = top), for picking clubs Kevin is likely to know
  const standing = {};
  for (const k of HOME_ORDER) { const ts = [...(D[k]?.teams || [])].sort((a, b) => (b.elo || 0) - (a.elo || 0)); ts.forEach((t, i) => (standing[t.id] ??= 1 - i / Math.max(1, ts.length - 1))); }
  const ctx = { league, rivals, standing }, model = AF.fit(TRAITS, ctx, picks);
  return (AFF = { key, ctx, model, n: model.n });
}
// your own clubs aren't scored: they're yours
const affOf = id => (TRAITS[id] && !favIds().has(id) ? affinity().model.affinity(id) : null);
const reasonsOf = id => (TRAITS[id] ? affinity().model.reasons(id) : { good: [], bad: [] });
const lc = t => AF.LABEL[t][0].toLowerCase() + AF.LABEL[t].slice(1);
// whose rival a club is ("Liverpool's rival")
const rivalOf = id => Object.entries(RIVALS).filter(([k, v]) => k !== '_note' && v.rivals?.[id]).map(([, v]) => v.club.replace(/ FC$/, ''));
const shortText = (id, f) => (f === 'rival' ? `${rivalOf(id).join(' and ') || 'your club'}'s rival` : AF.SHORT[f]);
// One line of reasons: strengths, what your picks say beyond the traits, then the biggest thing against it
function whyLine(id) {
  const r = reasonsOf(id), adj = affinity().model.u[id] || 0, parts = r.good.slice(0, Math.abs(adj) > 0.3 ? 1 : 2).map(lc);
  if (adj > 0.3) parts.push('you often pick them'); else if (adj < -0.3) parts.push('you rarely pick them');
  const bad = r.bad[0];
  // "but" only when there's something before it to contrast with
  return [parts.join(', '), bad ? `${parts.length ? 'but ' : ''}${shortText(id, bad)}` : ''].filter(Boolean).join(', ');
}

// ------------------------------------------------------------------ Player Affinity (web/players.js)
function playerAffinity() {
  const picks = store.get().playerPicks || [], A = affinity();
  const key = JSON.stringify([A.key, picks.length, picks.reduce((m, p) => Math.max(m, p.t || 0), 0), Object.keys(PLAYERS).length]);
  if (PAFF?.key === key) return PAFF;
  const favs = favIds(), model = PL.fitPlayers(PLAYERS, id => (favs.has(id) ? null : A.model.affinity(id)), favs, picks);
  return (PAFF = { key, model, n: model.n });
}
const plc = f => PL.PLABEL[f][0].toLowerCase() + PL.PLABEL[f].slice(1);
function pWhyLine(id) {
  const P = playerAffinity(), r = P.model.reasons(id), adj = P.model.u[id] || 0, parts = r.good.slice(0, Math.abs(adj) > 0.3 ? 1 : 2).map(plc);
  if (adj > 0.3) parts.push('you often pick him'.replace('him', PLAYERS[id].g === 'W' ? 'her' : 'him'));
  else if (adj < -0.3) parts.push('you rarely pick him'.replace('him', PLAYERS[id].g === 'W' ? 'her' : 'him'));
  const bad = r.bad[0];
  return [parts.join(', '), bad ? `${parts.length ? 'but ' : ''}${PL.PSHORT[bad]}` : ''].filter(Boolean).join(', ');
}
// a club in a player's career, with its crest when it's one of ours
// the club a player is most associated with: most seasons among clubs we have
function mainClub(p) { let best = null, bs = 0; for (const c of p.clubs) { if (!c[1]) continue; const ct = clubTeam(c[1]), n = (c[3] ?? 2026) - (c[2] ?? 2026); if (ct && n >= bs) { bs = n; best = ct; } } return best; }
function clubTeam(espnId) { for (const k of HOME_ORDER) { const i = D[k]?.teams.findIndex(t => t.id === espnId); if (i >= 0) return [k, i, D[k].teams[i]]; } return null; }

// "Pull for" on a neutral match: the club with clearly more Affinity, and why
function pullFor(k, m) {
  const L = D[k], H = L.teams[m.h], A = L.teams[m.a], fav = favIds();
  if (fav.has(H.id) || fav.has(A.id) || !TRAITS[H.id] || !TRAITS[A.id]) return null;
  const p = affinity().model.prefer(H.id, A.id), ah = affOf(H.id), aa = affOf(A.id);
  if (Math.abs(p - 0.5) < 0.1) return { none: true, ah, aa, H, A };
  const t = p > 0.5 ? H : A, r = reasonsOf(t.id).good.slice(0, 2).map(lc);
  return { t, p: Math.max(p, 1 - p), ah, aa, H, A, why: r.join(', ') };
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
  for (const k of HOME_ORDER) {
    const L = D[k]; if (!L) continue;
    L.teams.forEach((t, i) => { if (fav.has(t.id) && !seen.has(t.id)) { seen.add(t.id); cards.push(clubCard(k, i)); } });
  }
  const todays = []; for (const k of ORDER) if (D[k]) for (const m of matchesOf(k)) if (dayKey(m.t) === dayKey(now)) todays.push([k, m]);
  out.push(featureCard('Match of the day', featured(todays, 'day:' + dayKey(now))));
  if (cards.length) out.push(`<div class="section"><h2>Your clubs</h2></div><div class="card row-gap">${cards.join('')}</div>`);
  // live
  const live = [];
  for (const k of ORDER) if (D[k] && !quiet(k)) for (const m of matchesOf(k)) if (m.st === 'live') live.push([k, m]);
  if (live.length) out.push(`<div class="section"><h2>Live</h2></div><div class="card row-gap">${live.map(([k, m]) => matchRow(k, m, { showLeague: true })).join('')}</div>`);
  // the next three match days (today included, with its results)
  const byDay = new Map();
  for (const k of ORDER) if (D[k]) for (const m of matchesOf(k)) {
    const t = Date.parse(m.t); if (t < now - 18 * 36e5 && dayKey(t) !== dayKey(now)) continue;
    if (m.st === 'live' && !quiet(k)) continue;
    const dk = dayKey(t); (byDay.get(dk) || byDay.set(dk, []).get(dk)).push([k, m]);
  }
  const days = [...byDay.keys()].sort().filter(d => d >= dayKey(now)).slice(0, 3);
  for (const dk of days) {
    const list = byDay.get(dk);
    const of = k => list.filter(x => x[0] === k).sort((a, b) => a[1].t.localeCompare(b[1].t));
    const block = k => { const ms = of(k); return ms.length ? lgLabel(k) + ms.map(([, m]) => matchRow(k, m)).join('') : ''; };
    // leagues without one of your clubs fold into one line until opened
    const extra = ORDER.filter(k => quiet(k) && of(k).length), open = ui.more[dk];
    const more = extra.length ? (open ? extra.map(block).join('') : '')
      + `<button class="more-row" data-more="${dk}"><span>${open ? 'Fewer' : `${extra.reduce((n, k) => n + of(k).length, 0)} more: ${extra.map(k => LEAGUES[k].name).join(', ')}`}</span><span class="faint">${open ? '▴' : '▾'}</span></button>` : '';
    out.push(`<div class="section"><h2>${dayLabel(dk)}</h2><span class="aside">${list.length} matches</span></div><div class="card">${ORDER.filter(k => !quiet(k)).map(block).join('')}${more}</div>`);
  }
  if (!days.length) out.push('<div class="empty">No matches in the next few days.</div>');
  return out.join('');
}

// a league shown quietly on Today: not one of Kevin's six and none of your clubs in it
function quiet(k) { if (MAIN.includes(k)) return false; const fav = favIds(); return !(D[k]?.teams || []).some(t => fav.has(t.id)); }

// proven out of the post-season (eliminated from the widest place that goes on): its post-season chances show as –
function postOut(rules, R, i) {
  if (!rules.playoffs || !R?.status) return false;
  const widest = rules.zones.filter(z => z.tone !== 'bad' && z.tone !== 'warn').reduce((a, z) => (!a || z.to > a.to ? z : a), null);
  return !!widest && R.status[widest.key]?.[i] === 'out';
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
  if (postOut(rules, SIM[k], i)) return null;
  if (t.rounds.up != null) return { p: t.rounds.up, label: 'Promotion' };
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
  if (route.sub === 'affinity') return viewLeagueAffinity(k);
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

// Clinched/eliminated tag for a club (proofs only, from clinch.js via the worker): the best place it has locked in,
// relegated or safe, or out of the post-season. Null when nothing is proven.
const WON = { title: 'Champions', shield: 'Shield', auto: 'Promoted', po: 'In' }, PLACE = { ucl: 'UCL', ucq: 'UCL qual.', eur: 'Europe' };
function clinchTag(rules, R, i) {
  const st = key => R?.status?.[key]?.[i], zs = rules.zones;
  const up = zs.filter(z => z.tone !== 'bad' && z.tone !== 'warn'), down = zs.filter(z => z.tone === 'bad' || z.tone === 'warn');
  const rel = down.find(z => z.tone === 'bad' && st(z.key) === 'in');
  if (rel) return { text: 'Relegated', tone: 'bad' };
  const won = up.find(z => st(z.key) === 'in');
  if (won) return { text: WON[won.key] || PLACE[won.key] || won.short, tone: won.tone };
  const pl = down.find(z => z.tone === 'warn' && st(z.key) === 'in');
  if (pl) return { text: 'Play-off', tone: 'warn' };
  // out of the post-season (playoff leagues and cups): eliminated from the widest place that goes on
  const widest = up.reduce((a, z) => (!a || z.to > a.to ? z : a), null);
  if (widest && (rules.playoffs || rules.cup) && st(widest.key) === 'out') return { text: 'Out', tone: 'out' };
  if (down.length && down.every(z => st(z.key) === 'out')) return { text: 'Safe', tone: 'out' };
  return null;
}
const tagHtml = t => (t ? `<span class="ctag ${t.tone}">${esc(t.text)}</span>` : '');

function viewTable(k) {
  const L = D[k], rules = LEAGUES[k], ms = matchesOf(k), S = SIM[k]?.sim, R = S ? SIM[k] : null, fav = favIds();
  // Live: matches in progress counted at their current score ("as it stands"); only offered while one is on
  const liveNow = regular(ms).filter(m => m.st === 'live' && m.hs != null);
  const mode = ui.tableMode === 'live' && !liveNow.length ? 'now' : ui.tableMode, live = mode === 'live';
  const before = standings(L, ms, rules);
  const st = live ? standings(L, ms.map(m => (m.st === 'live' && m.hs != null ? { ...m, st: 'ft' } : m)), rules) : before;
  const playing = new Map(liveNow.flatMap(m => [[m.h, m], [m.a, m]]));
  const scope = rules.groups ? 'group' : 'all', proj = mode === 'proj' && S;
  const tbtn = (m, label) => `<button data-tmode="${m}" class="${(m === 'proj' ? proj : m === mode && !proj) ? 'on' : ''}">${label}</button>`;
  let html = `<div class="section"><h2>${proj ? 'Projected finish' : live ? 'As it stands' : 'Standings'}</h2><span class="toggle">${tbtn('now', 'Now')}${liveNow.length ? tbtn('live', '<span class="live-dot"></span>Live') : ''}${tbtn('proj', 'Projected')}</span></div>`;
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
      let extra = '';
      if (live) {
        const m = playing.get(r.i), move = before.rows[r.i].pos - r.pos;
        if (move) extra += `<span class="move ${move > 0 ? 'up' : 'down'}">${move > 0 ? '▲' : '▼'}${Math.abs(move)}</span>`;
        if (m) extra += `<span class="live-pill">${m.h === r.i ? m.hs : m.as}–${m.h === r.i ? m.as : m.hs} ${esc(m.clock || (m.min ? m.min + "'" : ''))}</span>`;
      }
      const name = `<td class="club"><div class="cl">${crest(t)}<span>${esc(t.s)}</span>${fav.has(t.id) ? '<span class="faint">★</span>' : ''}${live ? '' : tagHtml(clinchTag(rules, R, r.i))}${extra}</div></td>`;
      const z = `style="--z:${zoneColor(rules, pos, scope)}"`;
      if (proj) return `<tr class="${cls}" data-club="${k}:${r.i}"><td class="pos" ${z}>${pos}</td>${name}<td class="pts">${Math.round(T.pts)}</td><td class="wide muted">${T.ptsRange[0]}–${T.ptsRange[1]}</td><td class="muted">${T.avgPos.toFixed(1)}</td></tr>`;
      return `<tr class="${cls}" data-club="${k}:${r.i}"><td class="pos" ${z}>${pos}</td>${name}<td>${r.p}</td><td class="wide">${r.w}</td><td class="wide">${r.d}</td><td class="wide">${r.l}</td><td class="wide">${r.gf}</td><td class="wide">${r.ga}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td class="pts">${r.pts}</td></tr>`;
    }).join('');
    html += `<div class="card" style="margin-bottom:10px"><table>${head}${body}</table></div>`;
  }
  if (R && Object.values(R.status).some(z => Object.keys(z).length)) html += `<p class="note">Tags are proven, not simulated: "In" = play-off place clinched, "Out" = eliminated, "Top 4" and the like = clinched at least that place.</p>`;
  html += `<div class="legend">${rules.zones.filter(z => z.key !== 'title' && z.key !== 'shield').map(z => `<span style="--z:${toneVar(z.tone)}">${esc(z.label)}</span>`).join('')}</div>`;
  if (proj) html += `<p class="note">Average points and the likely range (80% of ${SIMS.toLocaleString()} simulated seasons), ordered by average finish.</p>`;
  else if (live) html += `<p class="note">${liveNow.length} match${liveNow.length > 1 ? 'es' : ''} in progress counted at the current score. Arrows: places moved since kickoff.</p>`;
  else if (!S) html += '<p class="note">Running simulations…</p>';
  if (rules.note) html += `<p class="note">${L.tour ? `${esc(L.tour)} table. ` : ''}${esc(rules.note)}</p>`;
  return html;
}

const colLabel = (rules, key) => rules.zones.find(z => z.key === key)?.short || { champ: 'Win', up: 'Up' }[key] || key;
// post-season outcomes in words
const roundName = (rules, key) => ({ up: 'Promotion', final: rules.playoffs?.type === 'efl' ? 'Reach the play-off final' : 'Reach the final',
  champ: rules.playoffs?.type === 'ucl' ? 'Win the competition' : rules.playoffs?.type === 'efl' ? 'Win the play-offs' : 'Win the title' }[key] || key);

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
        const p = isZone ? T.zone[c] : T.rounds[c] ?? 0, status = isZone ? R.status[c]?.[i] : postOut(rules, R, i) ? 'out' : null;
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
const zoneName = (k, key) => LEAGUES[k].zones.find(z => z.key === key)?.label || roundName(LEAGUES[k], key);
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

// Every club in the league by Affinity; your clubs first (they aren't scored)
function viewLeagueAffinity(k) {
  const L = D[k], fav = favIds(), A = affinity();
  if (!Object.keys(TRAITS).length) return '<div class="spinner">Loading…</div>';
  const mine = [], rest = [], none = [];
  L.teams.forEach((t, i) => { if (!TRAITS[t.id]) none.push([i, t]); else if (fav.has(t.id)) mine.push([i, t, null]); else rest.push([i, t, affOf(t.id)]); });
  rest.sort((a, b) => b[2] - a[2]);
  const row = ([i, t, v], n) => {
    const why = v == null ? 'your club' : whyLine(t.id);
    const grp = LEAGUES[k].groups && t.g ? ` <span class="faint tiny">${esc(t.g.replace(/ern$/, ''))}</span>` : '';
    return `<tr class="click${v == null ? ' me' : ''}" data-club="${k}:${i}"><td class="pos">${v == null ? '★' : mine.length + n + 1}</td><td class="club"><div class="cl">${crest(t)}<span>${esc(t.n)}${grp}<br><span class="muted tiny">${esc(why)}</span></span></div></td><td class="pts">${v == null ? '' : Math.round(v)}</td></tr>`;
  };
  let html = `<div class="section"><h2>Affinity</h2><span class="aside">${A.n ? `learned from ${A.n} of your picks` : 'no picks yet'}</span></div>
    <div class="card"><table><tr><th>#</th><th class="club">Club</th><th>Affinity</th></tr>${mine.map(r => row(r, 0)).join('')}${rest.map(row).join('')}</table></div>`;
  if (none.length) html += `<p class="note">No research yet for ${none.length > 4 ? `${none.length} clubs` : esc(none.map(([, t]) => t.n).join(', '))}${none.length === L.teams.length ? ': Affinity shows up here once it\'s in' : ''}.</p>`;
  html += `<p class="note">The chance you'd pick each club over a typical one, from your picks. Tap a club for the evidence; tune it on the Clubs page.</p>`;
  return html;
}

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
  html += `</div><p class="note">A place counts as clinched only when no combination of remaining results can take it away (finishing level on points counts against the club${rules.tiebreak[1] === 'w' ? ', unless the club is sure to have more wins, the first tiebreaker' : ''}). Scenarios cover the club's next match and its rivals' matches in the same round.</p>`;
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
  let html = `<div class="section" style="margin-top:6px"><span class="toggle"><button data-ctab="clubs" class="${ui.ctab !== 'players' ? 'on' : ''}">Clubs</button><button data-ctab="players" class="${ui.ctab === 'players' ? 'on' : ''}">Players</button></span></div>`;
  if (ui.ctab === 'players') return html + viewPlayers();
  const cards = [], seen = new Set();
  for (const k of HOME_ORDER) if (D[k]) D[k].teams.forEach((t, i) => { if (fav.has(t.id) && !seen.has(t.id)) { seen.add(t.id); cards.push(clubCard(k, i)); } });
  html += `<div class="section"><h2>Your clubs</h2><span class="aside">tap ☆ on any club to follow</span></div><div class="card row-gap">${cards.join('') || '<div class="empty">None yet.</div>'}</div>`;
  // ratings: Europe is one Elo scale (linked through UEFA matches), MLS and Liga MX another (Leagues Cup, Concacaf
  // Champions Cup); NWSL and USL each their own
  const POOLS = { eur: HOME_ORDER.filter(k => LEAGUES[k].region === 'Europe') }, PN = { eur: 'Europe' };
  for (const k of ORDER) if (LEAGUES[k].region !== 'Europe') { const p = LEAGUES[k].pool || k; (POOLS[p] ||= []).push(k); PN[p] = POOLS[p].map(x => LEAGUES[x].tag).join(' · '); }
  const sel = POOLS[ui.ratingsLg] ? ui.ratingsLg : 'eur', mixed = POOLS[sel].length > 1;
  html += `<div class="section"><h2>Power ratings</h2></div><nav class="chips" style="padding:0 0 10px">${Object.keys(POOLS).map(k => `<button class="chip ${sel === k ? 'on' : ''}" data-rlg="${k}">${PN[k]}</button>`).join('')}</nav>`;
  const rows = [], seen2 = new Set();
  for (const k of POOLS[sel]) D[k]?.teams.forEach((t, i) => { if (!seen2.has(t.id)) { seen2.add(t.id); rows.push([k, i, t]); } });
  // expected goal difference a match against an average side in the club's league (from the attack/defence fit)
  const strength = (k, t) => { const b = D[k].base, avg = (b[0] + b[1]) / 2; return avg * t.A - avg * t.D; };
  rows.sort((a, b) => b[2].elo - a[2].elo);
  html += `<div class="card"><table><tr><th>#</th><th class="club">Club</th><th>Elo</th><th>${mixed ? 'League' : 'Goals ±'}</th></tr>${rows.slice(0, 50).map(([k, i, t], n) => `<tr class="click${fav.has(t.id) ? ' me' : ''}" data-club="${k}:${i}"><td class="pos">${n + 1}</td><td class="club"><div class="cl">${crest(t)}<span>${esc(t.s)}</span></div></td><td class="pts">${t.elo}</td><td class="muted">${mixed ? LEAGUES[k].tag : fmtSigned(strength(k, t))}</td></tr>`).join('')}</table></div>
    <p class="note">Elo is computed here from ten seasons of ESPN results. European clubs share one scale through UEFA matches and promotion (2. Bundesliga and five other leagues feed it too); MLS and Liga MX share one through the Leagues Cup and the Concacaf Champions Cup; NWSL and USL each have their own. "Goals ±" is the model's expected goal difference a match against an average side in that league.</p>`;
  // affinity
  const AFn = affinity(), beta = AFn.model.beta;
  const pull = AF.TRAITS.filter(f => beta[f] > 0.1).sort((x, y) => beta[y] - beta[x]), push = AF.FLAGS.filter(f => beta[f] < -0.1).sort((x, y) => beta[x] - beta[y]);
  const mx = Math.max(...[...AF.TRAITS, ...AF.FLAGS].map(f => Math.abs(beta[f])));
  const fam = AF.FAMILIAR.filter(f => beta[f] < -0.2).sort((x, y) => beta[x] - beta[y]).map(f => AF.LABEL[f]);
  const bar = f => `<div style="display:grid;grid-template-columns:1fr 90px;align-items:center;gap:10px;margin:5px 0"><span class="small">${AF.LABEL[f]}</span><span style="height:6px;border-radius:3px;background:var(--card2)"><i style="display:block;height:100%;width:${Math.round(Math.abs(beta[f]) / mx * 100)}%;border-radius:3px;background:${beta[f] > 0 ? 'var(--good)' : 'var(--bad)'}"></i></span></div>`;
  const rivalNames = Object.entries(RIVALS).filter(([k]) => k !== '_note').map(([, v]) => `${v.club}: ${Object.values(v.rivals).join(', ')}`);
  html += `<div class="section"><h2>Affinity</h2><span class="aside">${AFn.n ? `learned from ${AFn.n} of your picks` : 'no picks yet'}</span></div>
    <div class="card"><div class="pad"><div class="small muted" style="margin-bottom:6px">Pulls you toward a club</div>${pull.map(bar).join('')}
      <div class="small muted" style="margin:12px 0 6px">Pushes you away</div>${push.map(bar).join('')}
      ${fam.length ? `<p class="tiny faint" style="margin:12px 0 0">Kept out of Affinity: you pick clubs you know more often (Premier League most; ${esc(fam.join(', '))} less). That's familiarity, not liking, so it doesn't count.</p>` : ''}</div>
      <div class="btns" style="padding:0 16px 14px"><button class="btn primary" data-act="quiz">${AFn.n ? 'Answer more' : 'Tune it to you'} · which would you rather support?</button></div></div>`;
  const aff = [], seen3 = new Set(), mine = [];
  for (const k of HOME_ORDER) D[k]?.teams.forEach((t, i) => {
    if (seen3.has(t.id) || !TRAITS[t.id]) return; seen3.add(t.id);
    if (fav.has(t.id)) mine.push([k, i, t]); else aff.push([k, i, t, affOf(t.id)]);
  });
  aff.sort((a, b) => b[3] - a[3]);
  const row = ([k, i, t, v], n) => { const why = v == null ? 'your club' : whyLine(t.id);
    return `<tr class="click${v == null ? ' me' : ''}" data-club="${k}:${i}"><td class="pos">${v == null ? '★' : mine.length + n + 1}</td><td class="club"><div class="cl">${crest(t)}<span>${esc(t.n)} <span class="faint tiny">${LEAGUES[k].tag}</span><br><span class="muted tiny">${esc(why)}</span></span></div></td><td class="pts">${v == null ? '' : Math.round(v)}</td></tr>`; };
  html += `<div class="card" style="margin-top:10px"><table><tr><th>#</th><th class="club">Club</th><th>Affinity</th></tr>${mine.map(r => row([...r, null], 0)).join('')}${aff.slice(0, 30).map(row).join('')}</table></div>
    <p class="note">Affinity is the chance you'd pick a club over a typical one, learned from your picks: researched traits that can only pull a club toward you, three things that can only push it away (state ownership, a racism or fan-culture record, rivalry with your clubs), plus a small adjustment per club from your own answers. Your clubs aren't scored. Rivals: ${esc(rivalNames.join('; '))}.</p>`;
  return html;
}
const fmtSigned = x => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(2);

// ------------------------------------------------------------------ sheets
function openSheet(html, { keep = false } = {}) {
  const open = !$('#sheet').hidden;
  if (open && keep) { morph($('#sheet-body'), html); return; }
  $('#sheet-body').innerHTML = html; $('#sheet').hidden = false; $('#scrim').hidden = false; $('#sheet').scrollTop = 0; document.body.style.overflow = 'hidden';
}
function closeSheet() { $('#sheet').classList.remove('qopen'); $('#sheet').hidden = true; $('#scrim').hidden = true; document.body.style.overflow = ''; sheetCtx = null; }
let sheetCtx = null;

function matchSheet(k, id) {
  const L = D[k], m = matchesOf(k).find(x => x.id === id); if (!m) return;
  sheetCtx = { type: 'match', k, id };
  const H = L.teams[m.h], A = L.teams[m.a], played = isPlayed(m), live = m.st === 'live';
  const when = new Date(m.t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  let mid = played || live ? `${m.hs}–${m.as}<small>${live ? esc(m.clock || m.min + "'") : m.st === 'pen' ? `Pens ${m.so?.join('–') || ''}` : 'Full time'}</small>` : `${fmtTime(m.t)}<small>${dayLabel(dayKey(m.t))}</small>`;
  let html = `<div class="head"><div class="small muted">${LEAGUES[k].name}${m.stage ? ' · ' + esc(m.stage.replace(/-+/g, ' ')) : ''} · ${when}${m.tv ? ' · ' + esc(m.tv) : ''}</div></div>
    <div class="vs"><button class="side" data-club="${k}:${m.h}">${crest(H, 'lg')}${esc(H.s)}</button><div class="mid">${mid}</div><button class="side" data-club="${k}:${m.a}">${crest(A, 'lg')}${esc(A.s)}</button></div>`;
  // rooting guide (neutral matches only)
  const pf = pullFor(k, m);
  if (pf) html += pf.none ? `<p class="note" style="margin:0 18px 10px;text-align:center">No strong pull: Affinity ${Math.round(pf.ah)} v ${Math.round(pf.aa)}</p>`
    : `<p class="note" style="margin:0 18px 10px;text-align:center">Your pull: <b style="color:var(--fg)">${esc(pf.t.s)}</b> (${Math.round(pf.p * 100)}%) · Affinity ${Math.round(pf.ah)} v ${Math.round(pf.aa)}${pf.why ? ` · ${esc(pf.why)}` : ''}</p>`;
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

function viewPlayers() {
  if (!Object.keys(PLAYERS).length || !Object.keys(TRAITS).length) return '<div class="spinner">Loading…</div>';
  const P = playerAffinity(), beta = P.model.beta;
  const pull = [...PL.PTRAITS, ...PL.PLINKS].filter(f => beta[f] > 0.1).sort((x, y) => beta[y] - beta[x]), push = PL.PFLAGS.filter(f => beta[f] < -0.1).sort((x, y) => beta[x] - beta[y]);
  const mx = Math.max(...[...pull, ...push].map(f => Math.abs(beta[f])), 0.01);
  const bar = f => `<div style="display:grid;grid-template-columns:1fr 90px;align-items:center;gap:10px;margin:5px 0"><span class="small">${PL.PLABEL[f]}</span><span style="height:6px;border-radius:3px;background:var(--card2)"><i style="display:block;height:100%;width:${Math.round(Math.abs(beta[f]) / mx * 100)}%;border-radius:3px;background:${beta[f] > 0 ? 'var(--good)' : 'var(--bad)'}"></i></span></div>`;
  let html = `<div class="section"><h2>Player Affinity</h2><span class="aside">${P.n ? `learned from ${P.n} of your picks` : 'no picks yet'}</span></div>
    <div class="card"><div class="pad"><div class="small muted" style="margin-bottom:6px">Pulls you toward a player</div>${pull.map(bar).join('')}
      <div class="small muted" style="margin:12px 0 6px">Pushes you away</div>${push.map(bar).join('')}</div>
      <div class="btns" style="padding:0 16px 14px"><button class="btn primary" data-act="pquiz">${P.n ? 'Answer more' : 'Tune it to you'} · who would you rather your son look up to?</button></div></div>`;
  const lists = { ma: ['Men, active', p => p.g === 'M' && p.act], mt: ['Men, all-time', p => p.g === 'M'], wt: ['Women', p => p.g === 'W'] };
  const sel = lists[ui.plist] ? ui.plist : 'ma';
  html += `<nav class="chips" style="padding:14px 0 10px">${Object.entries(lists).map(([k, [n]]) => `<button class="chip ${sel === k ? 'on' : ''}" data-plist="${k}">${n}</button>`).join('')}</nav>`;
  // active lists can be narrowed to a league (by the player's current club)
  const curLg = p => { const c = [...p.clubs].reverse().find(c => c[3] == null && c[1]); return c ? clubTeam(c[1])?.[0] : null; };
  // only leagues with players in this list (no NWSL under men, no Bundesliga under women)
  const have = new Set(Object.values(PLAYERS).filter(p => lists[sel][1](p)).map(curLg).filter(Boolean));
  const lg = sel !== 'mt' && ui.plg && have.has(ui.plg) ? ui.plg : null;
  if (sel !== 'mt' && have.size > 1) html += `<nav class="chips" style="padding:0 0 10px">${['all', ...ORDER.filter(k => have.has(k))].map(k => `<button class="chip ${(lg || 'all') === k ? 'on' : ''}" data-plg="${k}">${k === 'all' ? 'All' : LEAGUES[k].tag}</button>`).join('')}</nav>`;
  const rows = Object.entries(PLAYERS).filter(([, p]) => lists[sel][1](p) && (!lg || curLg(p) === lg)).map(([id, p]) => [id, p, P.model.affinity(id)]).sort((a, b) => b[2] - a[2]).slice(0, 50);
  html += `<div class="card"><table><tr><th>#</th><th class="club">Player</th><th>Affinity</th></tr>${rows.map(([id, p, v], n) => {
    const ct = mainClub(p);
    return `<tr class="click" data-player="${id}"><td class="pos">${n + 1}</td><td class="club"><div class="cl">${ct ? crest(ct[2]) : '<span class="crest"></span>'}<span>${esc(p.n)} <span class="faint tiny">${esc(p.cur || (p.act ? '' : 'retired'))}</span><br><span class="muted tiny">${esc(pWhyLine(id))}</span></span></div></td><td class="pts">${Math.round(v)}</td></tr>`;
  }).join('')}</table></div>
    <p class="note">${Object.keys(PLAYERS).length} researched players (your clubs' squads, today's elite, all-time greats and the women's game). Affinity is the chance you'd pick a player over a typical one: ten researched traits, being American, playing for your clubs and clubs you like, minus documented wrongdoing, learned from your picks. Whether a player is still playing or in the women's game is fitted but left out.</p>`;
  return html;
}

function playerSheet(id) {
  const p = PLAYERS[id]; if (!p) return;
  sheetCtx = { type: 'player', id };
  const P = playerAffinity(), r = P.model.reasons(id), adj = P.model.u[id] || 0, v = P.model.affinity(id);
  const him = p.g === 'W' ? 'her' : 'him';
  let html = `<div class="head"><div style="font-size:19px;font-weight:700">${esc(p.n)}</div><div class="small muted">${[p.nat, p.pos, p.cur || (p.act ? '' : 'Retired'), p.born ? 'born ' + p.born : ''].filter(Boolean).map(esc).join(' · ')}</div></div>
    <div class="kv"><div>Affinity</div><div>${Math.round(v)}</div><div></div><div class="muted small">of 100</div></div>`;
  html += `<div class="block"><h4>Why</h4><p class="note" style="margin:0 18px 8px">${r.good.length ? `Strong on ${r.good.map(plc).join(', ')}` : ''}${r.bad.length ? `${r.good.length ? '; against: ' : 'Against: '}${r.bad.map(f => PL.PSHORT[f]).join(', ')}` : ''}${r.good.length || r.bad.length ? '.' : ''}${Math.abs(adj) > 0.15 ? ` Your picks rate ${him} ${adj > 0 ? 'higher' : 'lower'} than the traits alone.` : ''}</p>
    <div class="kv3">${PL.PTRAITS.filter(k => p.t[k] != null).map(k => `<div>${PL.PLABEL[k]}${p.why?.[k] ? `<div class="tiny faint" style="margin-top:2px;white-space:normal">${esc(p.why[k])}</div>` : ''}</div><div>${(p.t[k] ?? 0).toFixed(1).replace('.0', '')}</div><div class="muted small">${P.model.beta[k] > 0.15 ? 'counts' : 'little'}</div>`).join('')}</div></div>`;
  html += `<div class="block"><h4>Career</h4><div class="kv3">${p.clubs.map(c => { const ct = c[1] ? clubTeam(c[1]) : null; return `<div style="display:flex;align-items:center;gap:8px;color:var(--fg)">${ct ? crest(ct[2]) : ''}${esc(c[0])}</div><div style="font-weight:400" class="muted">${c[2] ?? ''}–${c[3] ?? ''}</div><div class="muted small">${ct && favIds().has(c[1]) ? 'your club' : ct && affOf(c[1]) != null ? 'Affinity ' + Math.round(affOf(c[1])) : ''}</div>`; }).join('')}</div></div>`;
  if (p.honours) html += `<div class="block"><h4>Honours</h4><p class="note" style="margin:0 18px">${esc(p.honours)}</p></div>`;
  if (p.causes?.length) html += `<div class="block"><h4>Causes</h4><p class="note" style="margin:0 18px">${p.causes.map(esc).join('<br>')}</p></div>`;
  html += `<div class="block"><h4>Record</h4><p class="note" style="margin:0 18px">${esc(p.notes || 'Nothing on record.')}</p></div>`;
  openSheet(html);
}

function playerQuizSheet() {
  sheetCtx = { type: 'pquiz' };
  const P = playerAffinity(), picks = store.get().playerPicks || [];
  const pair = PL.nextPlayerPair(P.model, PLAYERS, picks, favIds(), id => clubTeam(id)?.[0]);
  if (!pair) { openSheet('<div class="empty">No more pairs to ask.</div>'); return; }
  sheetCtx.pair = pair;
  const side = id => { const p = PLAYERS[id], ct = mainClub(p);
    return `<button class="btn" style="display:grid;justify-items:center;align-content:start;gap:8px;padding:16px 10px" data-pquiz="${id}">${ct ? crest(ct[2], 'lg') : '<span class="crest lg"></span>'}<span>${esc(p.n)}</span><span class="tiny faint">${esc([p.nat, p.act ? (p.cur || '') : 'retired'].filter(Boolean).join(' · '))}</span>
    <span class="qfacts" style="gap:5px;text-align:left;font-weight:400;margin-top:4px">${PL.pfacts(p).map(([h, v]) => `<span class="tiny"><b class="faint">${h}</b> <span class="muted">${esc(v)}</span></span>`).join('')}</span></button>`; };
  openSheet(`<div class="head"><div style="font-size:19px;font-weight:700">Who would you rather your son look up to?</div><div class="small muted">Gut feeling. ${picks.length} answered${picks.length < 20 ? ' · about 20 is enough to start' : ''}.</div></div>
    <div class="btns" style="display:grid;grid-template-columns:1fr 1fr">${side(pair[0])}${side(pair[1])}</div>
    <div class="btns"><button class="btn quiet" data-act="qinfo">${ui.qinfo ? 'Hide details' : 'Details'}</button><button class="btn quiet" data-pquiz="skip">Can't say</button><button class="btn quiet" data-pquiz="done">Done</button></div>`);
  $('#sheet').classList.toggle('qopen', !!ui.qinfo);
}

function clubSheet(k, i, keep = false) {
  const L = D[k], t = L.teams[i], rules = LEAGUES[k], ms = matchesOf(k), st = standings(L, ms, rules).rows[i], R = SIM[k]?.sim ? SIM[k] : null, fav = favIds();
  sheetCtx = { type: 'club', k, i };
  const b = L.base, avg = (b[0] + b[1]) / 2;
  let html = `<div class="vs" style="grid-template-columns:auto 1fr auto;text-align:left;padding:14px 18px">${crest(t, 'lg')}<div><div style="font-size:19px;font-weight:700">${esc(t.n)}</div><div class="small muted">${LEAGUES[k].name} · ${ord(st.pos)}${rules.groups ? ' in the ' + esc(st.group.replace(/ern$/, '')) : ''} · ${st.pts} pts ${tagHtml(clinchTag(rules, R, i))}</div></div><button class="star ${fav.has(t.id) ? 'on' : ''}" data-star="${t.id}" aria-label="Follow">${fav.has(t.id) ? '★' : '☆'}</button></div>`;
  html += `<div class="kv"><div>Elo</div><div>${t.elo}</div><div></div><div></div>
    <div>Attack</div><div>${(avg * t.A).toFixed(2)}</div><div></div><div class="muted small">goals / match</div>
    <div>Defence</div><div>${(avg * t.D).toFixed(2)}</div><div></div><div class="muted small">conceded</div>
    ${TRAITS[t.id] ? `<div>Affinity</div><div>${affOf(t.id) == null ? '★' : Math.round(affOf(t.id))}</div><div></div><div class="muted small">${affOf(t.id) == null ? 'your club' : 'of 100'}</div>` : ''}
    <div>Form</div><div style="grid-column:span 3;text-align:right;padding-right:18px">${(st.form || []).slice(-5).join(' ') || '–'}</div></div>`;
  if (R) {
    const T = R.sim.teams[i];
    const zs = rules.zones.map(z => `<div>${esc(z.label)}</div><div>${pct(T.zone[z.key], R.status[z.key]?.[i])}${R.status[z.key]?.[i] ? '' : '%'}</div><div></div><div></div>`).join('');
    const rs = Object.entries(T.rounds).filter(([r]) => r === 'champ' || r === 'final' || r === 'up').map(([r, p]) => `<div>${roundName(rules, r)}</div><div>${postOut(rules, R, i) ? pct(p, 'out') : pct(p) + '%'}</div><div></div><div></div>`).join('');
    const dist = T.pos.slice(1), mx = Math.max(...dist);
    html += `<div class="block"><h4>Chances</h4><div class="kv">${zs}${rs}<div>Projected points</div><div>${Math.round(T.pts)}</div><div></div><div class="muted small">${T.ptsRange[0]}–${T.ptsRange[1]}</div></div></div>
      <div class="block"><h4>Finishing position</h4><div class="dist">${dist.map(p => `<i style="height:${mx ? p / mx * 100 : 0}%"></i>`).join('')}</div><div class="dist-axis">${dist.map((_, n) => `<span>${(n + 1) % (dist.length > 20 ? 5 : 1) === 0 || n === 0 ? n + 1 : ''}</span>`).join('')}</div></div>`;
  }
  if (TRAITS[t.id]) {
    const tr = AF.withGeo(TRAITS[t.id]), r = reasonsOf(t.id), A = affinity(), adj = A.model.u[t.id] || 0;
    html += `<div class="block"><h4>Affinity: why</h4>${r.good.length || r.bad.length ? `<p class="note" style="margin:0 18px 8px">${r.good.length ? `Strong on ${r.good.map(lc).join(', ')}` : ''}${r.bad.length ? `${r.good.length ? '; against it: ' : 'Against it: '}${r.bad.map(f => shortText(t.id, f)).join(', ')}` : ''}.${Math.abs(adj) > 0.15 ? ` Your picks rate it ${adj > 0 ? 'higher' : 'lower'} than its traits alone.` : ''}</p>` : ''}
      <div class="kv3">${AF.TRAITS.map(k => `<div>${AF.LABEL[k]}${tr.why?.[k] ? `<div class="tiny faint" style="margin-top:2px;white-space:normal">${esc(tr.why[k])}</div>` : ''}</div><div>${(tr[k] ?? 0).toFixed(k === 'geography' ? 1 : 0)}</div><div class="muted small">${A.model.beta[k] > 0.15 ? 'counts' : 'little'}</div>`).join('')}</div></div>`;
  }
  if (Object.keys(PLAYERS).length) {
    const P = playerAffinity(), ps = Object.entries(PLAYERS).filter(([, p]) => p.clubs.some(c => c[1] === t.id)).map(([id, p]) => [id, p, P.model.affinity(id)]).sort((a, b) => b[2] - a[2]);
    if (ps.length) html += `<div class="block"><h4>Players who played here</h4><div class="kv3">${ps.slice(0, 8).map(([id, p, v]) => `<div data-player="${id}" class="click" style="color:var(--fg)">${esc(p.n)}<div class="tiny faint" style="margin-top:2px;white-space:normal">${esc(pWhyLine(id))}</div></div><div>${Math.round(v)}</div><div class="muted small">${p.act ? (p.cur === undefined ? '' : esc(p.cur || '')) : 'retired'}</div>`).join('')}</div></div>`;
  }
  const mine = ms.filter(m => m.h === i || m.a === i);
  const next = mine.filter(m => !isPlayed(m) && m.st !== 'canc').slice(0, 4), last = mine.filter(isPlayed).slice(-4).reverse();
  if (next.length) html += `<div class="block"><h4>Next</h4><div class="row-gap">${next.map(m => matchRow(k, m)).join('')}</div></div>`;
  if (last.length) html += `<div class="block"><h4>Recent</h4><div class="row-gap">${last.map(m => matchRow(k, m)).join('')}</div></div>`;
  openSheet(html, { keep });
}

function quizSheet() {
  sheetCtx = { type: 'quiz' };
  const ids = [...new Set(ORDER.flatMap(k => (D[k]?.teams || []).map(t => t.id)))].filter(id => TRAITS[id]);
  const A = affinity(), picks = store.get().affPicks || [];
  const focus = AF.focusPairs(A.model, ids, A.ctx, picks, favIds());
  const pair = focus[0] || AF.nextPair(A.model, ids, A.ctx, picks, favIds());
  const team = id => { for (const k of HOME_ORDER) { const t = D[k]?.teams.find(x => x.id === id); if (t) return [k, t]; } return [null, { id, s: TRAITS[id].name }]; };
  if (!pair) { openSheet('<div class="empty">No more pairs to ask.</div>'); return; }
  sheetCtx.pair = pair;
  const side = id => { const [k, t] = team(id); return `<button class="btn" style="display:grid;justify-items:center;align-content:start;gap:8px;padding:16px 10px" data-quiz="${id}">${crest(t, 'lg')}<span>${esc(t.n || t.s)}</span><span class="tiny faint">${k ? LEAGUES[k].name : ''}</span>
    <span class="qfacts" style="gap:5px;text-align:left;font-weight:400;margin-top:4px">${AF.facts(TRAITS[id]).map(([h, v]) => `<span class="tiny"><b class="faint">${h}</b> <span class="muted">${esc(v)}</span></span>`).join('')}</span></button>`; };
  openSheet(`<div class="head"><div style="font-size:19px;font-weight:700">Which would you rather support?</div><div class="small muted">Gut feeling. ${focus.length ? `Settling your top ten · ${focus.length} left` : `${picks.length} answered${picks.length < 20 ? ' · about 20 is enough to start' : ''}`}.</div></div>
    <div class="btns" style="display:grid;grid-template-columns:1fr 1fr">${side(pair[0])}${side(pair[1])}</div>
    <div class="btns"><button class="btn quiet" data-act="qinfo">${ui.qinfo ? 'Hide details' : 'Details'}</button><button class="btn quiet" data-quiz="skip">Can't say</button><button class="btn quiet" data-quiz="done">Done</button></div>`);
  $('#sheet').classList.toggle('qopen', !!ui.qinfo);
}

function settingsSheet(keep = false) {
  sheetCtx = { type: 'settings' };
  const u = store.user(), st = store.status(), cfg = !!window.FIREBASE_CONFIG, dg = store.diag();
  const updated = Object.values(D)[0]?.updated;
  const n = Object.values(store.get().entries).reduce((s, e) => s + Object.keys(e).length, 0);
  let html = `<div class="head"><div style="font-size:19px;font-weight:700">Settings</div></div>
    <div class="block"><h4>Sync</h4>
      <div class="field"><span>Account</span><span class="muted small">${u ? esc(u.email) : cfg ? 'Not signed in: saved on this device only' : 'Cloud sync not set up'}</span></div>
      ${u ? `<div class="field"><span>Status</span><span class="small" style="color:${st === 'synced' ? 'var(--good)' : st === 'error' ? 'var(--bad)' : 'var(--muted)'}">${st}${dg.seen ? ` · checked ${new Date(dg.seen).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}</span></div>
      ${dg.error ? `<div class="field"><span class="small" style="color:var(--bad)">${esc(dg.error)}</span></div>` : ''}` : ''}
      <div class="field"><span>Affinity picks</span><span class="muted small">this device ${(store.get().affPicks || []).length}${dg.cloudPicks != null ? ` · cloud ${dg.cloudPicks}` : ''}</span></div>
      <div class="field"><span>Player picks</span><span class="muted small">this device ${(store.get().playerPicks || []).length}${dg.cloudPlayerPicks != null ? ` · cloud ${dg.cloudPlayerPicks}` : ''}</span></div>
      <div class="field"><span>Score entries</span><span class="muted small">this device ${n}${dg.cloudEntries != null ? ` · cloud ${dg.cloudEntries}` : ''}</span></div>
      ${(store.get().affPicks || []).length ? '<div class="btns"><button class="btn quiet" data-act="copypicks">Copy my club picks (to share for analysis)</button></div>' : ''}
      ${(store.get().playerPicks || []).length ? '<div class="btns"><button class="btn quiet" data-act="copypicks" data-which="players">Copy my player picks</button></div>' : ''}
      ${cfg ? `<div class="btns">${u ? '<button class="btn" data-act="syncnow">Sync now</button><button class="btn quiet" data-act="signout">Sign out</button>' : '<button class="btn primary" data-act="signin">Sign in with Google</button>'}</div>` : ''}</div>
    <div class="block"><h4>Data</h4><div class="field"><span>Results, fixtures and odds</span><span class="muted small">ESPN · ${updated ? new Date(updated).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–'}</span></div>
    <div class="field"><span>Your entered scores</span><span class="muted small">${n}</span></div>
    ${n ? '<div class="btns"><button class="btn quiet" data-act="clear-entries">Clear all my entries</button></div>' : ''}</div>
    <div class="block"><h4>Model</h4>${ORDER.filter(k => D[k]).map(k => { const M = D[k].model, t = M.test; return `<div class="field"><span>${LEAGUES[k].name}</span><span class="muted small">${t ? `log loss ${t.logloss} · ${t.pts} pts/match` : ''} · market ${Math.round(D[k].P.mktW * 100)}%</span></div>`; }).join('')}
    <p class="note" style="margin:10px 18px">Team strengths come from a Dixon-Coles model fitted on up to ten seasons (recent matches count more; half-life ${D.epl?.model.halfLife ?? '–'} days in Europe), using goals blended with a shots-on-target expected-goals proxy and pulled toward each club's Elo. Where DraftKings or another book has a line, the match odds blend in the market. Figures are from walk-forward backtests since 2021.</p></div>`;
  openSheet(html, { keep });
}

// ------------------------------------------------------------------ chrome + routing
function parseHash() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  const tab = ['today', 'league', 'picks', 'clubs'].includes(p[0]) ? p[0] : 'today';
  if (tab === 'league') { if (LEAGUES[p[1]]) route.lg = p[1]; if (['matches', 'table', 'odds', 'scenarios', 'affinity'].includes(p[2])) route.sub = p[2]; localSet('lg', route.lg); localSet('sub', route.sub); }
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
    morph(chips, ORDER.map(k => `<a class="chip ${k === route.lg ? 'on' : ''}" href="#/league/${k}/${route.sub}"><span class="dot" style="background:${LEAGUES[k].color}"></span>${LEAGUES[k].tag}</a>`).join(''));
    // keep the selected league's chip in view (the row scrolls sideways on a phone)
    const on = chips.querySelector('.chip.on');
    if (on && chips.dataset.lg !== route.lg) {
      chips.dataset.lg = route.lg;
      const a = on.getBoundingClientRect(), c = chips.getBoundingClientRect();
      if (a.left < c.left || a.right > c.right) chips.scrollLeft += a.left - c.left - 16;
    }
    morph(seg, [['matches', 'Matches'], ['table', 'Table'], ['odds', 'Race'], ['scenarios', 'Scenarios'], ['affinity', 'Affinity']].map(([s, n]) => `<a href="#/league/${route.lg}/${s}" class="${route.sub === s ? 'on' : ''}">${n}</a>`).join(''));
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
    morph($('#view'), v);
    if (sheetCtx?.type === 'club' && !$('#sheet').hidden) clubSheet(sheetCtx.k, sheetCtx.i, true);
    if (sheetCtx?.type === 'settings' && !$('#sheet').hidden) settingsSheet(true);
  });
}

// ------------------------------------------------------------------ events
document.addEventListener('click', e => {
  const t = e.target.closest('[data-more],[data-plg],[data-pquiz],[data-player],[data-ctab],[data-plist],[data-quiz],[data-match],[data-club],[data-tmode],[data-week],[data-rlg],[data-step],[data-save],[data-star],[data-act]');
  if (!t) return;
  if (t.dataset.quiz) {
    const q = t.dataset.quiz;
    if (q === 'done') { closeSheet(); render(); return; }
    const [a, b] = sheetCtx.pair;
    store.set(s => { (s.affPicks || (s.affPicks = [])).push({ a, b, win: q === 'skip' ? null : q, t: Date.now() }); });
    ui.qinfo = false; quizSheet(); return;
  }
  if (t.dataset.pquiz) {
    const q = t.dataset.pquiz;
    if (q === 'done') { closeSheet(); render(); return; }
    const [a, b] = sheetCtx.pair;
    store.set(s => { (s.playerPicks || (s.playerPicks = [])).push({ a, b, win: q === 'skip' ? null : q, t: Date.now() }); });
    ui.qinfo = false; playerQuizSheet(); return;
  }
  if (t.dataset.more) { ui.more[t.dataset.more] = !ui.more[t.dataset.more]; render(); return; }
  if (t.dataset.player) { playerSheet(t.dataset.player); return; }
  if (t.dataset.ctab) { ui.ctab = t.dataset.ctab; render(); return; }
  if (t.dataset.plist) { ui.plist = t.dataset.plist; render(); return; }
  if (t.dataset.plg) { ui.plg = t.dataset.plg === 'all' ? null : t.dataset.plg; render(); return; }
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
  if (t.dataset.act === 'quiz') { ui.qinfo = false; quizSheet(); return; }
  if (t.dataset.act === 'pquiz') { ui.qinfo = false; playerQuizSheet(); return; }
  if (t.dataset.act === 'qinfo') { ui.qinfo = !ui.qinfo; $('#sheet').classList.toggle('qopen', ui.qinfo); t.textContent = ui.qinfo ? 'Hide details' : 'Details'; return; }
  if (t.dataset.act === 'copypicks') {
    const name = id => TRAITS[id]?.name || id;
    const pname = id => PLAYERS[id]?.n || id, players = t.dataset.which === 'players';
    const nm = players ? pname : name, src = players ? store.get().playerPicks : store.get().affPicks;
    const rows = (src || []).map(p => ({ a: nm(p.a), b: nm(p.b), pick: p.win ? nm(p.win) : "can't say", ida: p.a, idb: p.b, t: new Date(p.t).toISOString() }));
    const txt = JSON.stringify(rows);
    (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => { t.textContent = `Copied ${rows.length} picks`; })
      .catch(() => openSheet(`<div class="head"><b>Your picks</b><div class="small muted">Select all and copy.</div></div><textarea style="width:calc(100% - 36px);margin:0 18px;height:50vh;background:var(--card2);color:var(--fg);border:0;border-radius:10px;padding:10px;font:12px ui-monospace,monospace">${esc(txt)}</textarea>`));
    return;
  }
  if (t.dataset.act === 'signin') { signIn(); return; }
  if (t.dataset.act === 'syncnow') { store.syncNow().then(() => sheetCtx?.type === 'settings' && settingsSheet()); return; }
  if (t.dataset.act === 'signout') { signOut(); closeSheet(); return; }
  if (t.dataset.act === 'clear-entries' && confirm('Clear every score you entered?')) { store.set(s => { s.entries = {}; }); closeSheet(); render(); }
});
$('#scrim').addEventListener('click', closeSheet);
$('#settings-btn').addEventListener('click', () => settingsSheet());
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
window.addEventListener('hashchange', () => { parseHash(); closeSheet(); window.scrollTo(0, 0); render(); });
store.on(() => { for (const k of ORDER) if (D[k] && SIM[k]) runSim(k); render(); });

// ------------------------------------------------------------------ pull to refresh
// Pull down at the top of the page: refetch the published data, live scores and your synced state.
let refreshing = false;
async function refreshAll() {
  if (refreshing) return; refreshing = true;
  try {
    await Promise.all([loadData(), store.syncNow?.().catch(() => {})]);
    render(); await pollLive();
    navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {});
  } finally { refreshing = false; }
}
(() => {
  const icon = d => `<svg viewBox="0 0 24 24" width="18" height="18"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ARROW = icon('M12 5v12M6 11l6 6 6-6'), ARC = icon('M12 4a8 8 0 1 0 8 8');
  const ind = document.createElement('div'); ind.className = 'ptr'; ind.innerHTML = ARROW;
  document.body.appendChild(ind);
  const PULL = 70; let y0 = null, x0 = 0, d = 0;
  const show = () => { const top = $('header.top').getBoundingClientRect().bottom; ind.style.top = `${top - 40}px`;
    ind.style.transform = `translateY(${Math.min(d, PULL + 20)}px) rotate(${d >= PULL ? 180 : 0}deg)`; ind.style.opacity = Math.min(1, d / PULL); };
  addEventListener('touchstart', e => { y0 = window.scrollY <= 0 && $('#sheet').hidden && !refreshing && e.touches.length === 1 ? e.touches[0].clientY : null; x0 = e.touches[0].clientX; d = 0; }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 == null) return;
    const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if (dy <= 0 || dx > dy || window.scrollY > 0) { if (d) { d = 0; ind.style.opacity = 0; } return; }
    d = dy * 0.5; show();
  }, { passive: true });
  addEventListener('touchend', () => {
    if (y0 == null) return; y0 = null;
    if (d < PULL) { d = 0; ind.style.opacity = 0; return; }
    d = PULL; show(); ind.style.transform = `translateY(${PULL}px)`; ind.innerHTML = ARC; ind.classList.add('spin');
    refreshAll().finally(() => { ind.classList.remove('spin'); ind.innerHTML = ARROW; ind.style.opacity = 0; d = 0; });
  });
})();

// ------------------------------------------------------------------ start
parseHash(); render();
loadData().then(() => { render(); pollLive(); setInterval(pollLive, 60e3); }).catch(e => { $('#view').innerHTML = `<div class="empty">Couldn't load data: ${esc(e.message)}</div>`; });
window.addEventListener('load', () => { initSync().catch(console.warn); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
