"""Player Affinity data: data/affinity/players.json from the old app's player research (kevinwelling12/football-suite,
scripts/affinity/players and scripts/blind/coded), one-off import 2026-10-13.

    python3 scripts/affinity/build_players.py <path to the old repo checkout>

Per player: identity, career (clubs with years, mapped to ESPN team ids where the club has Affinity traits), six audited
0-10 traits (CH character, WK team player, LO loyalty, AB greatness, ST joy to watch, LE legacy; SCORING_BRIEF.md anchors)
and four incident groups from the coded facts:
  serious = abuse allegation, racist abuse, match-fixing, other criminal conviction
  lesser  = doping, tax fraud, violent conduct on the pitch
  money   = money-league move (Saudi/Qatar/UAE/China), paid ambassador for an authoritarian state
  moves   = forced a transfer, moved directly between bitter rivals
"""
import json, glob, re, sys, unicodedata, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
TRAITS = json.load(open(ROOT / 'data/affinity/traits.json'))
NWSL = {t['id'] for t in json.load(open(ROOT / 'web/data/nwsl.json'))['teams']}


def norm(s):
    s = unicodedata.normalize('NFD', (s or '').replace('ø', 'o')).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\((loan|on loan)\)|\bwomen\b|\bfemenino\b|\bfrauen\b|\bfeminine\b|\bladies\b', ' ', s)
    s = re.sub(r'\b(fc|afc|cf|sc|ac|as|fk|sv|club|football|soccer|de|the|\d+)\b', ' ', s)
    return re.sub(r'[^a-z]', '', s)


ALIAS = {'mancity': 'manchestercity', 'manutd': 'manchesterunited', 'manunited': 'manchesterunited', 'psg': 'parissaintgermain',
         'bayern': 'bayernmunich', 'bayernmunchen': 'bayernmunich', 'spurs': 'tottenhamhotspur', 'tottenham': 'tottenhamhotspur',
         'inter': 'internazionale', 'intermilan': 'internazionale', 'leipzig': 'rbleipzig', 'koln': 'cologne', 'kln': 'cologne',
         'nycfc': 'newyorkcity', 'newyorkcityfc': 'newyorkcity', 'lafc': 'lafc', 'losangeles': 'lafc', 'thorns': 'portlandthorns',
         'portlandthorns': 'portlandthorns', 'reign': 'seattlereign', 'olreign': 'seattlereign', 'gotham': 'gotham', 'njnygotham': 'gotham',
         'skyblue': 'gotham', 'hamburg': 'hamburg', 'hamburger': 'hamburg', 'atleticomadrid': 'atleticomadrid', 'atletico': 'atleticomadrid',
         'brighton': 'brightonhovealbion', 'wolves': 'wolverhamptonwanderers', 'unionberlin': 'unionberlin'}
FUZZY = {}  # partial matches, printed for review
BY = {}
for i, c in TRAITS.items():
    BY.setdefault(norm(c['name']), []).append(i)


# different clubs whose names contain one of ours
NOMAP = {'chestercity', 'sandiegoloyal'}


RESERVE = re.compile(r'\s(2|II|B|III|U-?\d\d|reserves?|academy)\s*$|\bII\b|\bB team\b', re.I)


def club_id(name, women):
    # reserve and B teams aren't the club ("Portland Timbers 2" must not count as the Timbers)
    if RESERVE.search(name or ''):
        return None
    k = norm(name)
    k = ALIAS.get(k, k)
    if k in NOMAP:
        return None
    ids = BY.get(k, [])
    if not ids:
        # partial match only when the shorter name is most of the longer one ("athletic" must not match "hartfordathletic")
        ids = [i for n, v in BY.items() if len(k) > 4 and len(n) > 4 and (k in n or n in k) and min(len(k), len(n)) / max(len(k), len(n)) >= 0.6 for i in v]
        if ids:
            FUZZY.setdefault(name, set()).update(TRAITS[i]['name'] for i in ids)
    # women's careers link only to NWSL clubs (the women's game), men's never do
    ids = [i for i in ids if (i in NWSL) == women]
    return ids[0] if len(ids) == 1 else None


def flags(c):
    return {
        'serious': int(bool(c.get('abuse_allegation') or c.get('racist_abuse') or c.get('match_fixing') or c.get('criminal_other'))),
        'lesser': int(bool(c.get('doping') or c.get('tax_fraud') or c.get('red_card_violence'))),
        'money': int(bool(c.get('money_league') or c.get('authoritarian_ambassador'))),
        'moves': int(bool(c.get('forced_transfer') or c.get('rival_move'))),
    }


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFD', name).encode('ascii', 'ignore').decode().lower()).strip('-')


def main(old):
    OLD = pathlib.Path(old) / 'scripts'
    facts = {}
    for f in sorted(glob.glob(str(OLD / 'affinity/players/research/out/*.json'))):
        for p in json.load(open(f)):
            facts[p['name']] = p
    scores = {}
    for f in sorted(glob.glob(str(OLD / 'affinity/players/scores/*.json'))):
        for s in json.load(open(f)):
            scores.setdefault(s['name'], s)
    merged = json.load(open(OLD / 'affinity/players/audit/merged.json'))
    coded = {}
    for f in sorted(glob.glob(str(OLD / 'blind/coded/players_*.json'))):
        for p in json.load(open(f)):
            coded[p['name']] = p

    out, unmapped = {}, {}
    for name, p in facts.items():
        sc = {**scores.get(name, {}), **merged.get(name, {})}
        c = coded[name]
        women = p.get('gender') == 'W'
        clubs = []
        for cl in p.get('clubs', []):
            cid = club_id(cl['club'], women)
            if not cid:
                unmapped[cl['club']] = unmapped.get(cl['club'], 0) + 1
            clubs.append([cl['club'], cid, cl.get('from'), cl.get('to')])
        cur = next((cl[0] for cl in reversed(clubs) if cl[3] is None), None) if p.get('active') else None
        pid = re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFD', name).encode('ascii', 'ignore').decode().lower()).strip('-')
        why = {}
        for part in (sc.get('why') or '').split(';'):
            m = re.match(r'\s*(CH|WK|LO|AB|ST|LE)\s+(.*)', part)
            if m:
                why[m.group(1)] = m.group(2).strip()
        out[pid] = {
            'n': name, 'g': 'W' if women else 'M', 'act': bool(p.get('active')), 'born': p.get('born'), 'nat': p.get('nation'),
            'pos': (p.get('positions') or [None])[0], 'cur': cur, 'clubs': clubs,
            't': {k: sc.get(k) for k in ['CH', 'WK', 'LO', 'AB', 'ST', 'LE']},
            'f': {
                'serious': int(bool(c['abuse_allegation'] or c['racist_abuse'] or c['match_fixing'] or c['criminal_other'])),
                'lesser': int(bool(c['doping'] or c['tax_fraud'] or c['red_card_violence'])),
                'money': int(bool(c['money_league'] or c['authoritarian_ambassador'])),
                'moves': int(bool(c['forced_transfer'] or c['rival_move'])),
            },
            'why': why, 'notes': c.get('notes') or '', 'honours': p.get('honours') or '', 'causes': (p.get('causes') or [])[:2],
        }
    json.dump(out, open(ROOT / 'data/affinity/players.json', 'w'), ensure_ascii=False, separators=(',', ':'))
    linked = sum(1 for p in out.values() if any(c[1] for c in p['clubs']))
    print(f"{len(out)} players; {linked} linked to at least one club with traits; flags: "
          + ', '.join(f"{k} {sum(p['f'][k] for p in out.values())}" for k in ['serious', 'lesser', 'money', 'moves']))
    print('most common unmapped clubs:', sorted(unmapped.items(), key=lambda x: -x[1])[:25])


if __name__ == '__main__':
    main(sys.argv[1])
