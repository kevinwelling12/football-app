// Player Affinity (2026-10-13): the club framework applied to players. Kevin's goal, in his words: the lists should be
// topped by players he'd like his son to look up to — humble, unselfish, play the game the right way, make time for fans,
// speak out for what is right, stay out of trouble, while delivering performances worthy of the highlight reels.
//
// Pulls (weights >= 0): six researched 0-10 traits (character, team player, loyalty, greatness, joy to watch, legacy),
//   share of career seasons at your clubs, and the seasons-weighted Affinity of the other clubs he played for.
// Pushes (weights <= 0): serious wrongdoing, lesser offences, money/sportswashing moves, disloyal moves.
// Familiarity (fitted, left out of the score): still playing, women's game.
// Fitted on "which player would you rather your son look up to?" picks with the shared engine (affinity.js fitPairs).
import { fitPairs, unknownClubs } from './affinity.js';

// Researched traits (shown on each player's sheet). SP, VO, CO, HU split Character into its parts (2026-10-15).
export const PTRAITS = ['CH', 'SP', 'VO', 'CO', 'HU', 'WK', 'LO', 'AB', 'ST', 'LE'];
const TDEFAULT = { SP: 6, VO: 5, CO: 5.5, HU: 6 };

// v2 (2026-11-07, Kevin's choices, backtested with scripts/affinity/pgroupings.mjs on his 1,024 decisive picks):
// grouped features, every weight from 0 with either sign except Loyalty (it can only count for a player), no
// "played for your club" link, and familiarity controls (still playing, women's game, how big his clubs were, the
// league of his current or last club) fitted but left out of the score. Unlike clubs, the per-player adjustment
// stays: traits alone predict little more than half of his player picks.
export const PGROUPS = ['character', 'team', 'loyalty', 'class', 'clubs', 'usa'];
export const PPARTS = { character: ['CH', 'SP', 'VO', 'CO', 'HU'], team: ['WK'], loyalty: ['LO'], class: ['AB', 'ST', 'LE'] };
export const PFLAGS = ['wrongdoing', 'moneymoves'];
const PLG = ['bl', 'mls', 'nwsl', 'usl', 'esp', 'ita', 'fra', 'other'];
export const PFAMILIAR = ['active', 'women', 'fame', ...PLG.map(l => 'plg_' + l)];
export const PFEATURES = [...PGROUPS, ...PFLAGS, ...PFAMILIAR];
export const PLABEL = { CH: 'Character', SP: 'Sportsmanship', VO: 'Speaks out', CO: 'Community', HU: 'Humility', WK: 'Team player', LO: 'Loyalty', AB: 'Greatness', ST: 'Joy to watch', LE: 'Legacy',
  character: 'Character', team: 'Team player', loyalty: 'Loyalty', class: 'Class on the pitch', clubs: 'Clubs you like', usa: 'American',
  wrongdoing: 'Wrongdoing', moneymoves: 'Money or disloyal moves', active: 'Still playing', women: "Women's game", fame: 'Big clubs' };
export const PSHORT = { character: 'character questions', team: 'not a team player', loyalty: 'moved around', class: 'a modest talent', clubs: 'clubs you dislike', usa: '',
  wrongdoing: 'wrongdoing on record', moneymoves: 'a money or disloyal move' };
const NOW = 2026;
const SPEC = {
  names: PFEATURES,
  pull: PFEATURES.map(f => f === 'loyalty'),
  push: PFEATURES.map(() => false),
  fam: PFEATURES.map(f => PFAMILIAR.includes(f)),
  flags: PFLAGS,
  plusOnly: ['usa'], // not being American isn't a reason against anyone
  prior: PFEATURES.map(() => 0),
  free: true,
};

const seasons = c => Math.max(0.5, (c[3] ?? NOW) - (c[2] ?? NOW));
// clubAff(espnId) -> 0..100 or null (his own clubs give null: who a player played for doesn't count, 2026-11-07);
// ctx: {league: {espnId: key}, standing: {espnId: 0..1}} from the club model
export function pfeatures(p, clubAff, favs, ctx = {}) {
  const t = k => (p.t[k] ?? TDEFAULT[k] ?? 5) / 10, mean = ks => ks.reduce((s, k) => s + t(k), 0) / ks.length;
  let tot = 0, linkW = 0, link = 0, fw = 0, fs = 0;
  for (const c of p.clubs) {
    const s = seasons(c); tot += s;
    const a = c[1] && !favs.has(c[1]) ? clubAff(c[1]) : null;
    if (a != null) { link += s * (a - 50) / 50; linkW += s; }
    const st = c[1] ? ctx.standing?.[c[1]] : null; if (st != null) { fw += s; fs += s * st; }
  }
  const last = [...p.clubs].reverse().find(c => c[1] && ctx.league?.[c[1]]), lg = last ? ctx.league[last[1]] : 'other';
  return [mean(PPARTS.character), mean(PPARTS.team), mean(PPARTS.loyalty), mean(PPARTS.class),
    linkW ? (link / linkW) * Math.min(1, linkW / Math.max(tot, 1)) : 0, p.nat === 'USA' ? 1 : 0,
    Math.max(p.f.serious || 0, (p.f.lesser || 0) * 0.5), Math.max(p.f.money || 0, p.f.moves || 0),
    p.act ? 1 : 0, p.g === 'W' ? 1 : 0, fw ? fs / fw : 0.3, ...PLG.map(l => (lg === l || (l === 'other' && ![...PLG, 'epl'].includes(lg)) ? 1 : 0))];
}
// a group's value 0-10 for the sheet
export const pgroupValue = (p, g) => 10 * PPARTS[g].reduce((s, k) => s + (p.t[k] ?? TDEFAULT[k] ?? 5) / 10, 0) / PPARTS[g].length;

export function fitPlayers(players, clubAff, favs, picks, ctx = {}) {
  const X = Object.fromEntries(Object.entries(players).map(([id, p]) => [id, pfeatures(p, clubAff, favs, ctx)]));
  return fitPairs(X, SPEC, picks);
}

// Next pair: same game (men with men, women with women), close for the model, few answers so far. Who comes up is
// learned from your skips: each group (your clubs, active men, retired men, active women, retired women) is asked about
// in proportion to how often you can answer for it, and a player you've already skipped once comes up much less.
// groups for learning what you can answer: your clubs' players, then active players by their current club's league,
// then retired men / women
export function pgroup(p, favs, leagueOf = () => null) {
  if (p.clubs.some(c => c[1] && favs.has(c[1]))) return 'yours';
  if (!p.act) return p.g === 'W' ? 'w-ret' : 'm-ret';
  const cur = [...p.clubs].reverse().find(c => c[3] == null && c[1]);
  return `${p.g === 'W' ? 'w' : 'm'}-${(cur && leagueOf(cur[1])) || 'other'}`;
}
// How likely Kevin is to know a player before any picks. He started following with the 2026 World Cup, so: current
// stars first (greatness), his clubs' players, and only the true icons among retired players.
export function knownPrior(p, favs) {
  const ab = p.t.AB ?? 5, le = p.t.LE ?? 3;
  if (!p.act) return le >= 9.5 ? 0.4 : le >= 9 ? 0.15 : 0.05;
  const base = ab >= 8 ? 0.85 : ab >= 7 ? 0.6 : ab >= 6 ? 0.3 : ab >= 5 ? 0.15 : 0.08;
  return p.clubs.some(c => c[1] && favs.has(c[1])) ? Math.min(0.95, base + 0.3) : base;
}
const tier = p => (!p.act ? 'r' : (p.t.AB ?? 5) >= 8 ? 'a' : (p.t.AB ?? 5) >= 7 ? 'b' : (p.t.AB ?? 5) >= 6 ? 'c' : 'd');
// opts: {lg: one league's active players only (by current club), known: {id: time} players he says he knows now}
export function nextPlayerPair(model, players, picks, favs = new Set(), leagueOf = () => null, rnd = Math.random, opts = {}) {
  const asked = new Set(picks.map(p => [p.a, p.b].sort().join('|')));
  // answers (2026-11-07): a player's id, '=' no strong opinion, '?<id>' / '??' don't know him / either, null (older) can't say
  const unsureOf = (p, id) => !p.win || p.win === '??' || p.win === '?' + id;
  const curLg = id => { const c = [...players[id].clubs].reverse().find(c => c[3] == null && c[1]); return c ? leagueOf(c[1]) : null; };
  const recent = new Set(picks.slice().sort((x, y) => (y.t || 0) - (x.t || 0)).slice(0, 10).flatMap(p => [p.a, p.b]));
  const cell = id => `${pgroup(players[id], favs, leagueOf)}:${tier(players[id])}`;
  const seen = {}, skips = {}, gn = {}, gs = {}, answered = {}, chosen = new Set(), unknown = new Set();
  for (const p of picks) {
    if (p.win === p.a || p.win === p.b) chosen.add(p.win);
    for (const id of [p.a, p.b]) if (!unsureOf(p, id)) answered[id] = (answered[id] || 0) + 1;
    for (const id of [p.a, p.b]) {
      seen[id] = (seen[id] || 0) + 1; if (unsureOf(p, id)) skips[id] = (skips[id] || 0) + 1;
      if (!players[id]) continue;
      const g = cell(id); gn[g] = (gn[g] || 0) + 1; if (unsureOf(p, id)) gs[g] = (gs[g] || 0) + 1;
    }
  }
  // known: picked at least once, or answered on three times (losing a pair can just mean he picked the one he knew)
  const known = new Set(Object.keys(answered).filter(id => chosen.has(id) || answered[id] >= 3));
  // a skip next to a player he knows is down to the other one
  for (const p of picks) if (!p.win) { if (known.has(p.a) && !known.has(p.b)) unknown.add(p.b); if (known.has(p.b) && !known.has(p.a)) unknown.add(p.a); }
  // players he said he doesn't know, until he says he does
  for (const id of unknownClubs(picks, opts.known || {})) unknown.add(id);
  for (const id in opts.known || {}) if (!unknownClubs(picks, opts.known).includes(id)) unknown.delete(id);
  // answer rate per group and level (e.g. Bundesliga stars vs Bundesliga squad players), starting from the prior and
  // moved by his answers and skips
  const answerRate = id => { const g = cell(id), k = 20; return ((gn[g] || 0) - (gs[g] || 0) + k * knownPrior(players[id], favs)) / ((gn[g] || 0) + k); };
  const pool = Object.keys(players).filter(id => !unknown.has(id) && (known.has(id) || (skips[id] || 0) < 2 + (opts.known?.[id] ? 2 : 0))
    && (!opts.lg || (players[id].act && curLg(id) === opts.lg)));
  // players he has answered on come back (in new pairings); everyone else by how likely he is to know them, sharpened
  // so the pairs lean hard toward names he can answer
  // variety (2026-11-07): a player from the last ten pairs is rested
  const weight = id => (known.has(id) ? 1 / (1 + (seen[id] || 0) / 4) : answerRate(id) ** 4 * (skips[id] ? 0.3 : 1)) * (recent.has(id) ? 0.05 : 1);
  // first player drawn by weight, then the closest-to-call partner among a sample of the same game. One pair in four
  // tries someone new next to a player he knows, so a skip says who he didn't know.
  const sampler = ids => { const W = ids.map(weight), tot = W.reduce((s, w) => s + w, 0);
    return () => { let r = rnd() * tot; for (let i = 0; i < ids.length; i++) { r -= W[i]; if (r <= 0) return ids[i]; } return ids[ids.length - 1]; }; };
  const knownIds = pool.filter(id => known.has(id)), newIds = pool.filter(id => !known.has(id));
  const all = sampler(pool), fromKnown = sampler(knownIds), fromNew = sampler(newIds);
  const explore = knownIds.length < 20 || rnd() < 0.25;
  const drawA = knownIds.length < 20 ? all : fromKnown, drawB = knownIds.length < 20 ? all : explore ? fromNew : fromKnown;
  if (!pool.length) return null;
  // the partner is drawn in proportion to how close the pair is (always taking the closest kept repeating names)
  for (let tries = 0; tries < 20; tries++) {
    const a = drawA(), cand = []; let tot = 0;
    for (let n = 0; n < 60; n++) {
      const b = drawB();
      if (!a || !b || a === b || players[a].g !== players[b].g || asked.has([a, b].sort().join('|'))) continue;
      const s = 0.4 + 1 - Math.abs(model.predict(a, b) - 0.5) * 2; cand.push([s, b]); tot += s;
    }
    if (!cand.length) continue;
    let x = rnd() * tot; for (const [s, b] of cand) { x -= s; if (x <= 0) return [a, b]; }
    return [a, cand.at(-1)[1]];
  }
  return null;
}

// Short facts for the quiz card
export function pfacts(p) {
  const cut = s => (s && s.length > 90 ? s.slice(0, 88).replace(/[ ,;:]+\S*$/, '') + '…' : s || '');
  const career = p.clubs.filter(c => seasons(c) >= 2).map(c => c[0]).slice(-3).join(', ');
  return [['Career', cut(career)], ['Character', cut(p.why?.CH)], ['Record', cut(p.notes)]].filter(f => f[1]);
}
