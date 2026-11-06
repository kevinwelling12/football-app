"""Merge city profiles (brief: data/affinity/research/cities/BRIEF.md) into data/affinity/traits.json and
web/data/traits.json: every club gets `cityp` = {city, country, progressive, outdoors, indie, industrial, glitz, size,
climate}. The input rows (research/cities/in) list the clubs of each city, so clubs added later need a new run.

    python3 scripts/affinity/merge_cities.py
"""
import json, glob, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
K = ['progressive', 'outdoors', 'indie', 'industrial', 'glitz', 'size', 'climate']
rows_in = {r['city_key']: r for f in glob.glob(str(ROOT / 'data/affinity/research/cities/in/*.json')) for r in json.load(open(f))}
prof = {}
for f in sorted(glob.glob(str(ROOT / 'data/affinity/research/cities/out/*.json'))):
    for r in json.load(open(f)):
        try: prof[r['city_key']] = {'city': r.get('city'), 'country': r.get('country'), **{k: max(0.0, min(10.0, float(r[k]))) for k in K}}
        except (KeyError, TypeError, ValueError): print('unreadable', r.get('city_key'))
for path, kw in [('data/affinity/traits.json', {'indent': 1}), ('web/data/traits.json', {'separators': (',', ':')})]:
    T = json.load(open(ROOT / path)); by_name = {}
    for i, c in T.items():
        if not i.startswith('_'): by_name.setdefault(c['name'], []).append(i)
    n = 0
    for key, p in prof.items():
        for name in rows_in.get(key, {}).get('clubs', []):
            for i in by_name.get(name, []):
                T[i]['cityp'] = {k: (int(v) if isinstance(v, float) and v == int(v) else v) for k, v in p.items()}; n += 1
    json.dump(T, open(ROOT / path, 'w'), ensure_ascii=False, **kw)
    left = [c['name'] for k, c in T.items() if not k.startswith('_') and 'cityp' not in c]
    print(path, n, 'clubs given a city profile; without:', len(left), left[:8])
