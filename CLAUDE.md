# CLAUDE.md: Football

Kevin's football tracker, rebuilt 2026-10-13 (the previous app, kevinwelling12/football-suite, is archived on GitHub and
is the reference for anything "we did before": its docs/preferences.md holds the long Affinity ledger).

## What it is
A static web app (GitHub Pages) for thirteen competitions: Kevin's six (Premier League, Bundesliga, Champions League, MLS,
NWSL, USL Championship) and, since 2026-10-13, La Liga, Serie A, Ligue 1, the EFL Championship, Liga MX, the Europa League
and the Conference League (no club of his there;
on Today they fold into one "N more" line per day unless he follows a club in them). Domestic cups since 2026-10-19:
Carabao Cup, FA Cup, DFB-Pokal, U.S. Open Cup (leagues.js CUPS, `ko`): no league pages; his clubs' ties (and
semi-finals, finals) show on Today, club cards and club sheets, the rest fold into "more"; Leagues > Cups lists each
cup's current round; the match sheet adds "To go through" (engine.js advance: extra time, then penalties; Carabao
straight to penalties before the final). Kevin's clubs: Liverpool, Borussia Dortmund, Sacramento Republic FC, Portland Timbers, Portland Thorns.
Used mostly on iPhone/iPad Safari in dark mode: check every change at 375px wide, dark scheme, no horizontal overflow.

## Layout
    web/                 the site, deployed as-is (no build step, ES modules, no npm dependencies)
      app.js             shell, routing (#/today, #/league/<k>/<matches|table|bracket|odds|scenarios|affinity> (bracket: USL, NWSL, MLS play-offs and the three UEFA cups' knockouts; app.js BRACKET), #/picks, #/clubs/<club-slug>), views, sheets
      engine.js          scoreline grids (Dixon-Coles), market blend, FotMob pick, live grids, RNG; shared with Node
      sim.js             tables + tiebreakers, season Monte Carlo, post-season brackets (ucl = all three UEFA cups: halves drawn from the seed pairs, 1/2 v 7/8 paths in the quarter-finals, mls, nwsl, usl, efl = Championship promotion, mex)
      clinch.js          clinched/eliminated proofs (quick bound, then max-flow) and this-round scenarios
      leagues.js         zones, tiebreakers, playoff formats, colours, ORDER (all thirteen) and MAIN (Kevin's six); `cup` = UEFA cups (a club belongs to its domestic league when shown), default favourites
      espn.js            ESPN event -> match record (sync scripts and live polling share it)
      store.js           localStorage + optional Firestore sync (users/{uid}/app/state)
      worker.js          runs sim + proofs + scenarios off the main thread
      data/<k>.json      published per league by scripts/sync.mjs (teams with ratings, matches with model rates, odds, frozen picks)
      logos/             crests (<espnId>-d.png dark, <espnId>.png light), from scripts/logos.py
    history/<k>/<season>.json   ESPN history, 2016 on, 27 competitions (13 leagues + 4 domestic cups shown, 10 that only feed ratings, incl. Leagues Cup `lcup`, Concacaf Champions Cup `ccc`, League One/Two `eng3`/`eng4`; scripts/lib/leagues.mjs `track`). Cups are fetched a calendar year per request (`dates=YYYY`); a cup tie uses its base league's home/away rates (`base`). Liga MX files hold both tournaments (`tn` 'A2026'/'C2027'); sync publishes only the current one. odds/ = football-data.co.uk CSVs
    model/params.json    tuned parameters + backtest results (scripts/backtest.mjs --tune)
    data/affinity/traits.json  researched Affinity traits per club (ESPN id); the score is computed in the page (docs/affinity.md)
    scripts/             backfill.mjs, sync.mjs, backtest.mjs, logos.py, serve.mjs, lib/

## Run
- `node scripts/serve.mjs` -> http://localhost:8080 (or the "web" entry in .claude/launch.json)
- `node scripts/sync.mjs` refetch + republish (`--no-fetch` to republish only). `python3 scripts/logos.py` for new clubs' crests.
- `node scripts/backtest.mjs [--pool eur|mls|nwsl|usl] [--tune]` walk-forward backtest; --tune writes model/params.json (~25 min).
- `node scripts/backfill.mjs [--only k] [--from 2016] [--force]` history download (one request per match day).
- data/fixtures/<k>.json: official fixtures ESPN hasn't listed yet (e.g. USL play-offs); sync adds them (`fx`) until ESPN lists the same clubs within three days.
- GitHub Actions: sync.yml four times a day commits history/ + web/data + web/logos and redeploys; pages.yml deploys web/.

## Model (docs/model.md)
Elo over all history (Europe one pool via UEFA matches; MLS + Liga MX one pool, 'mls', via Leagues Cup and Concacaf Champions Cup), plus attack/defence fitted on time-weighted matches whose targets
mix goals with a shots-on-target xG proxy, pulled toward the Elo prior. Draw calibration (rho, drawK) per pool. Match grids
blend with bookmaker odds (weight chosen by backtest against closing odds). Pre-match predictions are frozen in history/
once a match starts (`pk`), so the Picks record is honest; picks for matches before the app existed are walk-forward (`pk.wf`).

## Affinity (docs/affinity.md)
web/affinity.js v4 (2026-11-07): logistic model fitted in the page to Kevin's "which would you rather support?" picks
(state.affPicks; only those since settings.affSince / app.js AFF_CLEAR count; Settings > Start Affinity over).
Model features (affinity.js MODEL, PARTS, FLAGS; chosen by backtest, scripts/affinity/groupings.mjs): Atmosphere (singing
end, ground), Fan power (voice, stewardship), Story (comeback, punch), The city's club (High-energy football dropped 2026-11-07: style changes with managers), Contender
(set aside like fame since 2026-11-07: Kevin minds front-running picks, not contention), City vibe and Big, glitzy city (the club's city profile, traits cityp,
research/cities, merge_cities.py), flags State ownership, Racism or fan-culture record, Franchise (feeder/brand or moved/
manufactured, set by hand). Every weight starts at 0, either sign. Fitted but not counted: league familiarity and fame
(Elo standing). Plus a per-city adjustment (clubs within 10 km, affinity.js cityGroups); no per-club adjustment since 2026-11-07
(Kevin: rely on the inferred traits; fit items: false). His clubs are never asked about, but picks with them count, and
every club is scored the same way, so starring a club changes nothing. No rivalry factor. Researched traits
kept in traits.json (incl. rituals, women, inclusion, lean, geography) and shown under each group on the club breakdown.
Quiz answers: a club, "No strong opinion" ('=', half a pick each way), "Don't know enough about" one or either ('?<id>',
'??': Clubs > Explore > To look into, settings.affKnown); one league at a time (chips); the top-ten round robin waits for
150 decisive picks. Analyse picks with scripts/affinity/analyze.mjs (Settings > Copy my club picks).
Players: web/players.js v2 (2026-11-07, Kevin's choices; backtest scripts/affinity/pgroupings.mjs): groups Character (CH,
SP, VO, CO, HU), Team player, Loyalty (can only count for), Class on the pitch (greatness, joy to watch, legacy), Clubs you
like (club Affinity of his clubs, not his own clubs: "played for your club" dropped), American; flags Wrongdoing,
Money or disloyal moves; familiarity set aside (still playing, women's game, big clubs, league of current/last club).
Nothing pre-set; the per-player adjustment stays (traits alone predict ~55%). Picks before app.js PCLEAR don't count
(Settings brings them back). Quiz: the club quiz's answers (=, ?id, ??), Players to look into (settings.pKnown), league
chips, variety. 2,340 researched players (data/affinity/players.json, research/BRIEF.md, merge_research.py, char split
merge_char.py). Serious wrongdoing = harm to people; uncharged allegations aren't coded (docs/affinity.md).

## Match importance, match of the day/week
sim.js records, for every remaining match, each side's zone (and title/cup) chances given home win / draw / away win.
Importance = weighted sum of |P(win) − P(loss)| swings (gold 1, good 0.8, ok 0.6, warn 0.5, bad 0.8, title/cup 1).
Match of the day (Today, all leagues) and of the week (each league's Matches tab) = 0.75 × importance (vs the best in
the set) + 0.25 × closeness; the choice is stored in state.motw and locked once that match kicks off.
With Kevin's clubs in the competition (Today: any of the day's leagues) importance is instead how much the result moves
his clubs' chances (sim `focus`, fixtures[].fav; moves under 3 points are noise and don't count), whether or not they
play; 0.85 × that + 0.15 × closeness. No club of his, or nothing on the day moves them: the usual pick. The card shows
stakes 0–10 (against the biggest remaining match in that competition, same measure).
Today (redesigned 2026-10-18, club-first 2026-10-19): Live (only while on) · Your clubs (cards: next match or live
score, last result, the chance in doubt; each opens the club page) · Watch (the day's best: top pick first, up to four
more that have a reason) · Matches (one day at a time, Today/Tomorrow/next chips; your clubs' matches pinned first;
quiet leagues folded).
Navigation is built around his clubs, treated equally (always ordered by next kickoff, app.js myClubs): the Clubs tab
is a club page (crest chips switch clubs; at stake next match, chances per competition, mini tables, one schedule
across competitions, strength, Affinity, players; the same body as the club sheet, clubBody) with Explore (ratings,
Affinity, Players) below; Leagues chips list his clubs' competitions first, then a divider, and open on the first of
them until he picks one; long tables offer jump links to his clubs; Picks pins his clubs' matches first each day. Match of the day is the Watch top pick; the Match of the week card stays on each league's Matches tab.
Watch list (app.js watchList): the next days with matches in every competition (since 2026-10-22; league level scales quality),
ranked by a watch score of 100 (weights 2026-10-20): your club playing 40, stakes 15 (not rounded), quality 25 (the weaker
club's Elo rank within the league × league level, plus closeness), how far the result moves your clubs' chances 10 (absolute, full marks at
~25 pts in a play-off race), Affinity 10 (5 × the two clubs' total, 5 × their difference: a club he likes against
one he doesn't); the reasons are shown under each match.
The match sheet shows the swings as "What's at stake".

## Working agreements (carried over from the old app)
- Plain, short replies. Show what changed and the concrete effect (numbers, examples). No hype.
- Never overwrite results Kevin entered. His entries win over ESPN in the app; disagreements are shown, not resolved.
- FotMob Predict: a predicted score per match, 90 minutes only; 2 points for the result, +1 for the exact score. Never scrape FotMob (or Opta). After extra time the 90-minute score isn't known: a draw pick gets the result points, no exact bonus (app.js ptsFor).
- House rules (Picks page, beside FotMob; v2 since 2026-10-20): home win 2, draw 5, away win 6, +3 exact (either win 4 at a neutral venue); engine.js HOUSE, frozen as `pk.hp` with its version `pk.hv` (older picks are worked out again from their frozen chances).
- Terminology: "Affinity", "Matches" (not Games), "Race", "Scenarios".
- Design: clean and quiet. Neutral surfaces, a competition's colour only as a small accent, numbers first. Less on screen beats more.
- Crests: ESPN has a few on white squares (Sacramento Republic, Phoenix, San Antonio); scripts/logos.py clears them. Check new clubs.
- Clinched/eliminated must be proven, never inferred from simulations (simulations may only rule a proof out).
- Kevin started following closely with the 2026 World Cup; don't judge clubs or players by whether he's heard of them.
- "Ship it" = commit, push to main (Pages deploys main) without asking.
