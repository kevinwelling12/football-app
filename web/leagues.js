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
    name: 'Champions League', short: 'Champions League', tag: 'UCL', region: 'Europe', season: '2026–27', color: '#3A86FF',
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
};
export const ORDER = ['epl', 'bl', 'ucl', 'mls', 'nwsl', 'usl'];
export const FAVORITES = ['Liverpool', 'Borussia Dortmund', 'Sacramento Republic FC', 'Portland Timbers', 'Portland Thorns FC'];
export const zoneScope = z => z.scope || 'all';
