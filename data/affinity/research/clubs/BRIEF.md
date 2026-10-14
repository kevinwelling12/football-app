# Club traits brief (new leagues, October 2026)

Kevin (Sacramento) supports Liverpool, Borussia Dortmund, Portland Timbers, Portland Thorns and Sacramento Republic.
Club Affinity is fitted to his picks from ten researched traits. You are scoring clubs in leagues he is just starting
to follow (La Liga, Serie A, Ligue 1, EFL Championship, Liga MX, and clubs in the Europa League and Conference League). Score every club on each trait from 0 to 10 with the anchors
below. Same standard for every club and league: a 7 means the same for a Championship club and a La Liga club. Never
grade on a curve within a league. Kevin started following football with the 2026 World Cup: don't judge a club by how
famous it is in the US.

## Sources and the search budget
Web searches are shared across researchers and run out. Use WebFetch on each club's English Wikipedia page as the main
source (and its supporters/ultras or stadium pages when they exist). Use WebSearch (at most 8 per batch) for current
ownership and for incidents (racism or violence sanctions). List in `sources` only pages you actually opened. Never invent
facts; if a trait is unknown after a search, give your best estimate and say "estimate" in its `why`.
Today is 2026-10-13: use current owners, stadiums and form.

## Traits (0-10, integers or one decimal)
1. terrace: an iconic, self-organised singing end or supporters' group that defines matchdays.
   10 Kop / Yellow Wall / Timbers Army level, famous beyond the league; 5 an organised, loud section known in its league; 0 none.
2. city: the club is its city's identity, in a working city that lives through it.
   10 the club is the city's soul and main team (Liverpool, Dortmund, Portland); 5 a well-loved club sharing the city or
   a big-city afterthought; 0 a franchise or club with little local bond.
3. voice: supporters shape the club (member ownership or 50+1, a trust with real power, fan campaigns that changed club
   decisions, supporter groups the club consults). 10 fans own or run it; 5 real, documented influence; 0 none.
4. conscience: supporters and club actively stand for inclusion (anti-racism, anti-fascism, LGBTQ+ inclusion, community
   causes). 10 a defining part of the identity; 5 solid, visible work; 0 none, or a record of discrimination.
   If the research finds racist, fascist or violent fan behaviour sanctioned in the last ~5 years, score below 3 and
   name it in `why`. If nothing notable is found, say "nothing notable found" and score on the club's positive work.
5. ground: an atmospheric home ground: compact, steep, loud, usually sold out, central or historic.
   10 Anfield / Westfalenstadion / Providence Park level; 5 a good, well-filled ground; 0 a half-empty bowl or temporary venue.
6. contender: competes for its league's top prizes. 10 champion or perennial contender with major honours in the last
   ~15 years; 5 regular top-half, the odd cup run; 0 relegation-level or no recent success.
7. rituals: anthem, songs, tifo, traditions recognised beyond the club (You'll Never Walk Alone, the log and chainsaw).
   10 world-famous; 5 well known in its league; 0 none.
8. stewardship: owned for the club, not as an asset: 10 member- or locally-owned owners invested in the long term;
   5 conventional private owner, no major issues; 0 state, oligarch, private-equity or multi-club feeder ownership.
   Name the owner in `why`. If the owner is a state or a sovereign wealth fund, write "state" in `why.stewardship`.
9. women: a women's side that is part of the club's identity. 10 a top-tier team that defines the club too (Thorns);
   5 a top-tier or well-supported team; 0 none.
10. intensity: a high-energy, front-foot playing identity (pressing, attacking, tempo) over recent seasons.
    10 defining (Klopp-era Dortmund and Liverpool); 5 mixed; 0 cautious, defensive.

Reference points already scored (for calibration): Union Berlin terrace 10, voice 10, stewardship 10; Athletic Club voice
10, city 10, stewardship 10; Real Madrid contender 10, voice 8 (member club), terrace 6; Barcelona contender 9, voice 8;
Manchester City stewardship 0 (state); Hull City terrace 4, city 6, voice 1, contender 2, stewardship 4.

## Output
Write a JSON array to the output path you are given, one object per club, in the input order:
```json
{"espn_id": "...", "name": "exact name as given", "league": "esp",
 "terrace": 7, "city": 8, "voice": 3, "conscience": 5, "ground": 7, "contender": 4, "rituals": 5, "stewardship": 5,
 "women": 4, "intensity": 6,
 "why": {"terrace": "one short line", "city": "...", "voice": "...", "conscience": "...", "ground": "...",
         "contender": "...", "rituals": "...", "stewardship": "...", "women": "...", "intensity": "..."},
 "ll": [lat, lon],
 "confidence": "high" | "medium" | "low", "sources": ["url", "url"]}
```
- `ll`: the home stadium's latitude and longitude (two decimals).
- Keep `why` lines short and neutral (facts, not opinions). Valid JSON only.
- Edit no other file. No git.
