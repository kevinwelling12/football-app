# Affinity (v3, 2026-10-13)

What it is for: a ranking of clubs on the Clubs page, and "Your pull" in neutral match sheets (neither club followed).
It stays off match rows, tables and picks. Kevin's own clubs aren't scored ("your club", ★).

## Model (web/affinity.js, fitted in the page from your picks)
Raw score per club = weights × features + a per-club adjustment. Affinity = 100 × logistic(raw − the median club's raw):
the chance you'd pick the club over a typical one. "Your pull" = logistic(raw A − raw B), shown when ≥ 60%.

- Pulls (weights can't go below zero): ten researched 0–10 traits (data/affinity/traits.json) and nearness to Sacramento
  (log scale, 10 at 50 km, 0 at 20,000 km).
- Pushes (weights can't go above zero): state ownership (from the ownership note), a racism or fan-culture record
  (inclusion below 3 where the research found something; "nothing notable" doesn't count), rival of one of your clubs
  (data/affinity/rivals.json).
- League familiarity (Bundesliga, other Champions League, MLS, NWSL, USL relative to the Premier League) is fitted so it
  doesn't leak into the traits, then left out of Affinity and the rooting guide.
- Fit: regularised logistic regression on the picks; per-club adjustments kept small (ridge 2).

## v3 changes after 500 picks (Kevin: "some things in pushes you away shouldn't be")
- "Ownership below 3" mixed state owners (picked 6–40) with investment funds (42–27) and multi-club groups (36–25).
  Now only state ownership pushes away; Chelsea, Villa, KC Current and the Reign stop being penalised.
- "Inclusion below 3" flagged clubs where research found nothing (Las Vegas, Loudoun, Orange County...); fixed.
- Signed weights stopped artefacts: "run for the club" and "iconic singing end" had gone negative only to fine-tune the
  dealbreakers and to stand in for familiarity.
- Vancouver and Seattle Reign removed from rivals (8–0 and 7–1 in his picks).
- Held-out accuracy 74.4% -> 77%. Order now: state ownership −2.9, rival −1.7, racism/fan culture −1.0; fan voice +0.8,
  high-energy football +0.7, run for the club +0.6, rituals +0.5. Familiarity: Bundesliga −1.3, MLS −0.8, other UCL −0.7.

## What 233 answers said (2026-10-13; `node scripts/affinity/analyze.mjs picks.json`)
- Predicts 79% of picks it didn't see (10-fold). The v1 trait-similarity model: 53%, a coin flip.
- Pushes away: state or fund ownership −3.2, racism record −2.2, rival of your club −0.8.
- Pulls in: high-energy football +1.4, run for the club +0.9, rituals +0.8, the city's club +0.7, fan voice +0.6.
- Doesn't matter: contender (winning), famous singing end, nearness (once rivals are counted).
- California clubs went 15–50 (Oakland Roots 1–13): explained by rivalry with the Republic plus per-club adjustments.
- Per-club adjustments: above their traits Leeds, Phoenix, Aston Villa, Man United; below Gladbach, Slavia, Barcelona,
  Galatasaray, Oakland, Everton, LAFC.
- "Can't say" means "don't know the club" (Kevin). The quiz shows crests and names (gut picks); Details opens a fact
  card per club (owners, fans, style) for close or unfamiliar pairs. It prefers clubs from leagues he follows closely,
  clubs with few answers, and pairs the model finds close.
- 2026-10-13 rerun with 259 answers: 78% held out; same order of factors (ownership −3.0, racism −2.3, high-energy
  football +1.7, rivals −0.8); the city's club fell to +0.25, contender −0.23.

## Get the picks for analysis
Settings > Copy my Affinity picks, paste into a file, run the script above.

## New clubs
The sync reports clubs with no traits. Research the ten traits (anchors: old repo scripts/archetype/BRIEF.md) and add the
club with lat/lon to data/affinity/traits.json.

# Player Affinity (2026-10-13)

Kevin's goal: lists topped by players he'd like his son to look up to — humble, unselfish, play the game the right way,
time for fans, speak out for what's right, stay out of trouble, and deliver performances worthy of the highlight reels.

Same framework as clubs (web/players.js on the shared engine `fitPairs` in web/affinity.js):
- Data: data/affinity/players.json, 463 players (399 men, 64 women; 286 active) imported from the old app's research by
  scripts/affinity/build_players.py: career (clubs and years, mapped to ESPN ids where the club has traits; women's
  careers link only to NWSL clubs), six audited 0–10 traits (old SCORING_BRIEF.md anchors), incident codes.
- Pulls: Character, Team player, Loyalty, Greatness, Joy to watch, Legacy; share of seasons at your clubs (never shown as
  a minus); the seasons-weighted Affinity of the other clubs he played for (can be negative: state-owned clubs).
- Pushes: serious wrongdoing (abuse, racist abuse, match-fixing, other conviction), lesser offences (doping, tax fraud,
  violent conduct), money or sportswashing move (Saudi/Qatar/UAE/China, authoritarian ambassador), forced a move or joined
  a bitter rival.
- Familiarity, fitted then left out: still playing, women's game.
- Quiz: "Who would you rather your son look up to?" Same game only (men with men, women with women); Details shows
  career, character note and record. Picks sync as state.playerPicks.
- UI: Clubs page > Players (Men active / Men all-time / Women), player sheet (traits with evidence, career, honours,
  causes, record), "Players who played here" on club sheets.
- Analysis: Settings > Copy my player picks (and club picks), then
  `node scripts/affinity/analyze_players.mjs player_picks.json club_picks.json`.
