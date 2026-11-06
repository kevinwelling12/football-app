"""Merge the story traits (comeback, punch; brief: data/affinity/research/story/BRIEF.md) from
data/affinity/research/story/out/*.json into data/affinity/traits.json, keyed by ESPN id. Idempotent: it only sets
those two traits and their `why` lines; every other field is kept.

    python3 scripts/affinity/merge_story.py
"""
import json, glob, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
T = json.load(open(ROOT / 'data/affinity/traits.json'))
done, missing, bad = 0, [], []
for f in sorted(glob.glob(str(ROOT / 'data/affinity/research/story/out/*.json'))):
    for r in json.load(open(f)):
        i = str(r['espn_id'])
        if i not in T:
            missing.append(r.get('name', i)); continue
        try:
            vals = {t: max(0.0, min(10.0, float(r[t]))) for t in ('comeback', 'punch')}
        except (KeyError, TypeError, ValueError):
            bad.append(r.get('name', i)); continue
        c = T[i]
        for t, v in vals.items(): c[t] = int(v) if v == int(v) else round(v, 1)
        c.setdefault('why', {})
        for t in ('comeback', 'punch'): c['why'][t] = (r.get('why') or {}).get(t, '')
        c['story'] = {'confidence': r.get('confidence'), 'sources': r.get('sources', []), 'researched': 'story-2026-11'}
        done += 1
json.dump(T, open(ROOT / 'data/affinity/traits.json', 'w'), ensure_ascii=False, indent=1)
left = [c['name'] for k, c in T.items() if not k.startswith('_') and 'comeback' not in c]
print(f'{done} clubs merged; not in traits: {missing or "none"}; unreadable: {bad or "none"}; still without: {len(left)} {left[:10]}')
