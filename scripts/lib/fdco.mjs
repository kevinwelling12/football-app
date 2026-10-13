// football-data.co.uk closing odds (free CSVs in history/odds/), joined to ESPN matches by date, score and team names.
// Used only by backtests: ESPN drops odds once a match is played.
import fs from 'node:fs';

const FILES = { epl: 'E0', bl: 'D1', eng2: 'E1', ger2: 'D2' };
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(fc|afc|cf|sc|sv|tsg|vfl|vfb|fsv|bv|bvb|1\.|04|05|1899|1846|united|city|town|club|de|the)\b/g, ' ').replace(/[^a-z]/g, '');
const sim = (a, b) => { a = norm(a); b = norm(b); if (!a || !b) return 0; if (a.includes(b) || b.includes(a)) return 1; let n = 0; while (n < a.length && a[n] === b[n]) n++; return n / Math.min(a.length, b.length); };

function parseCSV(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const head = lines[0].split(',');
  return lines.slice(1).map(l => { const v = l.split(','); return Object.fromEntries(head.map((h, i) => [h, v[i]])); });
}
const dmy = s => { const [d, m, y] = s.split('/'); return `${y.length === 2 ? '20' + y : y}-${m}-${d}`; };

function rowsFor(lg) {
  const out = [];
  if (FILES[lg]) {
    for (const f of fs.readdirSync('history/odds').filter(f => f.startsWith(FILES[lg] + '_'))) {
      for (const r of parseCSV(fs.readFileSync('history/odds/' + f, 'utf8'))) {
        if (!r.Date || r.FTHG === '') continue;
        const H = +(r.B365CH || r.AvgCH || r.B365H), D = +(r.B365CD || r.AvgCD || r.B365D), A = +(r.B365CA || r.AvgCA || r.B365A);
        const O = +(r['B365C>2.5'] || r['AvgC>2.5'] || r['B365>2.5']), U = +(r['B365C<2.5'] || r['AvgC<2.5'] || r['B365<2.5']);
        out.push({ date: dmy(r.Date), home: r.HomeTeam, away: r.AwayTeam, hs: +r.FTHG, as: +r.FTAG, o: { H, D, A, ...(O && U ? { L: 2.5, O, U } : {}) } });
      }
    }
  } else if (lg === 'mls' && fs.existsSync('history/odds/USA.csv')) {
    for (const r of parseCSV(fs.readFileSync('history/odds/USA.csv', 'utf8'))) {
      if (r.League !== 'MLS' || r.HG === '') continue;
      const H = +(r.B365CH || r.AvgCH || r.PSCH), D = +(r.B365CD || r.AvgCD || r.PSCD), A = +(r.B365CA || r.AvgCA || r.PSCA);
      out.push({ date: dmy(r.Date), home: r.Home, away: r.Away, hs: +r.HG, as: +r.AG, o: { H, D, A } });
    }
  }
  return out.filter(r => r.o.H > 1 && r.o.D > 1 && r.o.A > 1);
}

// Attach m.co (closing odds) to the matches of league lg. Returns the number joined.
export function attachOdds(matches, teams, lg) {
  const rows = rowsFor(lg); if (!rows.length) return 0;
  const byKey = new Map();
  for (const m of matches) {
    if (m.lg !== lg || m.hs == null) continue;
    for (const off of [0, -1, 1]) {
      const d = new Date(Date.parse(m.t) + off * 864e5).toISOString().slice(0, 10);
      const k = `${d}|${m.hs}|${m.as}`; (byKey.get(k) || byKey.set(k, []).get(k)).push(m);
    }
  }
  let n = 0;
  for (const r of rows) {
    const cands = byKey.get(`${r.date}|${r.hs}|${r.as}`) || [];
    let best = null, bs = 0.5;
    for (const m of cands) { const s = sim(r.home, teams[m.h]?.n || '') + sim(r.away, teams[m.a]?.n || ''); if (s > bs * 2 && (!best || s > bs)) { best = m; bs = s / 2; } }
    if (best && !best.co) { best.co = r.o; n++; }
  }
  return n;
}
