// ESPN scoreboard event -> compact match record. Shared by the sync scripts and the page (live scores).
const STATE = { STATUS_FULL_TIME: 'ft', STATUS_FINAL: 'ft', STATUS_FINAL_AET: 'aet', STATUS_FINAL_PEN: 'pen',
  STATUS_SCHEDULED: 'pre', STATUS_POSTPONED: 'ppd', STATUS_CANCELED: 'canc', STATUS_ABANDONED: 'canc', STATUS_FORFEIT: 'ft',
  STATUS_DELAYED: 'pre', STATUS_SUSPENDED: 'susp' };
const num = v => (v === undefined || v === null || v === '' ? null : +v);
const americanToDecimal = m => (m == null ? null : m > 0 ? 1 + m / 100 : 1 + 100 / -m);

function parseOdds(c) {
  const o = (c.odds || []).find(x => x && (x.homeTeamOdds || x.drawOdds));
  if (!o) return null;
  const ml = o.moneyline || {};
  const dec = side => {
    const k = { H: 'home', D: 'draw', A: 'away' }[side], c = ml[k]?.close?.odds ?? ml[k]?.open?.odds;
    if (c) return americanToDecimal(num(c));
    const t = side === 'D' ? o.drawOdds : side === 'H' ? o.homeTeamOdds : o.awayTeamOdds;
    if (!t) return null;
    if (t.value) return +t.value;
    return americanToDecimal(num(t.moneyLine));
  };
  const H = dec('H'), D = dec('D'), A = dec('A');
  if (!H || !D || !A) return null;
  const r = { H: +H.toFixed(3), D: +D.toFixed(3), A: +A.toFixed(3), p: o.provider?.name || '' };
  if (o.overUnder) {
    r.L = o.overUnder;
    const tot = o.total || {}, pick = s => s?.close?.odds ?? s?.open?.odds;
    const ov = americanToDecimal(num(pick(tot.over) ?? o.overOdds)), un = americanToDecimal(num(pick(tot.under) ?? o.underOdds));
    if (ov && un) { r.O = +ov.toFixed(3); r.U = +un.toFixed(3); }
  }
  return r;
}

const statMap = c => Object.fromEntries((c.statistics || []).map(s => [s.name, num(s.displayValue)]));

export function parseEvent(e) {
  const c = e.competitions?.[0]; if (!c) return null;
  const home = c.competitors.find(x => x.homeAway === 'home'), away = c.competitors.find(x => x.homeAway === 'away');
  if (!home || !away) return null;
  const stName = c.status?.type?.name || '', state = c.status?.type?.state;
  let st = STATE[stName] || (state === 'in' ? 'live' : state === 'post' ? 'ft' : 'pre');
  const m = { id: e.id, t: e.date, h: home.team.id, a: away.team.id, st };
  if (c.neutralSite) m.n = 1;
  const slug = e.season?.slug || '';
  // Liga MX: two tournaments per ESPN season. tn = 'A2026' (Apertura) / 'C2027' (Clausura); regular-season slugs start
  // 'torneo-', the Play-In and Liguilla ones with the tournament name ('apertura---7th-place-vs-8th-place')
  const tn = /apertura|clausura/i.exec(slug);
  if (tn) m.tn = tn[0][0].toUpperCase() + e.date.slice(0, 4);
  if (/playoff|play-off|round|final|knockout|wild|semi|quarter/i.test(slug) || (tn && !/^torneo/i.test(slug))) m.stage = slug;
  if (['ft', 'aet', 'pen', 'live', 'susp'].includes(st)) { m.hs = num(home.score); m.as = num(away.score); }
  if (st === 'live') {
    m.clock = c.status.type.shortDetail || c.status.displayClock;
    m.min = c.status.type.name === 'STATUS_HALFTIME' ? 45 : parseInt(c.status.displayClock, 10) || 1;
    const rc = [0, 0];
    for (const d of c.details || []) if (d.redCard && d.team) rc[d.team.id === home.team.id ? 0 : 1]++;
    m.rc = rc;
  }
  if (st === 'pen') m.so = [num(home.shootoutScore), num(away.shootoutScore)];
  if (c.leg) m.leg = c.leg.value;
  if (c.series?.totalCompetitions > 1 && /playoff series/i.test(c.series.title || '')) m.series = 1;
  const sh = statMap(home), sa = statMap(away);
  if (m.hs != null && (sh.totalShots || sa.totalShots)) {
    m.sh = [sh.totalShots, sa.totalShots]; m.sot = [sh.shotsOnTarget, sa.shotsOnTarget];
    if (sh.possessionPct) m.pos = [sh.possessionPct, sa.possessionPct];
  }
  const odds = parseOdds(c); if (odds) m.o = odds;
  if (c.broadcasts?.length) m.tv = [...new Set(c.broadcasts.flatMap(b => b.names || []))].join(', ');
  return { m, teams: [home.team, away.team] };
}

export const teamRecord = t => ({ n: t.displayName.trim(), s: (t.shortDisplayName || t.displayName).trim(), a: t.abbreviation,
  c: t.color ? '#' + t.color : null, c2: t.alternateColor ? '#' + t.alternateColor : null, logo: t.logo || null });

