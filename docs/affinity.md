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
- League familiarity (Bundesliga, La Liga, Serie A, Ligue 1, Championship, Liga MX, other Champions League, other Europa
  League, other Conference League, MLS, NWSL, USL relative to the Premier League; a club counts for its domestic league,
  'ucl', 'uel' and 'uecl' only for clubs from leagues the app doesn't show) is fitted so it
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

## What 1,808 answers said (2026-10-14, after the new leagues and same-league pairs)
- 81% of held-out picks (73% at 1,056). State ownership −3.3, rival of your club −2.2, run for the club +1.6, near
  Sacramento +1.1, the city's club +1.0, racism/fan culture −0.9, fan voice +0.9, contender +0.8; women's side and great
  home ground ~0. League familiarity (excluded): Bundesliga −1.7, La Liga −1.5, other UCL −1.4, Serie A −1.3, MLS −1.1.
- He ranked his own five too: Sacramento Republic 30–0; Liverpool over Dortmund and the Thorns; Timbers over Dortmund.
- Skips: Championship 86% of appearances, Liga MX 62% (the quiz learns this per league); Lazio 0–17.

## What 1,978 answers said (2026-10-16, after the Europa and Conference League clubs)
- 82% of held-out picks. Same order: state ownership −3.6, rival −2.3, run for the club +1.5, the city's club +1.3,
  near Sacramento +1.2, fan voice +1.1, racism/fan culture −1.0, contender +0.8. Familiarity (excluded): La Liga −1.8,
  Bundesliga −1.7, other UCL −1.7, Serie A −1.4, MLS −1.1.
- Above their traits: New England, Sporting JAX, Real Madrid, Hoffenheim, Colorado; below: LAFC, Louisville City, Lazio
  (0–18), Chicago Fire, Red Bull New York, Atlético Madrid. Sacramento Republic 35–0.
- Skips: Europa League 92%, Conference League 91%, Liga MX 81%, Championship 67% of appearances.

## New clubs
The sync reports clubs with no traits. Research the ten traits (anchors: old repo scripts/archetype/BRIEF.md) and add the
club with lat/lon to data/affinity/traits.json.

# Player Affinity (2026-10-13)

Kevin's goal: lists topped by players he'd like his son to look up to — humble, unselfish, play the game the right way,
time for fans, speak out for what's right, stay out of trouble, and deliver performances worthy of the highlight reels.

Same framework as clubs (web/players.js on the shared engine `fitPairs` in web/affinity.js):
- Data: data/affinity/players.json, 2,340 players (2,055 men, 285 women; 2,163 active):
  - 463 imported from the old app's research by scripts/affinity/build_players.py (old SCORING_BRIEF.md anchors);
  - 1,879 current regulars of all 136 clubs (data/affinity/squads.json from scripts/affinity/squads.mjs: the 15 most
    used per club from this season's ESPN lineups), researched in 63 batches against data/affinity/research/BRIEF.md
    (in/bNN.json -> out/bNN.json; Wikipedia first, sources = pages actually opened, confidence high/medium/low), then
    upserted by scripts/affinity/merge_research.py. Full rebuild: `build_players.main(<old repo>)`, then
    merge_research.py, then copy to web/data/players.json.
  - Careers map to ESPN ids where the club has traits; women's careers link only to NWSL clubs; reserve and B teams
    ("Portland Timbers 2") never link to the first team.
  - ESPN's nation/age is sometimes wrong for USL/MLS squad players; researchers use the player at the ESPN club and say
    "identity: ESPN lists X" in notes (about 30 cases).
- Pulls: Character, Team player, Loyalty, Greatness, Joy to watch, Legacy; share of seasons at your clubs (never shown as
  a minus); the seasons-weighted Affinity of the other clubs he played for (can be negative: state-owned clubs).
- Pushes: serious wrongdoing (harm to people: abuse allegations once charged, racist/homophobic abuse, match-fixing,
  convictions where someone was hurt or put at risk such as assault or drink-driving), lesser offences (doping, tax
  fraud, off-the-ball violent conduct incl. spitting, stamps, hair-pulling; minor offences with no one harmed such as
  licence or careless-driving cases), money or sportswashing move (Saudi/Qatar/UAE/China, authoritarian ambassador), forced a move or joined
  a bitter rival.
- Familiarity, fitted then left out: still playing, women's game.
- Quiz: "Who would you rather your son look up to?" Same game only (men with men, women with women); Details shows
  career, character note and record. Picks sync as state.playerPicks.
- UI: Clubs page > Players (Men active / Men all-time / Women), player sheet (traits with evidence, career, honours,
  causes, record), "Players who played here" on club sheets.
- Kevin's rules (2026-10-13): an allegation under investigation but never charged is not coded (Bastoni, Mbappé, Sano);
  driving without a licence and the like are lesser, not serious (Reus); a club trade isn't joining a rival.
- 711 picks (355 answered): 66% of held-out picks. Character +1.9, serious wrongdoing −1.25 (−0.67 before minor
  offences moved out), legacy +0.9, money move −0.8, team player +0.6; greatness and loyalty ~0.
- 1,561 picks (914 answered; 83% of the latest 561 answered vs 45% before the knowledge-based picker): 68% of held-out
  picks. Character +2.3, serious wrongdoing −0.9, team player +0.8, played for your club +0.5, joy to watch +0.4; loyalty
  and lesser offences ~0. Above their traits: Donovan, Foudy, Rice, Schlotterbeck, Wambach, Saka; below: Nmecha, Hakimi,
  Subotić, Dybala, Enzo Fernández.
- 2026-10-15, two additions (Kevin: "do both"): American (nationality USA; a pull, never shown as a minus) and Character
  split into Sportsmanship, Speaks out, Community, Humility (research/char/BRIEF.md; researched for the 359 players he
  has answered on, merged by scripts/affinity/merge_char.py; others get the brief's low-information values).
  Held out: 67.4% -> 69.0% (log loss 0.595 -> 0.583); American alone 68.4%. Weights: speaks out +1.6, character +1.2,
  humility +1.0, community +1.0, American +0.8, sportsmanship +0.2. 2026-10-16: the other 1,981 researched too (56 batches; all 2,340 players now have the four; 1,671 low confidence,
  mostly squad players with no public record, who keep the neutral values). Held-out unchanged (69.0%): it changes
  how unanswered players rank (top new names: Kendall McIntosh, Reggie Cannon, DeAndre Yedlin, Tim Ream, Kanté).
- Analysis: Settings > Copy my player picks (and club picks), then
  `node scripts/affinity/analyze_players.mjs player_picks.json club_picks.json`.
