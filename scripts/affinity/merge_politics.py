"""Merge the political-leaning trait (lean; brief: data/affinity/research/politics/BRIEF.md) from
data/affinity/research/politics/out/*.json into data/affinity/traits.json and web/data/traits.json. Idempotent: only
`lean` and `why.lean` are set.

    python3 scripts/affinity/merge_politics.py
"""
import json, glob, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
res = {}
for f in sorted(glob.glob(str(ROOT / 'data/affinity/research/politics/out/*.json'))):
    for r in json.load(open(f)):
        try: res[str(r['espn_id'])] = (max(0.0, min(10.0, float(r['lean']))), (r.get('why') or {}).get('lean', ''), r.get('confidence'), r.get('sources', []))
        except (KeyError, TypeError, ValueError): print('unreadable', r.get('name'))
for path, kw in [('data/affinity/traits.json', {'indent': 1}), ('web/data/traits.json', {'separators': (',', ':')})]:
    T = json.load(open(ROOT / path)); n = 0
    for i, (v, why, conf, src) in res.items():
        if i not in T: continue
        c = T[i]; c['lean'] = int(v) if v == int(v) else round(v, 1); c.setdefault('why', {})['lean'] = why
        if path.startswith('data/'): c['politics'] = {'confidence': conf, 'sources': src, 'researched': 'politics-2026-11'}
        n += 1
    json.dump(T, open(ROOT / path, 'w'), ensure_ascii=False, **kw)
    left = [c['name'] for k, c in T.items() if not k.startswith('_') and 'lean' not in c]
    print(path, n, 'merged; without:', len(left), left[:8])
