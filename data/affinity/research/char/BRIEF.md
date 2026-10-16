# Character split brief (October 2026)

Kevin's player Affinity answers "Which player would I rather my son look up to?" Character (CH) is the strongest thing
in his picks, but it mixes several things. You score four parts of it separately, for players already in the app.

**Sources and the search budget:** web searches are shared and run out. Use WebFetch on the player's English Wikipedia
page as the main source (the local-language page for detail). Use WebSearch (at most 8 per batch) only for the
best-known players or where Wikipedia hints at something. List in `sources` only pages you actually opened. Never invent
facts. Judge every player by the same standard, famous or not; little public record is not a minus (see "Low
information"). Today is 2026-10-15. The input gives each player's current CH score, its reason and incident notes from
earlier research: use them as leads, but score the four parts on their own evidence.

## Four traits, 0–10, one decimal
- **SP Sportsmanship**: how he/she plays. Raise: fair-play reputation, few cards for a position, respect for referees and
  opponents, admitting a dive/handball, helping injured opponents. Lower: diving and simulation, time-wasting, dissent
  and surrounding referees, provoking or mocking opponents, cynical fouls, violent conduct.
  Anchors: Gary Lineker 9.5 (never booked), Miroslav Klose 9.5 (admitted a handball goal), Lionel Messi 7.5, a normal pro
  with nothing notable 6.0, Sergio Ramos 3.5, Luis Suárez 2.0 (biting, the handball at the 2010 World Cup), Neymar 3.0.
- **VO Speaks out**: takes public stands for what is right: anti-racism, LGBTQ+ inclusion, refugees, mental health, child
  poverty, women's equality. Raise for speaking up at a cost, campaigns that changed policy. Lower only for public
  stances against inclusion (refusing a Pride armband for non-religious reasons, mocking campaigns). Faith, politics in
  general, criticising FIFA or owners: neutral.
  Anchors: Megan Rapinoe 10, Marcus Rashford 10, Raheem Sterling 8.5 (racism), Tyrone Mings 8.5, Jordan Henderson 7.0
  before his Saudi move (Pride, NHS), a player who has said nothing public 5.0.
- **CO Community**: time and money for people: charity foundations, hometown schools, hospitals and pitches, hospital
  visits, time for fans and autographs, club community work.
  Anchors: Sadio Mané 10 (hospital and school in Bambali), Juan Mata 9.5 (Common Goal founder), Didier Drogba 9.5,
  Mohamed Salah 9 (Nagrig), a normal pro with the usual club charity appearances 5.5, a player known for snubbing fans 3.
- **HU Humility**: modesty in public; credits teammates; no showboating, arrogance or feuds; handles fame quietly.
  Anchors: N'Golo Kanté 10, Andrés Iniesta 9.5, Son Heung-min 9, a normal pro 6.0, Cristiano Ronaldo 4.0,
  Zlatan Ibrahimović 2.5, Mario Balotelli 3.0.

**Low information:** if nothing is known on a trait, give SP 6.0, VO 5.0, CO 5.5, HU 6.0, say "nothing notable found"
in `why`, and set confidence "low" if nothing is known on any of the four.

**Right person:** names repeat. Use the player at the input's current club or career; say so in `why` if unsure.

## Output
Write a JSON array to the output path you are given, one object per player, in the input order:
```json
{"id": "as given", "name": "as given", "SP": 6.0, "VO": 5.0, "CO": 5.5, "HU": 6.0,
 "why": {"SP": "one short clause", "VO": "...", "CO": "...", "HU": "..."},
 "confidence": "high" | "medium" | "low", "sources": ["url"]}
```
Keep `why` clauses short, factual and neutral. Valid JSON only. Edit no other file. No git.
