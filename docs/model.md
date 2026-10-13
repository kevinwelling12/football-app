# Prediction model

## Data
- ESPN scoreboard API, one request per match day, seasons 2016 on (`history/`). Per match: score, status, stage
  (post-season rounds), shots, shots on target, possession, odds when ESPN has them, TV.
- 18 leagues: the 6 shown plus LaLiga, Serie A, Ligue 1, Primeira Liga, Eredivisie, Belgian Pro League, Scottish
  Premiership, Süper Lig, Championship, 2. Bundesliga, Europa League and Conference League. The extra ones only feed
  ratings: they put every Champions League club on one scale and give promoted clubs a real history.
- Bookmaker odds: ESPN shows DraftKings (or bet365) before kickoff and drops them after; the sync keeps the last
  pre-match line. For backtests, closing odds come from football-data.co.uk (EPL, Bundesliga, MLS; no NWSL/USL source).
- Not used: ClubElo (API unreachable on 2026-10-13; we compute our own Elo), Opta and FotMob (no free feed, no scraping).

## Ratings
1. **Elo** over the whole history in time order (K 22, home advantage 60, goal-difference multiplier, UEFA matches
   ×1.25). European clubs share one pool; MLS, NWSL and USL are separate pools. New season: 15% pull to the league mean.
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
| NWSL | 964 | 1.035 | 1.049 | 1.064 / 1.002 | (no odds history) |
| USL | 2,477 | 1.027 | 1.069 | 1.043 / 1.034 | (no odds history) |

\* current season only, goals only, no Elo prior (what the previous app did).

Blend weight: the backtest scores w = 0 … 0.9 on matches with closing odds; the best was the most market-heavy tested
(0.9 for Europe and MLS). NWSL and USL use 0.7 where DraftKings has a line. The market is still a little sharper than the
model on its own, so the model mainly matters for matches with no line (most NWSL and USL) and for simulating far-off
fixtures (season odds), where no line exists yet.

## Simulations
10,000 seasons in a Web Worker. Remaining matches are sampled from their grids; live matches from the current score plus
a remaining-time grid (red cards: own rate ×0.67, opponent ×1.25 each). Tiebreakers per league (USL uses head-to-head in
the table; the simulation approximates it with the later criteria). Post-season brackets: UCL (league phase, play-off
pairings, two-legged ties with extra time and penalties, neutral final), MLS (wild card, best-of-three Round One, single
matches after), NWSL (top 8), USL (top 8 per conference). Real post-season results are used once played.

## Clinching
Proven, never simulated. A quick bound first (rivals' maximum points), then an exact check over rival sets with a
max-flow relaxation (rivals who still meet can't all win). Level on points always counts against the club, so a ✓ is
never wrong; some true clinches may show a day late. Scenarios enumerate the club's next result and up to six rival
matches in the same round, and name the smallest sets of conditions that guarantee the outcome.
