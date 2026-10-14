// Competition rules: zones (finishing places that matter), tiebreakers and post-season formats.
// pos ranges are 1-based and inclusive; scope 'group' = within a conference, 'all' = the single table.
export const LEAGUES = {
  epl: {
    name: 'Premier League', short: 'Premier League', tag: 'EPL', region: 'Europe', season: '2026–27', color: '#9B5DE5',
    tiebreak: ['pts', 'gd', 'gf'],
    zones: [
      { key: 'title', label: 'Champions', short: 'Title', from: 1, to: 1, tone: 'gold' },
      { key: 'ucl', label: 'Champions League', short: 'Top 4', from: 1, to: 4, tone: 'good' },
      { key: 'eur', label: 'Europa / Conference', short: 'Europe', from: 5, to: 6, tone: 'ok' },
      { key: 'rel', label: 'Relegation', short: 'Down', from: 18, to: 20, tone: 'bad' },
    ],
    columns: ['title', 'ucl', 'rel'],
    note: 'A fifth Champions League place goes to England if its clubs finish top of UEFA\'s season ranking.',
  },
  bl: {
    name: 'Bundesliga', short: 'Bundesliga', tag: 'BL', region: 'Europe', season: '2026–27', color: '#E63946',
    tiebreak: ['pts', 'gd', 'gf'],
    zones: [
      { key: 'title', label: 'Champions', short: 'Title', from: 1, to: 1, tone: 'gold' },
      { key: 'ucl', label: 'Champions League', short: 'Top 4', from: 1, to: 4, tone: 'good' },
      { key: 'eur', label: 'Europa / Conference', short: 'Europe', from: 5, to: 6, tone: 'ok' },
      { key: 'po', label: 'Relegation play-off', short: '16th', from: 16, to: 16, tone: 'warn' },
      { key: 'rel', label: 'Relegation', short: 'Down', from: 17, to: 18, tone: 'bad' },
    ],
    columns: ['title', 'ucl', 'rel'],
  },
  ucl: {
    // cup: clubs from many leagues; each club belongs to its domestic league where the app shows it (app.js HOME_ORDER)
    name: 'Champions League', short: 'Champions League', tag: 'UCL', region: 'Europe', season: '2026–27', color: '#3A86FF', cup: true,
    // league phase ranking (Art. 18): points, goal difference, goals, away goals, wins (then away wins, opponents'
    // points, goal difference and goals, discipline, coefficient: not modelled)
    tiebreak: ['pts', 'gd', 'gf', 'awayGf', 'w'],
    zones: [
      { key: 'r16', label: 'Round of 16', short: 'Top 8', from: 1, to: 8, tone: 'good' },
      { key: 'ko', label: 'Knockout play-off', short: 'Top 24', from: 1, to: 24, tone: 'ok' },
    ],
    playoffs: { type: 'ucl' },
    columns: ['r16', 'ko', 'champ'],
  },
  mls: {
    name: 'MLS', short: 'MLS', tag: 'MLS', region: 'USA', season: '2026', color: '#2EC4B6',
    tiebreak: ['pts', 'w', 'gd', 'gf'], groups: true,
    zones: [
      { key: 'shield', label: "Supporters' Shield", short: 'Shield', from: 1, to: 1, scope: 'all', tone: 'gold' },
      { key: 'bye', label: 'Round One (top 7)', short: 'Top 7', from: 1, to: 7, scope: 'group', tone: 'good' },
      { key: 'po', label: 'Playoffs (top 9)', short: 'Top 9', from: 1, to: 9, scope: 'group', tone: 'ok' },
    ],
    playoffs: { type: 'mls' },
    columns: ['po', 'bye', 'shield', 'champ'],
  },
  nwsl: {
    name: 'NWSL', short: 'NWSL', tag: 'NWSL', region: 'USA', season: '2026', color: '#F15BB5',
    tiebreak: ['pts', 'gd', 'gf', 'w'],
    zones: [
      { key: 'shield', label: 'NWSL Shield', short: 'Shield', from: 1, to: 1, tone: 'gold' },
      { key: 'home', label: 'Home quarterfinal', short: 'Top 4', from: 1, to: 4, tone: 'good' },
      { key: 'po', label: 'Playoffs (top 8)', short: 'Top 8', from: 1, to: 8, tone: 'ok' },
    ],
    playoffs: { type: 'nwsl' },
    columns: ['po', 'home', 'shield', 'champ'],
  },
  usl: {
    name: 'USL Championship', short: 'USL', tag: 'USL', region: 'USA', season: '2026', color: '#FB8500',
    // official order: head-to-head points and goal difference, in-conference points per game, wins, goal difference, goals
    tiebreak: ['pts', 'h2h', 'w', 'gd', 'gf'], groups: true,
    zones: [
      { key: 'shield', label: "Players' Shield", short: 'Shield', from: 1, to: 1, scope: 'all', tone: 'gold' },
      { key: 'home', label: 'Home quarterfinal', short: 'Top 4', from: 1, to: 4, scope: 'group', tone: 'good' },
      { key: 'po', label: 'Playoffs (top 8)', short: 'Top 8', from: 1, to: 8, scope: 'group', tone: 'ok' },
    ],
    playoffs: { type: 'usl' },
    columns: ['po', 'home', 'shield', 'champ'],
  },
  esp: {
    name: 'La Liga', short: 'La Liga', tag: 'LL', region: 'Europe', season: '2026–27', color: '#E9C46A',
    // official order: points, head-to-head points, head-to-head goal difference (once the clubs have played each other
    // twice), goal difference, goals scored
    tiebreak: ['pts', 'h2h', 'gd', 'gf'], h2hComplete: true,
    zones: [
      { key: 'title', label: 'Champions', short: 'Title', from: 1, to: 1, tone: 'gold' },
      { key: 'ucl', label: 'Champions League', short: 'Top 4', from: 1, to: 4, tone: 'good' },
      { key: 'eur', label: 'Europa / Conference', short: 'Europe', from: 5, to: 6, tone: 'ok' },
      { key: 'rel', label: 'Relegation', short: 'Down', from: 18, to: 20, tone: 'bad' },
    ],
    columns: ['title', 'ucl', 'rel'],
    note: 'Level on points: head-to-head record first (once both matches are played), then goal difference. A fifth Champions League place goes to Spain if its clubs top UEFA\'s season ranking.',
  },
  ita: {
    name: 'Serie A', short: 'Serie A', tag: 'SA', region: 'Europe', season: '2026–27', color: '#7FB069',
    // official order: points, head-to-head points, head-to-head goal difference, goal difference, goals scored
    // (a one-off play-off decides a tie for first place or for the last relegation place; not simulated)
    tiebreak: ['pts', 'h2h', 'gd', 'gf'], h2hComplete: true,
    zones: [
      { key: 'title', label: 'Champions', short: 'Title', from: 1, to: 1, tone: 'gold' },
      { key: 'ucl', label: 'Champions League', short: 'Top 4', from: 1, to: 4, tone: 'good' },
      { key: 'eur', label: 'Europa / Conference', short: 'Europe', from: 5, to: 6, tone: 'ok' },
      { key: 'rel', label: 'Relegation', short: 'Down', from: 18, to: 20, tone: 'bad' },
    ],
    columns: ['title', 'ucl', 'rel'],
    note: 'Level on points: head-to-head record first, then goal difference. A tie for first place or for 17th is settled by a one-off play-off, which the simulations don\'t model.',
  },
  fra: {
    name: 'Ligue 1', short: 'Ligue 1', tag: 'L1', region: 'Europe', season: '2026–27', color: '#94A3B8',
    // official order: points, goal difference, head-to-head points and goal difference, goals scored
    tiebreak: ['pts', 'gd', 'h2h', 'gf'], h2hComplete: true,
    zones: [
      { key: 'title', label: 'Champions', short: 'Title', from: 1, to: 1, tone: 'gold' },
      { key: 'ucl', label: 'Champions League', short: 'Top 3', from: 1, to: 3, tone: 'good' },
      { key: 'ucq', label: 'Champions League qualifying', short: '4th', from: 4, to: 4, tone: 'good' },
      { key: 'eur', label: 'Europa / Conference', short: 'Europe', from: 5, to: 6, tone: 'ok' },
      { key: 'po', label: 'Relegation play-off', short: '16th', from: 16, to: 16, tone: 'warn' },
      { key: 'rel', label: 'Relegation', short: 'Down', from: 17, to: 18, tone: 'bad' },
    ],
    columns: ['title', 'ucl', 'rel'],
    note: '4th goes into Champions League qualifying (third round). 16th plays the Ligue 2 play-off winner over two legs.',
  },
  eng2: {
    name: 'Championship', short: 'Championship', tag: 'EFL', region: 'Europe', season: '2026–27', color: '#A47148',
    tiebreak: ['pts', 'gd', 'gf'],
    zones: [
      { key: 'auto', label: 'Automatic promotion', short: 'Top 2', from: 1, to: 2, tone: 'gold' },
      { key: 'po', label: 'Play-offs or better', short: 'Top 6', from: 1, to: 6, tone: 'good' },
      { key: 'rel', label: 'Relegation', short: 'Down', from: 22, to: 24, tone: 'bad' },
    ],
    playoffs: { type: 'efl', outcome: 'up' },
    columns: ['auto', 'po', 'up', 'rel'],
    note: 'Play-offs: 3rd v 6th and 4th v 5th over two legs (the higher place at home second), then a final at Wembley. Three clubs go up.',
  },
  mex: {
    name: 'Liga MX', short: 'Liga MX', tag: 'MX', region: 'Mexico', pool: 'mls', season: '2026–27', color: '#52B788',
    // two tournaments a season (Apertura Jul-Dec, Clausura Jan-May); the published data and the table are the current
    // one only (scripts/sync.mjs). Official order: points, goal difference, goals scored, head-to-head, away goals
    // (then relegation coefficient and fair play, not modelled).
    tiebreak: ['pts', 'gd', 'gf', 'h2h', 'awayGf'],
    zones: [
      { key: 'shield', label: 'Superlíder (top of the table)', short: '1st', from: 1, to: 1, tone: 'gold' },
      { key: 'home', label: 'Quarter-final, second leg at home', short: 'Top 4', from: 1, to: 4, tone: 'good' },
      { key: 'po', label: 'Liguilla (top 8)', short: 'Top 8', from: 1, to: 8, tone: 'ok' },
    ],
    playoffs: { type: 'mex' },
    columns: ['po', 'home', 'champ'],
    note: 'Liguilla: the top eight, 1st v 8th, 2nd v 7th, 3rd v 6th, 4th v 5th, then reseeded. Every round is two legs with the higher place at home second; level on aggregate, the higher place goes through, except in the final (extra time, then penalties). No Play-In since the Clausura 2026, and no relegation.',
  },
  // Europa League and Conference League 2026-27: the Champions League format (regulations Art. 18 and 19 are the same):
  // 36 clubs, 1-8 to the round of 16, 9-24 to the knockout play-off (9/10 v 23/24 ... 15/16 v 17/18), 25-36 out;
  // two-legged ties, a single final at a neutral venue. Europa League 8 league-phase matches each, Conference League 6.
  uel: {
    name: 'Europa League', short: 'Europa League', tag: 'UEL', region: 'Europe', season: '2026–27', color: '#56CFE1', cup: true,
    tiebreak: ['pts', 'gd', 'gf', 'awayGf', 'w'],
    zones: [
      { key: 'r16', label: 'Round of 16', short: 'Top 8', from: 1, to: 8, tone: 'good' },
      { key: 'ko', label: 'Knockout play-off', short: 'Top 24', from: 1, to: 24, tone: 'ok' },
    ],
    playoffs: { type: 'ucl' },
    columns: ['r16', 'ko', 'champ'],
  },
  uecl: {
    name: 'Conference League', short: 'Conference League', tag: 'UECL', region: 'Europe', season: '2026–27', color: '#B5838D', cup: true,
    tiebreak: ['pts', 'gd', 'gf', 'awayGf', 'w'],
    zones: [
      { key: 'r16', label: 'Round of 16', short: 'Top 8', from: 1, to: 8, tone: 'good' },
      { key: 'ko', label: 'Knockout play-off', short: 'Top 24', from: 1, to: 24, tone: 'ok' },
    ],
    playoffs: { type: 'ucl' },
    columns: ['r16', 'ko', 'champ'],
  },
};
export const ORDER = ['epl', 'bl', 'ucl', 'mls', 'nwsl', 'usl', 'esp', 'ita', 'fra', 'eng2', 'mex', 'uel', 'uecl'];
// Kevin's own competitions (the rest are shown more quietly on Today)
export const MAIN = ['epl', 'bl', 'ucl', 'mls', 'nwsl', 'usl'];
export const FAVORITES = ['Liverpool', 'Borussia Dortmund', 'Sacramento Republic FC', 'Portland Timbers', 'Portland Thorns FC'];
export const zoneScope = z => z.scope || 'all';
