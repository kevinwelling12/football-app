# Story traits brief (November 2026)

Kevin (Sacramento) supports Liverpool, Borussia Dortmund, Portland Timbers, Portland Thorns and Sacramento Republic, and
the Sacramento Kings (who nearly moved to Seattle in 2013 and were kept by the city). His "which club would you rather
support?" picks lean toward clubs the current ten traits can't explain: Aston Villa, Brighton, Columbus Crew, Vancouver
Whitecaps. He named two reasons. You score both for every club in your batch, 0 to 10.

Same standard for every club and league: a 7 means the same for a USL club and a Serie A club. Never grade on a curve
within a league. Kevin started following football with the 2026 World Cup: don't judge a club by how famous it is.
Today is 2026-11-06.

## Sources and the search budget
Web searches are shared across researchers and run out. Use WebFetch on each club's English Wikipedia page as the main
source (its History section; for the second trait also recent seasons and the club's finances or ownership sections).
Use WebSearch (at most 6 per batch) only where Wikipedia is thin (newer MLS, NWSL and USL clubs). The input `notes` are
earlier research on the club (honours, owners, fan voice): use them, but check. List in `sources` only pages you actually
opened. Never invent facts; if a trait is unclear after reading, give your best estimate and put "estimate" in its `why`.

## Traits (0-10, integers or one decimal)

1. comeback: "Comeback story". The club has been through real adversity and fought back. Adversity: near-death
   (bankruptcy, administration, liquidation and refounding, points deductions for financial collapse), a relocation
   threat or move, losing its ground or playing in exile, or a fall from former glory (major honours, then relegation or
   long decline). Fighting back: fans, the community or new owners kept the club alive or at home, and/or it climbed back.
   Score the depth of the low times the strength of the fight and recovery. A fight still going on counts (owners
   selling, a bid to move the club). Recent history weighs more than distant (last ~30 years most; older only if the
   club is still defined by it).
   - 10: Brighton (nearly dropped out of the Football League in 1997, lost the Goldstone Ground, exile at Gillingham,
     fans' 12-year campaign won Falmer, now a European club); Columbus Crew (owner tried to move it to Austin in
     2017-18, #SaveTheCrew kept it, local owners bought it, new stadium, MLS Cup 2020 and 2023).
   - 8: Aston Villa (European champions 1982, relegated 2016, three seasons in the Championship, back to the Champions
     League and a European trophy); Union Berlin (fans built their own stadium and gave blood to save the club from
     insolvency, rose from the lower leagues to the Champions League).
   - 7: a live, serious relocation fight with a strong fan response (Vancouver Whitecaps if a 2026 move bid is confirmed).
   - 5: a real crisis or fall with partial recovery, or a full recovery from a modest low.
   - 2: ordinary ups and downs, a relegation or two, nothing that defines the club.
   - 0: steady history with no serious adversity, or a club too new to have a story (founded in the last ~5 years).

2. punch: "Punches above its weight". Achieves more than its resources suggest, through a smart, well-run model:
   recruitment, coaching identity, player development, a clear plan, sustainable finances. Judge results over the last
   ~5 seasons against wage bill or budget rank in its league (use Wikipedia, club finance reporting, or salary data for
   MLS and NWSL where you find it). Spending a lot to do well is not punching above; spending a lot and underachieving
   scores low.
   - 10: Brighton (data-led recruitment, top-half and Europe on a mid budget, big profits on sales); Union Berlin
     (Champions League on one of the Bundesliga's smallest budgets); Bodø/Glimt (from a small Norwegian town to deep
     European runs); SC Freiburg.
   - 8: Columbus Crew under Nancy (MLS Cup 2023 with a mid payroll and a clear possession identity); Athletic Club
     (Basque-only players, Copa del Rey 2024, Champions League 2025).
   - 6: Aston Villa under Emery (Champions League and a European trophy, but on a high wage bill: smart coaching, not
     a small budget).
   - 5: does about what its money says.
   - 2: underachieves for its budget, or no clear plan.
   - 0: big spending with poor results (a top-three wage bill finishing mid-table), or chaotic ownership.

## Output
Write a JSON array to the output path you are given, one object per club, in the input order:
```json
{"espn_id": "...", "name": "exact name as given", "league": "...",
 "comeback": 6, "punch": 4,
 "why": {"comeback": "one short line: the low point and the fight back, with years", "punch": "one short line: results against budget"},
 "confidence": "high" | "medium" | "low", "sources": ["url", "url"]}
```
- Keep `why` lines short and neutral (facts with years, not opinions). Valid JSON only.
- Edit no other file. No git.
