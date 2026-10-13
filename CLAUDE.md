# CLAUDE.md: Football

Kevin's football tracker, rebuilt 2026-10-13 (the previous app, kevinwelling12/football-suite, is archived on GitHub and
is the reference for anything "we did before": its docs/preferences.md holds the long Affinity ledger).

## What it is
A static web app (GitHub Pages) for six competitions: Premier League, Bundesliga, Champions League, MLS, NWSL,
USL Championship. Kevin's clubs: Liverpool, Borussia Dortmund, Sacramento Republic FC, Portland Timbers, Portland Thorns.
Used mostly on iPhone/iPad Safari in dark mode: check every change at 375px wide, dark scheme, no horizontal overflow.

## Layout
    web/                 the site, deployed as-is (no build step, ES modules, no npm dependencies)
      app.js             shell, routing (#/today, #/league/<k>/<matches|table|odds|scenarios>, #/picks, #/clubs), views, sheets
      engine.js          scoreline grids (Dixon-Coles), market blend, FotMob pick, live grids, RNG; shared with Node
      sim.js             tables + tiebreakers, season Monte Carlo, post-season brackets (ucl, mls, nwsl, usl)
      clinch.js          clinched/eliminated proofs (quick bound, then max-flow) and this-round scenarios
      leagues.js         zones, tiebreakers, playoff formats, colours, Kevin's default favourites
      espn.js            ESPN event -> match record (sync scripts and live polling share it)
      store.js           localStorage + optional Firestore sync (users/{uid}/app/state)
      worker.js          runs sim + proofs + scenarios off the main thread
      data/<k>.json      published per league by scripts/sync.mjs (teams with ratings, matches with model rates, odds, frozen picks)
      logos/             crests (<espnId>-d.png dark, <espnId>.png light), from scripts/logos.py
    history/<k>/<season>.json   ESPN history, 2016 on, 18 leagues (6 shown + 12 that only feed ratings). odds/ = football-data.co.uk CSVs
    model/params.json    tuned parameters + backtest results (scripts/backtest.mjs --tune)
    data/affinity/traits.json  researched Affinity traits per club (ESPN id); the score is computed in the page (docs/affinity.md)
    scripts/             backfill.mjs, sync.mjs, backtest.mjs, logos.py, serve.mjs, lib/

## Run
- `node scripts/serve.mjs` -> http://localhost:8080 (or the "web" entry in .claude/launch.json)
- `node scripts/sync.mjs` refetch + republish (`--no-fetch` to republish only). `python3 scripts/logos.py` for new clubs' crests.
- `node scripts/backtest.mjs [--pool eur|mls|nwsl|usl] [--tune]` walk-forward backtest; --tune writes model/params.json (~25 min).
- `node scripts/backfill.mjs [--only k] [--from 2016] [--force]` history download (one request per match day).
- GitHub Actions: sync.yml four times a day commits history/ + web/data + web/logos and redeploys; pages.yml deploys web/.

## Model (docs/model.md)
Elo over all history (Europe one pool via UEFA matches), plus attack/defence fitted on time-weighted matches whose targets
mix goals with a shots-on-target xG proxy, pulled toward the Elo prior. Draw calibration (rho, drawK) per pool. Match grids
blend with bookmaker odds (weight chosen by backtest against closing odds). Pre-match predictions are frozen in history/
once a match starts (`pk`), so the Picks record is honest; picks for matches before the app existed are walk-forward (`pk.wf`).

## Affinity (docs/affinity.md)
web/affinity.js v2: logistic model fitted in the page to Kevin's "which would you rather support?" picks (state.affPicks):
researched traits + dealbreakers (state/fund ownership, racism record) + rivals (data/affinity/rivals.json) + small per-club
adjustments. 79% of held-out picks predicted (v1 trait similarity: 53%). His clubs aren't scored. Analyse new picks with
scripts/affinity/analyze.mjs (Settings > Copy my Affinity picks).

## Match importance, match of the day/week
sim.js records, for every remaining match, each side's zone (and title/cup) chances given home win / draw / away win.
Importance = weighted sum of |P(win) − P(loss)| swings (gold 1, good 0.8, ok 0.6, warn 0.5, bad 0.8, title/cup 1).
Match of the day (Today, all leagues) and of the week (each league's Matches tab) = 0.75 × importance (vs the best in
the set) + 0.25 × closeness; the choice is stored in state.motw and locked once that match kicks off.
The match sheet shows the swings as "What's at stake".

## Working agreements (carried over from the old app)
- Plain, short replies. Show what changed and the concrete effect (numbers, examples). No hype.
- Never overwrite results Kevin entered. His entries win over ESPN in the app; disagreements are shown, not resolved.
- FotMob Predict: a predicted score per match, 90 minutes only; 2 points for the result, +1 for the exact score. Never scrape FotMob (or Opta).
- Terminology: "Affinity", "Matches" (not Games), "Race", "Scenarios".
- Design: clean and quiet. Neutral surfaces, a competition's colour only as a small accent, numbers first. Less on screen beats more.
- Crests: ESPN has a few on white squares (Sacramento Republic, Phoenix, San Antonio); scripts/logos.py clears them. Check new clubs.
- Clinched/eliminated must be proven, never inferred from simulations (simulations may only rule a proof out).
- Kevin started following closely with the 2026 World Cup; don't judge clubs or players by whether he's heard of them.
- "Ship it" = commit, push to main (Pages deploys main) without asking.
