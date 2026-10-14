# Prediction model

## Data
- ESPN scoreboard API, one request per match day, seasons 2016 on (`history/`). Per match: score, status, stage
  (post-season rounds), shots, shots on target, possession, odds when ESPN has them, TV.
- 21 leagues: the 11 shown (Kevin's six plus La Liga, Serie A, Ligue 1, the Championship and Liga MX, added 2026-10-13)
  plus Primeira Liga, Eredivisie, Belgian Pro League, Scottish Premiership, Süper Lig, 2. Bundesliga, Europa League,
  Conference League, Leagues Cup and Concacaf Champions Cup. The extra ones only feed ratings: they put every Champions
  League club on one scale, give promoted clubs a real history, and link MLS with Liga MX.
- Liga MX: ESPN's season 2016-2021 = calendar year, 2022 = Jan 2022 to May 2023 (three tournaments), 2023 on = Jul-May.
  Each match carries `tn` (A2026 = Apertura 2026, C2027 = Clausura 2027, from ESPN's season-type slug); Play-In,
  reclassification and Liguilla matches carry `stage`.
- Bookmaker odds: ESPN shows DraftKings (or bet365) before kickoff and drops them after; the sync keeps the last
  pre-match line. For backtests, closing odds come from football-data.co.uk (EPL, Bundesliga, MLS; no NWSL/USL source).
- Not used: ClubElo (API unreachable on 2026-10-13; we compute our own Elo), Opta and FotMob (no free feed, no scraping).

## Ratings
1. **Elo** over the whole history in time order (K 22, home advantage 60, goal-difference multiplier, UEFA matches
   ×1.25). European clubs share one pool; MLS and Liga MX share one (pool 'mls', linked by
   Leagues Cup and Concacaf Champions Cup matches, which count like UEFA matches); NWSL and USL are separate pools. New season: 15% pull to the league mean.
2. **Attack / defence** (Dixon-Coles style, fitted with 8 EM passes): each match weighted by recency (half-life per pool),
   the target for each side = wGoals × goals + (1 − wGoals) × xG proxy, where the proxy is fitted per pool as
   a × shots on target + b × other shots. Each club is pulled toward a prior from its Elo with the strength of k matches
   (gamma = log-goal effect of 400 Elo points). League base rates (home, away) from the same weighted data.
3. **Match grid**: Poisson scorelines with Dixon-Coles rho and a draw scale (drawK), both tuned per pool.
4. **Market blend**: where there are odds, grid = w × market grid + (1 − w) × model grid. The market grid matches the
   book's home/draw/away (margin removed) and its over/under total.

## Tuning (walk-forward, 2021 to now)
Refit every 7 days on data before that day, predict the next 7 days. `node scripts/backtest.mjs --tune` searches the
parameters per pool (coordinate descent, two passes) by log loss. Results 2026-10-13 (lower log loss is better; uniform
guessing = 1.099):

| Pool | Matches | Log loss | FotMob pts/match | Old app style* | Market alone |
|---|---|---|---|---|---|
| EPL + BL + UCL | 4,129 | 0.966 | 1.175 | 1.043 / 1.035 | 0.960 / 1.211 |
| MLS | 2,856 | 1.044 | 1.064 | 1.064 / 1.046 | 1.026 / 1.069 |
| NWSL | 964 | 1.034 | 1.075 | 1.064 / 1.002 | (no odds history) |
| USL | 2,477 | 1.026 | 1.069 | 1.043 / 1.034 | (no odds history) |

\* current season only, goals only, no Elo prior (what the previous app did).

MLS + Liga MX pool (2026-10-13, MLS's tuned settings kept): MLS 2,856 matches, log loss 1.0443, 1.062 pts (MLS alone:
1.0441, 1.064); Liga MX 1,779 matches, 1.0243, 1.075 (Liga MX alone: 1.0236, 1.079). Joint draw calibration rho −0.16,
drawK 0.9. Joining is neutral for league matches (differences are noise); it puts both leagues on one Elo scale. Re-tuning
the joint pool helped Liga MX (1.0217) but cost MLS (1.0451, 1.057 pts), so it wasn't kept. No closing-odds history for
Liga MX yet (football-data.co.uk has a MEX.csv), so its market weight is MLS's.

Tuned settings: Europe half-life 200 days, goals/proxy 50/50, prior 10 matches, gamma 1.6; MLS 120 / 50/50 / 16 / 0.6;
NWSL 120 / shots proxy only / 4 / 0.2; USL 160 / 85% goals / 16 / 1.0. Shots carry the most signal in the NWSL and
the least in the USL.

Blend weight: the backtest scores w = 0 … 0.9 on matches with closing odds; the best was the most market-heavy tested
(0.9 for Europe and MLS). NWSL and USL use 0.7 where DraftKings has a line. The market is still a little sharper than the
model on its own, so the model mainly matters for matches with no line (most NWSL and USL) and for simulating far-off
fixtures (season odds), where no line exists yet.

## Simulations
10,000 seasons in a Web Worker. Remaining matches are sampled from their grids; live matches from the current score plus
a remaining-time grid (red cards: own rate ×0.67, opponent ×1.25 each). Tiebreakers per league (USL, La Liga, Serie A and
Ligue 1 use head-to-head in the table, La Liga/Serie A/Ligue 1 only once the tied clubs have played each other twice; the
simulation approximates it with the later criteria; Serie A's one-off play-off for first or 17th isn't modelled).
Post-season brackets: UCL (league phase, play-off pairings, two-legged ties with extra time and penalties, neutral
final), MLS (wild card, best-of-three Round One, single matches after), NWSL (top 8), USL (top 8 per conference),
Championship ('efl': 3 v 6 and 4 v 5 over two legs, neutral final; 'up' = top two plus the play-off winner), Liga MX ('mex':
top eight, 1v8 2v7 3v6 4v5, reseeded semis, two legs everywhere with the higher place at home second and through on a level
aggregate, final with extra time and penalties; the table is the current tournament only). Real post-season results are used once played.

## Clinching
Proven, never simulated. A quick bound first (rivals' maximum points), then an exact check over rival sets with a
max-flow relaxation (rivals who still meet can't all win). Level on points always counts against the club, so a ✓ is
never wrong; some true clinches may show a day late. Scenarios enumerate the club's next result and up to six rival
matches in the same round, and name the smallest sets of conditions that guarantee the outcome.
