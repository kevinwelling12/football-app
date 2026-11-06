# Political leaning brief (November 2026)

Kevin's club Affinity is fitted to his "which club would you rather support?" picks. He asked to add the
socio-political leaning of each club and its supporters: where the club's culture sits, as its own supporters and
the wider football world would recognise it. You score one trait for every club in your batch. The model learns from
his picks which way, if any, it pulls him; your job is only to place each club accurately and fairly.

Same standard for every club and league; never grade on a curve within a league. Today is 2026-11-07.

## The trait (0-10, integers or one decimal)

lean: the political culture of the club and its active support, on a left-right axis.
- 10: a defining left-wing or progressive identity, recognised far beyond the club: St. Pauli (anti-fascist,
  anti-racist, the skull and crossbones), Rayo Vallecano (working-class Vallecas, Bukaneros), Celtic (Irish
  republican and left-wing Green Brigade).
- 8: a strong, well-documented left or progressive culture among the main supporter groups or in club positions
  (Liverpool's socialist-city identity, the Sun boycott, "Scouse not English"; Union Berlin; the Timbers Army and
  Emerald City Supporters, who fought MLS over the Iron Front anti-fascist flag in 2019).
- 5: no clear political identity, or a genuinely mixed one; most clubs belong here. A club's inclusion work alone
  (Pride matches, anti-racism campaigns every club runs) is not a political identity.
- 2: a well-documented right-wing or nationalist culture among a large part of the active support, or club
  positions on the right.
- 0: a defining far-right identity among the main ultras, recognised far beyond the club (Lazio's Irriducibili,
  Hellas Verona's curva).
Regional or national identity politics (Athletic Club's Basque identity, Barcelona's Catalan identity) sits where
it is usually placed on the left-right axis in its own country, and say so in `why`; do not score it 10 by default.
Owners' personal politics count only when the club itself takes the position (a statement, a policy, a sponsor
choice); a billionaire owner's private donations do not move the score.

## Fairness rules
- Score documented facts: supporter groups' stated politics, banners and campaigns, club statements and policies,
  sanctions. Not stereotypes about a city or a country, and not one incident by a few people.
- A racism or violence sanction counts against a club only if it reflects a political culture (fascist salutes and
  banners from an organised group), not a single offender. Those sanctions are already coded elsewhere; don't double
  count them by sliding a club to 0 for one incident.
- When the research finds nothing political, score 5 and write "no clear political identity found".
- Keep `why` neutral and factual, with years. No opinions about which side is right.

## Sources and the search budget
Web searches are shared across researchers and run out. Use WebFetch on each club's English Wikipedia page (its
supporters, ultras and "rivalries" sections, and supporter-group pages when they exist) as the main source. Use
WebSearch (at most 6 per batch) for the clubs where Wikipedia hints at a political identity but lacks detail. The
input `notes` are earlier research (inclusion, fan voice, city, terrace): use them, but check. List in `sources` only
pages you actually opened. Never invent facts; if unclear after reading, score 5 or your best estimate and put
"estimate" in `why`.

## Output
Write a JSON array to the output path you are given, one object per club, in the input order:
```json
{"espn_id": "...", "name": "exact name as given", "league": "...", "lean": 6,
 "why": {"lean": "one short line: the groups, positions or events behind the score, with years"},
 "confidence": "high" | "medium" | "low", "sources": ["url", "url"]}
```
Valid JSON only. Edit no other file. No git.
