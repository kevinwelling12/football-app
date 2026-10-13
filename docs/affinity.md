# Affinity (v2, 2026-10-13)

What it is for: a ranking of clubs on the Clubs page, and "Your pull" in neutral match sheets (neither club followed).
It stays off match rows, tables and picks. Kevin's own clubs aren't scored ("your club", ★).

## Model (web/affinity.js, fitted in the page from your picks)
Raw score per club = weights × features + a per-club adjustment. Affinity = 100 × logistic(raw − the median club's raw):
the chance you'd pick the club over a typical one. "Your pull" = logistic(raw A − raw B), shown when ≥ 60%.

Features: ten researched 0–10 traits (data/affinity/traits.json, one line of evidence each), nearness to Sacramento on a log
scale (10 at 50 km, 0 at 20,000 km; its weight can't go below zero), two dealbreakers (ownership below 3 = state, fund or
similar; inclusion below 3 = a racism record), US club, and rival of one of your clubs (data/affinity/rivals.json).

Fit: regularised logistic regression on your "which would you rather support?" answers (state.affPicks; "can't say" is
ignored for fitting and a club skipped twice isn't asked again). Weights are pulled toward a neutral prior; per-club
adjustments are kept small (ridge 2) so a club needs several picks before its adjustment matters.

## What 233 answers said (2026-10-13; `node scripts/affinity/analyze.mjs picks.json`)
- Predicts 79% of picks it didn't see (10-fold). The v1 trait-similarity model: 53%, a coin flip.
- Pushes away: state or fund ownership −3.2, racism record −2.2, rival of your club −0.8.
- Pulls in: high-energy football +1.4, run for the club +0.9, rituals +0.8, the city's club +0.7, fan voice +0.6.
- Doesn't matter: contender (winning), famous singing end, nearness (once rivals are counted).
- California clubs went 15–50 (Oakland Roots 1–13): explained by rivalry with the Republic plus per-club adjustments.
- Per-club adjustments: above their traits Leeds, Phoenix, Aston Villa, Man United; below Gladbach, Slavia, Barcelona,
  Galatasaray, Oakland, Everton, LAFC.
- "Can't say" means "don't know the club" (Kevin). The quiz now shows a fact card per club (owners, fans, style) and
  prefers clubs from leagues he follows closely and clubs with few answers.

## Get the picks for analysis
Settings > Copy my Affinity picks, paste into a file, run the script above.

## New clubs
The sync reports clubs with no traits. Research the ten traits (anchors: old repo scripts/archetype/BRIEF.md) and add the
club with lat/lon to data/affinity/traits.json.
