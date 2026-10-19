// Team strength: Elo (whole history, cross-league in Europe) and a time-weighted Dixon-Coles style
// attack/defence fit whose targets mix goals with a shots-based expected-goals proxy, regressed toward an
// Elo-based prior. Everything here is walk-forward safe: a fit at day D only reads matches before D.
import { played, hasShots } from './history.mjs';
import { isCup, LEAGUES } from './leagues.mjs';

// ---------------------------------------------------------------- Elo
// Starting level for a club's first appearance, by league (Europe is one pool linked by UEFA matches).
const ENG3 = 1380, ENG4 = 1260, NONLEAGUE = 1150, GER3 = 1250, USOC = 1300; // checked against 2,044 cup ties 2019-25
const ELO_START = { epl: 1650, esp: 1630, ger: 1610, bl: 1610, ita: 1610, fra: 1570, por: 1530, ned: 1520,
  bel: 1480, tur: 1480, sco: 1440, eng2: 1470, ger2: 1450, ucl: 1450, uel: 1400, uecl: 1350, lcup: 1450, ccc: 1350,
  // a club whose first match is a domestic cup tie is from below the leagues we load (3. Liga, non-league, amateurs)
  eng3: ENG3, eng4: ENG4, flc: ENG4, fac: NONLEAGUE, dfb: GER3, usoc: USOC };

// Incremental, so a walk-forward test can read ratings as of any day: elo.add(m) in time order, elo.R = ratings now.
export class Elo {
  constructor({ K = 22, HFA = 60, carry = 0.85 } = {}) { Object.assign(this, { K, HFA, carry, R: {}, last: {}, lgOf: {} }); }
  leagueMean(lg) { let s = 0, n = 0; for (const t in this.lgOf) if (this.lgOf[t] === lg) { s += this.R[t]; n++; } return n ? s / n : 1500; }
  add(m) {
    const { R } = this, uefa = isCup(m.lg); // UEFA and Concacaf cups alike
    for (const t of [m.h, m.a]) {
      if (R[t] == null) R[t] = (ELO_START[m.lg] ?? 1500) - (uefa ? 0 : 30);
      // a new season in a domestic league pulls the club a little toward that league's mean
      if (!uefa) {
        const tag = `${m.lg}${m.season}`;
        if (this.last[t] != null && this.last[t] !== tag && this.lgOf[t] === m.lg) R[t] = this.carry * R[t] + (1 - this.carry) * this.leagueMean(m.lg);
        this.last[t] = tag; this.lgOf[t] = m.lg;
      }
    }
    if (!played(m)) return;
    const dr = R[m.h] - R[m.a] + (m.n ? 0 : this.HFA), we = 1 / (1 + 10 ** (-dr / 400));
    const gd = Math.abs(m.hs - m.as), W = m.hs > m.as ? 1 : m.hs === m.as ? 0.5 : 0;
    const G = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
    const d = this.K * G * (uefa && !LEAGUES[m.lg].ko ? 1.25 : 1) * (W - we);
    R[m.h] += d; R[m.a] -= d;
  }
}

// ---------------------------------------------------------------- xG proxy
// goals ~ a * shots on target + b * other shots (least squares, no intercept), per pool
export function fitShotModel(matches) {
  let s11 = 0, s12 = 0, s22 = 0, y1 = 0, y2 = 0;
  for (const m of matches) {
    if (!played(m) || !hasShots(m)) continue;
    for (const [g, sh, sot] of [[m.hs, m.sh[0], m.sot[0]], [m.as, m.sh[1], m.sot[1]]]) {
      const x1 = sot, x2 = Math.max(0, sh - sot);
      s11 += x1 * x1; s12 += x1 * x2; s22 += x2 * x2; y1 += x1 * g; y2 += x2 * g;
    }
  }
  const det = s11 * s22 - s12 * s12;
  if (!det) return { a: 0.3, b: 0.03 };
  return { a: (y1 * s22 - y2 * s12) / det, b: (s11 * y2 - s12 * y1) / det };
}
export const xgOf = (m, sm) => [sm.a * m.sot[0] + sm.b * Math.max(0, m.sh[0] - m.sot[0]), sm.a * m.sot[1] + sm.b * Math.max(0, m.sh[1] - m.sot[1])];

// ---------------------------------------------------------------- attack / defence fit
// P: { halfLife (days), wGoals (0..1, rest is the shots proxy), k (prior strength in matches), gamma (log-goal per 400 Elo) }
// elo: {teamId: rating at the fit date}. Returns {A, D, base, eloMean}.
export function fitStrength(matches, day, P, elo, sm) {
  const xi = Math.log(2) / P.halfLife, cutoff = day - P.halfLife * 5;
  const rows = [];
  for (const m of matches) {
    if (m.d >= day) break;
    if (m.d < cutoff || !played(m)) continue;
    const w = Math.exp(-xi * (day - m.d));
    let yh = m.hs, ya = m.as;
    if (P.wGoals < 1 && hasShots(m)) { const x = xgOf(m, sm); yh = P.wGoals * m.hs + (1 - P.wGoals) * x[0]; ya = P.wGoals * m.as + (1 - P.wGoals) * x[1]; }
    rows.push({ h: m.h, a: m.a, lg: m.lg, n: m.n, w, yh, ya });
  }
  // league base rates (home, away); neutral venues use the mean of the two
  const bs = {};
  for (const r of rows) { const b = bs[r.lg] || (bs[r.lg] = { w: 0, h: 0, a: 0 }); b.w += r.w; b.h += r.w * r.yh; b.a += r.w * r.ya; }
  const base = {};
  for (const lg in bs) { const b = bs[lg]; base[lg] = b.w > 30 ? [b.h / b.w, b.a / b.w] : [1.5, 1.2]; }
  // Elo prior
  const ids = new Set(); for (const r of rows) { ids.add(r.h); ids.add(r.a); }
  const ev = [...ids].map(t => elo[t] ?? 1500), eloMean = ev.reduce((a, b) => a + b, 0) / (ev.length || 1);
  const pA = {}, pD = {}, A = {}, D = {};
  for (const t of ids) { const z = ((elo[t] ?? eloMean) - eloMean) / 400; pA[t] = Math.exp(P.gamma * z / 2); pD[t] = Math.exp(-P.gamma * z / 2); A[t] = pA[t]; D[t] = pD[t]; }
  const avg = 1.35;
  for (let it = 0; it < 8; it++) {
    const nA = {}, dA = {}, nD = {}, dD = {};
    for (const t of ids) { nA[t] = P.k * avg * pA[t]; dA[t] = P.k * avg; nD[t] = P.k * avg * pD[t]; dD[t] = P.k * avg; }
    for (const r of rows) {
      const [bh, ba] = r.n ? [(base[r.lg][0] + base[r.lg][1]) / 2, (base[r.lg][0] + base[r.lg][1]) / 2] : base[r.lg];
      nA[r.h] += r.w * r.yh; dA[r.h] += r.w * bh * D[r.a];
      nA[r.a] += r.w * r.ya; dA[r.a] += r.w * ba * D[r.h];
      nD[r.h] += r.w * r.ya; dD[r.h] += r.w * ba * A[r.a];
      nD[r.a] += r.w * r.yh; dD[r.a] += r.w * bh * A[r.h];
    }
    for (const t of ids) { A[t] = nA[t] / dA[t]; D[t] = nD[t] / dD[t]; }
  }
  return { A, D, base, eloMean, pA, pD };
}

// Expected goals for a fixture from a fit. Clubs the fit hasn't seen get their Elo prior.
export function rates(fit, m, elo, P) {
  const get = (t) => {
    if (fit.A[t] != null) return [fit.A[t], fit.D[t]];
    const z = ((elo[t] ?? fit.eloMean - 100) - fit.eloMean) / 400;
    return [Math.exp(P.gamma * z / 2), Math.exp(-P.gamma * z / 2)];
  };
  const b = fit.base[m.lg] || [1.5, 1.2], [bh, ba] = m.n ? [(b[0] + b[1]) / 2, (b[0] + b[1]) / 2] : b;
  const [Ah, Dh] = get(m.h), [Aa, Da] = get(m.a);
  return [bh * Ah * Da, ba * Aa * Dh];
}
