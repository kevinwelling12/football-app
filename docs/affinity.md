# Affinity (rebuilt 2026-10-13)

What it is for: a ranking of every club on the Clubs page, and a "Your pull" line in the match sheet of neutral matches
(neither club followed). It stays off match rows, tables and picks.

## How it's scored (web/affinity.js, computed in the page)
- **Traits**: ten researched 0–10 scores per club with one line of evidence each (data/affinity/traits.json, keyed by
  ESPN id; imported from the old app's archetype research): iconic singing end, rituals and tifo, the city's club, great
  home ground, inclusive fan culture, fans have a say, run for the club, women's side, contender, high-energy football.
  Plus **near Sacramento** from the club's location on a log scale (each tenfold distance costs the same): 10 within 50 km,
  0 at 20,000 km; Bay Area 8.3, LA 5.9, Portland 5.4, New York 2.7, England/Germany 1.5. Closer always counts
  (its reference is home, 10, not your clubs' median).
- **Reference**: on each trait, the median of your followed clubs (Liverpool, Dortmund, Timbers, Thorns, Republic).
- **Weights**: four factors you chose, starting at Supporter culture 35%, Values and ownership 30%, Near Sacramento 15%,
  Winning and style 20%. Inside a factor, traits your clubs are strong on and agree on count most.
- **Score**: falling short of the reference costs by the trait's weight; matching or beating it costs nothing.
  Affinity = 100 × (1 − shortfall ÷ the shortfall of a club with nothing).
- **Calibration**: Clubs > Affinity > "Which would you rather support?" asks pairs of clubs close in Affinity but different
  in profile (never your own). Answers (state.affPicks, synced) re-weight the traits with a logistic fit pulled toward the
  starting weights, so a few answers can't swing it wildly. "Can't say" is stored so the pair isn't asked again.
- **Sync**: picks are stored one key per pair in the cloud document, so answers from two devices combine (web/store.js).
- **Rooting guide**: pull for the club with 6+ more Affinity, with its top reasons; otherwise "No strong pull".

## Starting ranking (before any picks)
Thorns 88, Timbers 87, Dortmund 83, Liverpool 82, Seattle 73, Sacramento Republic 72, Eintracht Frankfurt 72,
Kansas City Current 71, Lens 70, Bodø/Glimt 70 ... Manchester City 45, Inter Miami 41.
Nothing is pinned: your clubs sit high because they define the reference, not by rule.

## New clubs
The sync reports clubs with no traits (promotion, expansion, a new Champions League side). Research the ten traits
(anchors in the old repo's scripts/archetype/BRIEF.md) and add an entry with the club's lat/lon to data/affinity/traits.json.
