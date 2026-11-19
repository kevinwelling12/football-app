// Match probabilities: Dixon-Coles scoreline grids, draw calibration, the betting-market blend.
// Shared by the page, its simulation worker and the Node scripts (backtests, sync).
export const KMAX = 10, W = KMAX + 1;

export function poisVec(l) {
  const v = new Float64Array(W); v[0] = Math.exp(-l);
  for (let i = 1; i <= KMAX; i++) v[i] = v[i - 1] * l / i;
  return v;
}

// Grid g[h * W + a] = P(home h, away a) with Dixon-Coles low-score correction rho, then draws scaled by drawK.
export function grid(lh, la, rho = 0, drawK = 1) {
  const ph = poisVec(lh), pa = poisVec(la), g = new Float64Array(W * W);
  for (let h = 0; h <= KMAX; h++) for (let a = 0; a <= KMAX; a++) g[h * W + a] = ph[h] * pa[a];
  if (rho) { g[0] *= 1 - lh * la * rho; g[1] *= 1 + lh * rho; g[W] *= 1 + la * rho; g[W + 1] *= 1 - rho; }
  if (drawK !== 1) for (let k = 0; k <= KMAX; k++) g[k * W + k] *= drawK;
  return normalise(g);
}

export function normalise(g) {
  let s = 0; for (let i = 0; i < g.length; i++) s += g[i];
  for (let i = 0; i < g.length; i++) g[i] /= s;
  return g;
}

export function outcomes(g) {
  let H = 0, D = 0, A = 0;
  for (let h = 0; h <= KMAX; h++) for (let a = 0; a <= KMAX; a++) { const p = g[h * W + a]; if (h > a) H += p; else if (h === a) D += p; else A += p; }
  return { H, D, A };
}

export function expectedGoals(g) {
  let eh = 0, ea = 0;
  for (let h = 0; h <= KMAX; h++) for (let a = 0; a <= KMAX; a++) { eh += h * g[h * W + a]; ea += a * g[h * W + a]; }
  return [eh, ea];
}

// Bookmaker odds -> scoreline grid. Margin removed proportionally; total goals from the over/under price when there is one
// (else the model's total); the goal split solved so P(home) - P(away) matches; then each outcome's scorelines are scaled
// to the market's home/draw/away. o = {H, D, A} decimal, optional {L, O, U}.
export function marketProbs(o) {
  const iH = 1 / o.H, iD = 1 / o.D, iA = 1 / o.A, s = iH + iD + iA;
  return { H: iH / s, D: iD / s, A: iA / s };
}
export function marketGrid(o, lh, la, rho = 0) {
  const p = marketProbs(o);
  let T = lh + la;
  if (o.O && o.U && o.L) {
    const pO = (1 / o.O) / (1 / o.O + 1 / o.U); let lo = 0.3, hi = 7;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2, v = poisVec(m); let under = 0;
      for (let k = 0; k <= Math.floor(o.L); k++) under += v[k];
      if (1 - under < pO) lo = m; else hi = m;
    }
    T = (lo + hi) / 2;
  }
  const diff = p.H - p.A; let lo = -T + 0.05, hi = T - 0.05;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2, r = outcomes(grid((T + m) / 2, (T - m) / 2, rho)); if (r.H - r.A < diff) lo = m; else hi = m; }
  const sup = (lo + hi) / 2, g = grid((T + sup) / 2, (T - sup) / 2, rho), r = outcomes(g);
  for (let h = 0; h <= KMAX; h++) for (let a = 0; a <= KMAX; a++) g[h * W + a] *= h > a ? p.H / r.H : h === a ? p.D / r.D : p.A / r.A;
  return g;
}

export function blend(model, market, w) {
  const g = new Float64Array(W * W);
  for (let i = 0; i < g.length; i++) g[i] = (1 - w) * model[i] + w * market[i];
  return g;
}

// Full probability grid for one fixture. m: {lh, la, o?}; P: {rho, drawK, mktW}
export function matchGrid(m, P) {
  const model = grid(m.lh, m.la, P.rho, P.drawK);
  if (!m.o || !P.mktW) return model;
  return blend(model, marketGrid(m.o, m.lh, m.la, P.rho), P.mktW);
}

// A knockout tie: chance the home side goes through. g = this match's grid (the rest of it, when live), carry = goals
// already in (a first leg's, the live score), level after 90 = extra time (a third of a match at the pre-match rates
// lh, la) when et, then penalties as a coin flip.
export function advance(g, lh, la, { et = true, carry = [0, 0] } = {}) {
  let p = 0, tie = 0;
  for (let h = 0; h <= KMAX; h++) for (let a = 0; a <= KMAX; a++) {
    const q = g[h * W + a], d = h + carry[0] - a - carry[1];
    if (d > 0) p += q; else if (d === 0) tie += q;
  }
  let t = 0.5;
  if (et) { const e = grid(lh / 3, la / 3), r = outcomes(e); t = r.H + r.D / 2; }
  return p + tie * t;
}

// Remaining-goals grid for a match in progress: rates scaled by time left, red cards change both sides' rates.
export function liveGrid(lh, la, minute, rc = [0, 0], rho = 0) {
  const left = Math.max(0.01, (95 - Math.min(minute, 94)) / 95);
  const f = (own, opp) => 0.67 ** Math.min(own, 3) * 1.25 ** Math.min(opp, 3);
  return grid(lh * left * f(rc[0], rc[1]), la * left * f(rc[1], rc[0]), rho * left);
}

// Seeded random numbers (mulberry32) so simulations are repeatable.
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Cumulative distribution over the grid for fast sampling: returns index h * W + a.
export function cdf(g) { const c = new Float64Array(g.length); let s = 0; for (let i = 0; i < g.length; i++) { s += g[i]; c[i] = s; } return c; }
export function sample(c, u) { let lo = 0, hi = c.length - 1; u *= c[hi]; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < u) lo = m + 1; else hi = m; } return lo; }
