// Every ESPN league the scripts read. `track` = shown in the app; the rest only feed the ratings
// (cross-league Elo for the Champions League, second divisions for promoted clubs).
// season = ESPN's season year: European seasons are named by the year they start (2026 = 2026-27).
export const LEAGUES = {
  epl:  { espn: 'eng.1', track: true, euro: true, name: 'Premier League' },
  bl:   { espn: 'ger.1', track: true, euro: true, name: 'Bundesliga' },
  ucl:  { espn: 'uefa.champions', track: true, euro: true, uefa: true, name: 'Champions League' },
  mls:  { espn: 'usa.1', track: true, name: 'MLS' },
  nwsl: { espn: 'usa.nwsl', track: true, name: 'NWSL', women: true },
  usl:  { espn: 'usa.usl.1', track: true, name: 'USL Championship' },
  // rating-only
  esp:  { espn: 'esp.1', euro: true }, ita: { espn: 'ita.1', euro: true }, fra: { espn: 'fra.1', euro: true },
  por:  { espn: 'por.1', euro: true }, ned: { espn: 'ned.1', euro: true }, bel: { espn: 'bel.1', euro: true },
  sco:  { espn: 'sco.1', euro: true }, tur: { espn: 'tur.1', euro: true },
  eng2: { espn: 'eng.2', euro: true }, ger2: { espn: 'ger.2', euro: true },
  uel:  { espn: 'uefa.europa', euro: true, uefa: true }, uecl: { espn: 'uefa.europa.conf', euro: true, uefa: true },
};
export const TRACKED = Object.keys(LEAGUES).filter(k => LEAGUES[k].track);
export const FIRST_SEASON = 2016;
export const CURRENT_SEASON = { euro: 2026, us: 2026 };
export const currentSeason = k => (LEAGUES[k].euro ? CURRENT_SEASON.euro : CURRENT_SEASON.us);
