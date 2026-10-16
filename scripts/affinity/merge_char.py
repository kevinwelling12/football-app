"""Character split (2026-10-15): merge data/affinity/research/char/out/*.json (SP sportsmanship, VO speaks out,
CO community, HU humility; brief in research/char/BRIEF.md) into data/affinity/players.json and web/data/players.json.

    python3 scripts/affinity/merge_char.py
"""
import json, glob, pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parents[2]
P = json.load(open(ROOT / 'data/affinity/players.json'))
n = 0
for f in sorted(glob.glob(str(ROOT / 'data/affinity/research/char/out/*.json'))):
    for r in json.load(open(f)):
        p = P.get(r['id'])
        if not p:
            continue
        for k in ('SP', 'VO', 'CO', 'HU'):
            p['t'][k] = round(float(r[k]), 1)
            if r.get('why', {}).get(k):
                p.setdefault('why', {})[k] = r['why'][k]
        n += 1
json.dump(P, open(ROOT / 'data/affinity/players.json', 'w'), ensure_ascii=False, separators=(',', ':'))
shutil.copy(ROOT / 'data/affinity/players.json', ROOT / 'web/data/players.json')
print(f'{n} players with the four Character traits')
