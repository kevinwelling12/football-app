"""Add researched current players (data/affinity/research/out/*.json, written to BRIEF.md) to data/affinity/players.json.

    python3 scripts/affinity/merge_research.py

Idempotent: research entries replace earlier research entries for the same player; players imported from the old app keep
their audited scores unless a new research entry has the same ESPN id (then the new entry wins).
"""
import json, glob, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from build_players import club_id, flags, slug, ROOT

players = json.load(open(ROOT / 'data/affinity/players.json'))
by_espn = {p['espn']: k for k, p in players.items() if p.get('espn')}
added = updated = bad = 0
for f in sorted(glob.glob(str(ROOT / 'data/affinity/research/out/*.json'))):
    try:
        rows = json.load(open(f))
    except Exception as e:
        print('skip (invalid JSON)', f, e); bad += 1; continue
    for r in rows:
        if not r.get('name') or not all(k in r for k in ['CH', 'WK', 'LO', 'AB', 'ST', 'LE']):
            bad += 1; continue
        women = r.get('gender') == 'W'
        clubs = [[c.get('club'), club_id(c.get('club') or '', women), c.get('from'), c.get('to')] for c in r.get('clubs') or [] if c.get('club')]
        if r.get('club_id') and not any(c[1] == r['club_id'] for c in clubs) and clubs:
            # make sure the current club maps even when the name differs from ours
            for c in reversed(clubs):
                if c[3] is None: c[1] = r['club_id']; break
        rec = {
            'n': r['name'], 'g': 'W' if women else 'M', 'act': True, 'born': r.get('born'), 'nat': r.get('nation'), 'pos': r.get('position'),
            'cur': next((c[0] for c in reversed(clubs) if c[3] is None), None), 'clubs': clubs,
            't': {k: r.get(k) for k in ['CH', 'WK', 'LO', 'AB', 'ST', 'LE']}, 'f': flags(r.get('codes') or {}),
            'why': r.get('why') or {}, 'notes': r.get('notes') or '', 'honours': r.get('honours') or '', 'causes': (r.get('causes') or [])[:2],
            'espn': r.get('espn_id'), 'conf': r.get('confidence'), 'src': 'research-2026',
        }
        key = by_espn.get(r.get('espn_id')) or slug(r['name'])
        if key in players and players[key].get('src') != 'research-2026' and key not in by_espn.values():
            key = f"{key}-{r.get('espn_id')}"  # a different player with the same name as an imported one
        updated += key in players; added += key not in players
        players[key] = rec; by_espn[rec['espn']] = key
json.dump(players, open(ROOT / 'data/affinity/players.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(players)} players ({added} added, {updated} updated, {bad} skipped)')
