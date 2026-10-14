// Every ESPN league the scripts read. `track` = shown in the app; the rest only feed the ratings
// (cross-league Elo for the Champions League, 2. Bundesliga for promoted clubs).
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
  // rating-only
  por:  { espn: 'por.1', euro: true }, ned: { espn: 'ned.1', euro: true }, bel: { espn: 'bel.1', euro: true },
  sco:  { espn: 'sco.1', euro: true }, tur: { espn: 'tur.1', euro: true },
  ger2: { espn: 'ger.2', euro: true },
  uel:  { espn: 'uefa.europa', euro: true, uefa: true }, uecl: { espn: 'uefa.europa.conf', euro: true, uefa: true },
  // rating-only, Americas: the matches that put MLS and Liga MX clubs on one scale
  lcup: { espn: 'concacaf.leagues.cup', cup: true, probes: ['0801', '0725', '0901'] },
  ccc:  { espn: 'concacaf.champions', cup: true, probes: ['0315', '0901', '1015', '0215'] },
};
// cup competitions: clubs from several leagues, few matches each
export const isCup = k => !!(LEAGUES[k].uefa || LEAGUES[k].cup);
export const TRACKED = Object.keys(LEAGUES).filter(k => LEAGUES[k].track);
export const FIRST_SEASON = 2016;
export const CURRENT_SEASON = { euro: 2026, us: 2026 };
export const currentSeason = k => (LEAGUES[k].euro || LEAGUES[k].split ? CURRENT_SEASON.euro : CURRENT_SEASON.us);
