"""Unisce lib/*.json in lib/data.js (window.EXDATA) dopo averli validati.

Uso: python3 lib/build.py
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LANGS = ['it', 'en', 'es', 'fr', 'de']
GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'core', 'quads', 'hams', 'calves', 'fullbody']
MUSCLES = set('chest upperChest frontDelt sideDelt rearDelt triceps biceps forearms brachialis lats upperBack traps '
              'lowerBack quads hams glutes adductors abductors calves tibialis abs obliques hipFlexors'.split())
EQ = set('barbell dumbbell machine smith cable bodyweight kettlebell band ezbar trapbar landmine suspension plate'.split())

errors, warnings = [], []


def text(obj, where, required=True, limit=None):
    if obj is None and not required:
        return
    if not isinstance(obj, dict):
        errors.append(f'{where}: deve essere un oggetto con le 5 lingue')
        return
    for l in LANGS:
        v = obj.get(l)
        if not isinstance(v, str) or not v.strip():
            errors.append(f'{where}.{l}: mancante')
        elif limit and len(v) > limit:
            warnings.append(f'{where}.{l}: {len(v)} caratteri (> {limit})')
    extra = set(obj) - set(LANGS)
    if extra:
        errors.append(f'{where}: lingue non previste {sorted(extra)}')


data, ids = [], set()
for path in sorted(glob.glob(os.path.join(HERE, '*.json'))):
    try:
        items = json.load(open(path, encoding='utf-8'))
    except Exception as e:
        errors.append(f'{os.path.basename(path)}: JSON non valido ({e})')
        continue
    for b in items:
        bid = b.get('id', '?')
        w = f'{os.path.basename(path)}:{bid}'
        if bid in ids:
            errors.append(f'{w}: id duplicato')
        ids.add(bid)
        if b.get('g') not in GROUPS:
            errors.append(f'{w}: gruppo {b.get("g")!r} non valido')
        for f in ('pri', 'sec'):
            bad = [m for m in b.get(f, []) if m not in MUSCLES]
            if bad:
                errors.append(f'{w}.{f}: muscoli non validi {bad}')
        if not b.get('pri'):
            errors.append(f'{w}: pri vuoto')
        if b.get('lvl') not in (0, 1, 2):
            errors.append(f'{w}: lvl non valido')
        if not isinstance(b.get('reps'), str) or not b['reps']:
            errors.append(f'{w}: reps mancante')
        text(b.get('name'), w + '.name', limit=60)
        text(b.get('why'), w + '.why', limit=130)
        text(b.get('tip'), w + '.tip', limit=230)
        vs = b.get('variants') or []
        if not vs:
            errors.append(f'{w}: nessuna variante')
        for v in vs:
            vid = v.get('id', '?')
            vw = f'{w}>{vid}'
            if vid in ids:
                errors.append(f'{vw}: id duplicato')
            ids.add(vid)
            if v.get('eq') not in EQ:
                errors.append(f'{vw}: attrezzo {v.get("eq")!r} non valido')
            text(v.get('name'), vw + '.name', limit=70)
            text(v.get('note'), vw + '.note', required=False, limit=120)
        data.append({k: b[k] for k in ('id', 'g', 'pri', 'sec', 'lvl', 'reps', 'name', 'why', 'tip', 'variants') if k in b})

# nomi di variante uguali nella stessa lingua confonderebbero lo storico
for l in LANGS:
    seen = {}
    for b in data:
        for v in b.get('variants', []):
            n = v.get('name', {}).get(l, '').strip().lower()
            if n in seen:
                errors.append(f'nome duplicato ({l}) "{n}": {seen[n]} e {v.get("id")}')
            seen[n] = v.get('id')

for w in warnings[:40]:
    print('avviso:', w)
if errors:
    print(f'{len(errors)} errori:')
    for e in errors[:80]:
        print(' -', e)
    sys.exit(1)

data.sort(key=lambda b: GROUPS.index(b['g']))
out = os.path.join(HERE, 'data.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write('// Generato da lib/build.py: non modificare a mano.\n')
    f.write('window.EXDATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
nv = sum(len(b['variants']) for b in data)
print(f'ok: {len(data)} movimenti, {nv} varianti, {os.path.getsize(out) // 1024} KB')
for g in GROUPS:
    bs = [b for b in data if b['g'] == g]
    print(f'  {g}: {len(bs)} movimenti, {sum(len(b["variants"]) for b in bs)} varianti')
