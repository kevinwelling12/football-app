"""Merge researched club traits (data/affinity/research/clubs/out/*.json, brief: research/clubs/BRIEF.md) into
data/affinity/traits.json, keyed by ESPN id. Idempotent; never overwrites a club that already has traits unless --force.

    python3 scripts/affinity/merge_clubs.py [--force]
"""
import json, glob, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
TRAITS = ['terrace', 'city', 'voice', 'conscience', 'ground', 'contender', 'rituals', 'stewardship', 'women', 'intensity']
force = '--force' in sys.argv
T = json.load(open(ROOT / 'data/affinity/traits.json'))
added = updated = skipped = 0
for f in sorted(glob.glob(str(ROOT / 'data/affinity/research/clubs/out/*.json'))):
    for r in json.load(open(f)):
        i = str(r['espn_id'])
        if i in T and not force and not T[i].get('researched'):
            skipped += 1
            continue
        rec = {'name': r['name'], 'src': r['name'], **{t: r[t] for t in TRAITS}, 'll': r.get('ll'),
               'why': {t: (r.get('why') or {}).get(t, '') for t in TRAITS}, 'researched': 'clubs-2026-10',
               'confidence': r.get('confidence'), 'sources': r.get('sources', []),
               # majority owner is a state or sovereign fund: set by hand, kept across merges
               'state': bool(T.get(i, {}).get('state', r.get('state', False)))}
        updated += i in T
        added += i not in T
        T[i] = rec
json.dump(T, open(ROOT / 'data/affinity/traits.json', 'w'), ensure_ascii=False, indent=1)
print(f'{len(T)} clubs ({added} added, {updated} updated, {skipped} kept)')
