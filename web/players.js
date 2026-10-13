// Player Affinity (2026-10-13): the club framework applied to players. Kevin's goal, in his words: the lists should be
// topped by players he'd like his son to look up to — humble, unselfish, play the game the right way, make time for fans,
// speak out for what is right, stay out of trouble, while delivering performances worthy of the highlight reels.
//
// Pulls (weights >= 0): six researched 0-10 traits (character, team player, loyalty, greatness, joy to watch, legacy),
//   share of career seasons at your clubs, and the seasons-weighted Affinity of the other clubs he played for.
// Pushes (weights <= 0): serious wrongdoing, lesser offences, money/sportswashing moves, disloyal moves.
// Familiarity (fitted, left out of the score): still playing, women's game.
// Fitted on "which player would you rather your son look up to?" picks with the shared engine (affinity.js fitPairs).
import { fitPairs } from './affinity.js';

export const PTRAITS = ['CH', 'WK', 'LO', 'AB', 'ST', 'LE'];
export const PLINKS = ['myClub', 'clubs'];
export const PFLAGS = ['serious', 'lesser', 'money', 'moves'];
export const PFAMILIAR = ['active', 'women'];
export const PFEATURES = [...PTRAITS, ...PLINKS, ...PFLAGS, ...PFAMILIAR];
export const PLABEL = { CH: 'Character', WK: 'Team player', LO: 'Loyalty', AB: 'Greatness', ST: 'Joy to watch', LE: 'Legacy',
  myClub: 'Played for your club', clubs: 'Clubs you like', serious: 'Serious wrongdoing', lesser: 'Lesser offences',
  money: 'Money or sportswashing move', moves: 'Forced a move or joined a rival', active: 'Still playing', women: "Women's game" };
export const PSHORT = { CH: 'character questions', WK: 'not a team player', LO: 'moved around', AB: 'a modest talent', ST: 'functional style',
  LE: 'little legacy', myClub: '', clubs: 'clubs you dislike', serious: 'serious wrongdoing', lesser: 'lesser offences',
  money: 'money or sportswashing move', moves: 'forced a move or joined a rival' };
const PRIOR = { CH: 1, WK: 0.6, LO: 0.5, AB: 0.5, ST: 0.3, LE: 0.4, myClub: 1, clubs: 0.5, serious: -2.5, lesser: -1, money: -1.5, moves: -0.5, active: 0, women: 0 };
const NOW = 2026;
const SPEC = {
  names: PFEATURES,
  pull: PFEATURES.map(f => PTRAITS.includes(f) || PLINKS.includes(f)),
  push: PFEATURES.map(f => PFLAGS.includes(f)),
  fam: PFEATURES.map(f => PFAMILIAR.includes(f)),
  flags: PFLAGS,
  plusOnly: ['myClub'], // not having played for your clubs isn't a reason against anyone
  prior: PFEATURES.map(f => PRIOR[f]),
};

const seasons = c => Math.max(0.5, (c[3] ?? NOW) - (c[2] ?? NOW));
// clubAff(espnId) -> 0..100 or null; favs: Set of your clubs' ESPN ids
export function pfeatures(p, clubAff, favs) {
  let tot = 0, mine = 0, linkW = 0, link = 0;
  for (const c of p.clubs) {
    const s = seasons(c); tot += s;
    if (c[1] && favs.has(c[1])) { mine += s; continue; }
    const a = c[1] ? clubAff(c[1]) : null;
    if (a != null) { link += s * (a - 50) / 50; linkW += s; }
  }
  return [...PTRAITS.map(t => (p.t[t] ?? 5) / 10), tot ? mine / tot : 0, linkW ? (link / linkW) * Math.min(1, linkW / Math.max(tot, 1)) : 0,
    ...PFLAGS.map(f => p.f[f] || 0), p.act ? 1 : 0, p.g === 'W' ? 1 : 0];
}

export function fitPlayers(players, clubAff, favs, picks) {
  const X = Object.fromEntries(Object.entries(players).map(([id, p]) => [id, pfeatures(p, clubAff, favs)]));
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
export function nextPlayerPair(model, players, picks, favs = new Set(), leagueOf = () => null, rnd = Math.random) {
  const asked = new Set(picks.map(p => [p.a, p.b].sort().join('|')));
  const seen = {}, skips = {}, gn = {}, gs = {};
  for (const p of picks) for (const id of [p.a, p.b]) {
    seen[id] = (seen[id] || 0) + 1; if (!p.win) skips[id] = (skips[id] || 0) + 1;
    const g = players[id] && pgroup(players[id], favs, leagueOf); if (!g) continue;
    gn[g] = (gn[g] || 0) + 1; if (!p.win) gs[g] = (gs[g] || 0) + 1;
  }
  // answer rate per group with a prior of 4 answered in 5, so a few skips don't shut a group out
  const answerRate = g => ((gn[g] || 0) - (gs[g] || 0) + 4) / ((gn[g] || 0) + 5);
  const pool = Object.keys(players).filter(id => (skips[id] || 0) < 2);
  const weight = id => answerRate(pgroup(players[id], favs, leagueOf)) * (skips[id] ? 0.3 : 1) / (1 + (seen[id] || 0) / 3);
  // first player drawn by weight, then the closest-to-call partner among a sample of the same game
  const W = pool.map(weight), tot = W.reduce((s, w) => s + w, 0);
  const draw = () => { let r = rnd() * tot; for (let i = 0; i < pool.length; i++) { r -= W[i]; if (r <= 0) return pool[i]; } return pool[pool.length - 1]; };
  let best = null;
  for (let tries = 0; tries < 20 && !best; tries++) {
    const a = draw(); let bs = -1;
    for (let n = 0; n < 60; n++) {
      const b = draw();
      if (a === b || players[a].g !== players[b].g || asked.has([a, b].sort().join('|'))) continue;
      const s = (0.4 + 1 - Math.abs(model.predict(a, b) - 0.5) * 2) * (0.7 + 0.3 * rnd());
      if (s > bs) { bs = s; best = [a, b]; }
    }
  }
  return best;
}

// Short facts for the quiz card
export function pfacts(p) {
  const cut = s => (s && s.length > 90 ? s.slice(0, 88).replace(/[ ,;:]+\S*$/, '') + '…' : s || '');
  const career = p.clubs.filter(c => seasons(c) >= 2).map(c => c[0]).slice(-3).join(', ');
  return [['Career', cut(career)], ['Character', cut(p.why?.CH)], ['Record', cut(p.notes)]].filter(f => f[1]);
}
