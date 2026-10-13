# Player research brief (current regulars, October 2026)

You are researching current players for Kevin's football app. Kevin (Sacramento) supports Liverpool, Borussia Dortmund,
Portland Timbers, Portland Thorns and Sacramento Republic. Player Affinity answers his question: **"Which player would I
rather my son look up to?"** — humble, unselfish, plays the game the right way, respects opponents and officials, makes
time for fans, stands up for what is right, stays out of trouble, lives a respectable life, and delivers performances
worthy of the highlight reels.

Judge every player by the same standard, famous or not. A player with little public record is not worse for it: give
neutral scores (see "Low information") and say so. Never invent facts. Search the web (WebSearch, then WebFetch on good
sources: Wikipedia, club sites, reputable outlets) for each player; one or two searches per player is usually enough.
Today is 2026-10-13; use current information.

## Output
Write a JSON array to the file path you are given, one object per player, in the order given:

```json
{"espn_id": "...", "name": "exact name as given", "club_id": "...", "gender": "M"|"W", "born": 1998, "nation": "...",
 "position": "GK"|"DF"|"MF"|"FW",
 "clubs": [{"club": "Senior club", "from": 2017, "to": 2021}, {"club": "Current club", "from": 2021, "to": null}],
 "captaincy": "short note or empty", "honours": "short summary", "causes": ["charity / activism, one line each"],
 "CH": 6.0, "WK": 6.0, "LO": 5.0, "AB": 6.0, "ST": 5.5, "LE": 4.0,
 "why": {"CH": "one short clause", "WK": "...", "LO": "...", "AB": "...", "ST": "...", "LE": "..."},
 "codes": {"abuse_allegation": 0, "racist_abuse": 0, "match_fixing": 0, "criminal_other": 0, "doping": 0, "tax_fraud": 0,
           "red_card_violence": 0, "money_league": 0, "authoritarian_ambassador": 0, "forced_transfer": 0, "rival_move": 0},
 "notes": "one neutral line on any incident codes, or 'No incident codes.'",
 "confidence": "high"|"medium"|"low", "sources": ["url", "url"]}
```
- `clubs`: senior clubs only (no youth or B teams; loans under a season can be skipped), years as integers, current club `to: null`.
- Keep `why` clauses short and neutral. Valid JSON only (no comments, no trailing commas).

## Six traits, 0–10, one decimal (use the anchors to stay on one scale)
- **CH Character**: how he/she treats people; conduct short of the incident codes; causes and public stances.
  Raise: community work, charity, anti-racism, LGBTQ+ allyship (rainbow armband), speaking on racism or mental health,
  funding schools/hospitals at home, humility in public, fair play. Lower: gamesmanship and diving, dissent and tantrums,
  feuds, mocking opponents, refusing Pride gestures, fronting betting or crypto, campaigning for right-wing/authoritarian
  politics. (Faith talk, criticising FIFA/owners, flashy social media: neutral.)
  Anchors: Megan Rapinoe 9.5, Marcus Rashford 9.5, Juan Mata 9.5, Mohamed Salah 8.5, a decent pro with no causes or
  issues 6.0, Sergio Ramos 4.0, Neymar 3.5.
- **WK Team player**: work rate, running for teammates, humility, leading by example, no ego.
  Anchors: N'Golo Kanté 10, Thomas Müller 9, Jordan Henderson 9, Virgil van Dijk 8, Lionel Messi 6, Cristiano Ronaldo 4,
  Zlatan Ibrahimović 3, Neymar 2.5.
- **LO Loyalty & bond**: years at the main club, one-club careers, captaincy, academy graduates, staying through bad times,
  bond with fans. Judge from when a player settles (~23); youth moves and loans don't count; a late-career move abroad or to
  MLS is not disloyal. Lower for forcing transfers, joining a bitter rival, chasing moves.
  Anchors: Totti 10, Maldini 10, Gerrard 9.5, Christine Sinclair 9.5, Marco Reus 9, Salah 7, a journeyman 4, Haaland 3,
  Mbappé 3, Neymar 1.5. Young players with one club so far: 5–6.
- **AB Greatness**: ability at the peak (to date).
  Anchors: Messi, Ronaldo 10; Haaland, Salah, van Dijk 9; Reus 7.5; Pulisic 6.5; a solid top-flight regular 5.5;
  a solid MLS/USL regular 4–5 (second-tier USL Championship regulars mostly 3.5–4.5). Women: Marta 10, Bonmatí 9.5,
  Sinclair 9, Rapinoe 8.5; a solid NWSL regular 5–5.5.
- **ST Joy to watch**: flair, creativity, entertainment. Kevin loves playmakers (No. 10s) and attacking full-backs.
  Anchors: Ronaldinho 10, Messi 10, Iniesta 9.5, Lamine Yamal 9.5, Modrić 9, Alexander-Arnold 8, Haaland 6, Kanté 5,
  a no-frills centre-back 4.
- **LE Legacy**: iconic moments, influence, place in football culture; trophies count some.
  Anchors: Pelé, Maradona, Cruyff, Messi 10; Gerrard 8.5; Rapinoe 9 (women's game); Haaland 6; Lamine Yamal 5;
  a solid international with one famous moment 4; most club regulars 2–4.

## Incident codes (separate from the traits — don't double count)
- `abuse_allegation` 0–2 (0 none, 1 credible allegation: charged, acquitted or dropped, 2 convicted or settled)
- `racist_abuse` 0–2 (1 alleged or apologised, 2 banned or convicted)
- `match_fixing`, `criminal_other` (other conviction, e.g. drink-driving causing harm), `doping`, `tax_fraud`: 0/1
- `red_card_violence`: count of violent-conduct incidents off the ball (punch, headbutt, bite, assault)
- `money_league`: 0/1 moved to a Saudi, Qatari, Emirati or Chinese Super League club for money
- `authoritarian_ambassador`: 0/1 paid ambassador for an authoritarian state
- `forced_transfer`: 0/1 went on strike or forced a move; `rival_move`: 0/1 moved directly between bitter rivals
Betting-rule breaches (betting on football): note them in CH and `notes`; code `match_fixing` only for fixing/spot-fixing.

## Low information
Many USL, NWSL and squad players have little coverage. Then: CH 6.0 (decent pro, nothing known), WK from playing style or
6.0, LO from career length, AB/ST from level and role, LE 2–3, codes all 0, confidence "low", and say "little public record"
in `why.CH`. Don't guess incidents.
