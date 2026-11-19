// Every ESPN league the scripts read. `track` = shown in the app; the rest only feed the ratings
// (cross-league Elo for the UEFA cups, 2. Bundesliga for promoted clubs, League One and Two for cup ties).
// season = ESPN's season year: European seasons are named by the year they start (2026 = 2026-27). Liga MX too since
// 2023 (2026 = Apertura 2026 + Clausura 2027); 2016-2021 were calendar years and 2022 ran Jan 2022 to May 2023.
// probes = month-days asked to find a season's calendar (the first whose season year matches wins).
export const LEAGUES = {
  epl:  { espn: 'eng.1', track: true, euro: true, name: 'Premier League' },
  bl:   { espn: 'ger.1', track: true, euro: true, name: 'Bundesliga' },
  ucl:  { espn: 'uefa.champions', track: true, euro: true, uefa: true, name: 'Champions League' },
  mls:  { espn: 'usa.1', track: true, name: 'MLS' },
  nwsl: { espn: 'usa.nwsl', track: true, name: 'NWSL', women: true },
  usl:  { espn: 'usa.usl.1', track: true, name: 'USL Championship' },
  esp:  { espn: 'esp.1', track: true, euro: true, name: 'La Liga' },
  ita:  { espn: 'ita.1', track: true, euro: true, name: 'Serie A' },
  fra:  { espn: 'fra.1', track: true, euro: true, name: 'Ligue 1' },
  eng2: { espn: 'eng.2', track: true, euro: true, name: 'Championship' },
  mex:  { espn: 'mex.1', track: true, split: true, name: 'Liga MX', probes: ['0815', '0301', '1015'] },
  uel:  { espn: 'uefa.europa', track: true, euro: true, uefa: true, name: 'Europa League' },
  uecl: { espn: 'uefa.europa.conf', track: true, euro: true, uefa: true, name: 'Conference League' },
  // domestic cups (ko: knockout, fetched a calendar year per request; shown in the app beside the leagues, not as pages).
// base: the league whose home/away goal rates a cup tie uses (a cup's own are skewed: amateur hosts lose heavily)
  flc:  { espn: 'eng.league_cup', track: true, euro: true, cup: true, ko: true, base: 'epl', name: 'Carabao Cup' },
  fac:  { espn: 'eng.fa', track: true, euro: true, cup: true, ko: true, base: 'epl', name: 'FA Cup' },
  dfb:  { espn: 'ger.dfb_pokal', track: true, euro: true, cup: true, ko: true, base: 'bl', name: 'DFB-Pokal' },
  usoc: { espn: 'usa.open', track: true, cup: true, ko: true, base: 'mls', name: 'U.S. Open Cup' },
  // rating-only
  por:  { espn: 'por.1', euro: true }, ned: { espn: 'ned.1', euro: true }, bel: { espn: 'bel.1', euro: true },
  sco:  { espn: 'sco.1', euro: true }, tur: { espn: 'tur.1', euro: true },
  ger2: { espn: 'ger.2', euro: true },
  // League One and Two: the clubs English cup draws bring in (3. Liga isn't on ESPN; its clubs are rated from cup matches)
  eng3: { espn: 'eng.3', euro: true }, eng4: { espn: 'eng.4', euro: true },
  // rating-only, Americas: the matches that put MLS and Liga MX clubs on one scale
  lcup: { espn: 'concacaf.leagues.cup', cup: true, probes: ['0801', '0725', '0901'] },
  ccc:  { espn: 'concacaf.champions', cup: true, probes: ['0315', '0901', '1015', '0215'] },
  // National teams (since 2026-11-19): intl = men, wintl = women. Fetched a calendar year per request; the season is
  // the calendar year (history/<k>/<year>.json) and each match keeps ESPN's edition (m.ed: 2026 = the 2026-27 Nations
  // League). track = shown in the app; the rest only feed the national-team ratings. kw scales the Elo step (friendlies
  // count less, tournaments more).
  cnl:  { espn: 'concacaf.nations.league', intl: 'm', track: true, name: 'Concacaf Nations League' },
  unl:  { espn: 'uefa.nations', intl: 'm', track: true, name: 'UEFA Nations League' },
  ifr:  { espn: 'fifa.friendly', intl: 'm', track: true, kw: 0.6, name: 'Friendlies' },
  wc:   { espn: 'fifa.world', intl: 'm', kw: 1.5 }, wcp: { espn: 'fifa.wcq.ply', intl: 'm' },
  wqe:  { espn: 'fifa.worldq.uefa', intl: 'm' }, wqn: { espn: 'fifa.worldq.concacaf', intl: 'm' },
  wqs:  { espn: 'fifa.worldq.conmebol', intl: 'm' }, wqa: { espn: 'fifa.worldq.afc', intl: 'm' },
  wqf:  { espn: 'fifa.worldq.caf', intl: 'm' }, wqo: { espn: 'fifa.worldq.ofc', intl: 'm' },
  euro: { espn: 'uefa.euro', intl: 'm', kw: 1.25 }, euq: { espn: 'uefa.euroq', intl: 'm' },
  copa: { espn: 'conmebol.america', intl: 'm', kw: 1.25 }, gold: { espn: 'concacaf.gold', intl: 'm', kw: 1.25 },
  gldq: { espn: 'concacaf.gold_qual', intl: 'm' }, afcn: { espn: 'caf.nations', intl: 'm', kw: 1.25 },
  afcq: { espn: 'caf.nations_qual', intl: 'm' }, asia: { espn: 'afc.asian.cup', intl: 'm', kw: 1.25 },
  asiq: { espn: 'afc.cupq', intl: 'm' },
  wcc:  { espn: 'concacaf.womens.championship', intl: 'w', track: true, kw: 1.25, name: 'Concacaf W Championship' },
  wwcq: { espn: 'fifa.wworldq.uefa', intl: 'w', track: true, name: "Women's World Cup qualifying (UEFA)" },
  wfr:  { espn: 'fifa.friendly.w', intl: 'w', track: true, kw: 0.6, name: "Women's friendlies" },
  wwc:  { espn: 'fifa.wwc', intl: 'w', kw: 1.5 }, wwcp: { espn: 'fifa.wwcq.ply', intl: 'w' },
  wshe: { espn: 'fifa.shebelieves', intl: 'w', kw: 0.8 }, woly: { espn: 'fifa.w.olympics', intl: 'w', kw: 1.25 },
  weur: { espn: 'uefa.weuro', intl: 'w', kw: 1.25 }, wunl: { espn: 'uefa.w.nations', intl: 'w' },
  wgld: { espn: 'concacaf.w.gold', intl: 'w', kw: 1.25 }, wcpa: { espn: 'conmebol.america.femenina', intl: 'w', kw: 1.25 },
  wasi: { espn: 'afc.w.asian.cup', intl: 'w', kw: 1.25 }, wafc: { espn: 'caf.w.nations', intl: 'w', kw: 1.25 },
  wfin: { espn: 'global.w.finalissima', intl: 'w' },
};
// cup competitions: clubs from several leagues, few matches each
export const isCup = k => !!(LEAGUES[k].uefa || LEAGUES[k].cup);
export const TRACKED = Object.keys(LEAGUES).filter(k => LEAGUES[k].track);
export const FIRST_SEASON = 2016;
export const CURRENT_SEASON = { euro: 2026, us: 2026 };
export const currentSeason = k => (LEAGUES[k].intl ? new Date().getUTCFullYear() : LEAGUES[k].euro || LEAGUES[k].split ? CURRENT_SEASON.euro : CURRENT_SEASON.us);
