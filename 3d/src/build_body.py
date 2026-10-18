import bpy, bmesh, json, re, sys
import numpy as np
from mathutils import Vector, kdtree

OUT = sys.argv[sys.argv.index('--') + 1]
SUBD = 0

def unhide(lc):
    lc.exclude = False; lc.hide_viewport = False
    for c in lc.children: unhide(c)
unhide(bpy.context.view_layer.layer_collection)
for o in bpy.data.objects:
    o.hide_viewport = False
    try: o.hide_set(False)
    except Exception: pass
dg = bpy.context.evaluated_depsgraph_get()

def world_arrays(o):
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); me.transform(o.matrix_world)
    V = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
    me.calc_loop_triangles()
    T = np.empty(len(me.loop_triangles) * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', T)
    bpy.data.meshes.remove(me)
    return V, T.reshape(-1, 3)
def side_of(name):
    m = re.search(r'\.(l|r)$', name); return m.group(1) if m else 'c'
def base(name): return re.sub(r'\.(l|r)$', '', name)

# ---------- giunti ----------
def B(name):
    o = bpy.data.objects[name]; return np.array([(o.matrix_world @ v.co)[:] for v in o.data.vertices])
def medial_top(V, frac, top):
    t = V[V[:, 2] > V[:, 2].max() - top]; t = t[np.argsort(np.abs(t[:, 0]))][:max(3, int(len(t) * frac))]; return t.mean(0)
def bottom(V, h): return V[V[:, 2] < V[:, 2].min() + h].mean(0)
def topend(V, h): return V[V[:, 2] > V[:, 2].max() - h].mean(0)
J = {}
for s in 'lr':
    fem, tib, hum, rad, cla = B('Femur.' + s), B('Tibia.' + s), B('Humerus.' + s), B('Radius.' + s), B('Clavicle.' + s)
    J['hip.' + s] = medial_top(fem, .4, .05); J['knee.' + s] = bottom(fem, .035); J['ankle.' + s] = bottom(tib, .02) + np.array([0, 0, .01])
    mt = B('First metatarsal bone.' + s); dp = B('Distal phalanx of first finger of foot.' + s)
    J['toe.' + s] = mt[mt[:, 1] < mt[:, 1].min() + .02].mean(0); J['toeend.' + s] = dp[dp[:, 1] < dp[:, 1].min() + .005].mean(0)
    J['shoulder.' + s] = medial_top(hum, .4, .035); J['elbow.' + s] = bottom(hum, .03); J['wrist.' + s] = bottom(rad, .02)
    m3 = B('Third metacarpal bone.' + s); p3 = B('Proximal phalanx of third finger of hand.' + s); d3 = B('Distal phalanx of third finger of hand.' + s)
    J['mcp.' + s] = bottom(m3, .008); J['pip.' + s] = bottom(p3, .006); J['tip.' + s] = bottom(d3, .004)
    m1 = B('First metacarpal bone.' + s); d1 = B('Distal phalanx of first finger of hand.' + s)
    J['cmc.' + s] = topend(m1, .008); J['tmcp.' + s] = bottom(m1, .008); J['ttip.' + s] = bottom(d1, .004)
    srt = cla[np.argsort(np.abs(cla[:, 0]))]
    J['clavs.' + s] = srt[:max(3, len(srt) // 6)].mean(0); J['clava.' + s] = srt[-max(3, len(srt) // 6):].mean(0)
cen = lambda n: B(n).mean(0)
J['pelvis'] = (J['hip.l'] + J['hip.r']) / 2
J['L5'] = cen('Vertebra L5'); J['T12'] = cen('Vertebra T12'); J['T6'] = cen('Vertebra T6'); J['C7'] = cen('Vertebra C7'); J['C1'] = cen('Atlas (C1)')
sk = np.vstack([B(n) for n in ('Frontal bone', 'Occipital bone')])
J['headtop'] = np.array([J['C1'][0], J['C1'][1] - .02, sk[:, 2].max()])
json.dump({k: [round(float(x), 4) for x in v] for k, v in J.items()}, open(OUT + '.joints.json', 'w'))

BONES = [('root', None, 'pelvis', 'L5'), ('spine1', 'root', 'L5', 'T12'), ('spine2', 'spine1', 'T12', 'T6'),
         ('spine3', 'spine2', 'T6', 'C7'), ('neck', 'spine3', 'C7', 'C1'), ('head', 'neck', 'C1', 'headtop')]
for s in 'lr':
    BONES += [('clav.' + s, 'spine3', 'clavs.' + s, 'clava.' + s), ('uarm.' + s, 'clav.' + s, 'shoulder.' + s, 'elbow.' + s),
              ('farm.' + s, 'uarm.' + s, 'elbow.' + s, 'wrist.' + s), ('hand.' + s, 'farm.' + s, 'wrist.' + s, 'mcp.' + s),
              ('fing1.' + s, 'hand.' + s, 'mcp.' + s, 'pip.' + s), ('fing2.' + s, 'fing1.' + s, 'pip.' + s, 'tip.' + s),
              ('thumb1.' + s, 'hand.' + s, 'cmc.' + s, 'tmcp.' + s), ('thumb2.' + s, 'thumb1.' + s, 'tmcp.' + s, 'ttip.' + s),
              ('thigh.' + s, 'root', 'hip.' + s, 'knee.' + s), ('shin.' + s, 'thigh.' + s, 'knee.' + s, 'ankle.' + s),
              ('foot.' + s, 'shin.' + s, 'ankle.' + s, 'toe.' + s), ('toe.' + s, 'foot.' + s, 'toe.' + s, 'toeend.' + s)]
SEG = {b[0]: (J[b[2]], J[b[3]]) for b in BONES}
ALLB = [b[0] for b in BONES]

# ---------- regioni della pelle → ossa che le muovono ----------
RR = [
 ('hand', r'of hand|^palm$|dorsum of hand|^nail plate$|^perionyx$'),
 ('wrist', r'region of wrist'),
 ('forearm', r'region of forearm|border of forearm|radial foveola'),
 ('elbow', r'region of elbow|cubital fossa'),
 ('arm', r'region of arm|bicipital groove'),
 ('deltoid', r'deltoid region|deltopectoral'),
 ('foot', r'of foot|dorsum of foot|^sole$|heel|metatarsal|arch of foot|hallucial|\(foot\)'),
 ('ankle', r'region of ankle|malleol'),
 ('leg', r'region of leg'),
 ('knee', r'region of knee|popliteal'),
 ('thigh', r'region of thigh|femoral triangle'),
 ('pelvis', r'gluteal|sacral|anal region|urogenital|hip region|inguinal|hypogastric|pubic'),
 ('abdomen', r'epigastric|hypochondriac|umbilic|region of abdomen|lumbar'),
 ('thorax', r'pectoral|mammary|presternal|infraclavicular|region of thorax|scapular|interscapular|infrascapular|auscultation|vertebral region'),
 ('neck', r'triangle|region of neck|sternocleidomastoid|supraclavicular'),
 ('head', r'.'),
]
ALLOW = {'hand': ['hand', 'farm'], 'wrist': ['farm', 'hand'], 'forearm': ['uarm', 'farm', 'hand'], 'elbow': ['uarm', 'farm'], 'arm': ['clav', 'uarm', 'farm'],
 'deltoid': ['clav', 'uarm', 'spine3'], 'foot': ['shin', 'foot', 'toe'], 'ankle': ['shin', 'foot'], 'leg': ['thigh', 'shin', 'foot'], 'knee': ['thigh', 'shin'],
 'thigh': ['root', 'thigh', 'shin'], 'pelvis': ['root', 'spine1', 'thigh'], 'abdomen': ['root', 'spine1', 'spine2'], 'thorax': ['spine2', 'spine3', 'clav'],
 'neck': ['spine3', 'neck', 'head', 'clav'], 'head': ['neck', 'head']}
AX = ('root', 'spine1', 'spine2', 'spine3', 'neck', 'head')
def allowed(kind, s):
    out = []
    for a in ALLOW[kind]:
        if a in AX: out.append(a)
        elif s == 'c': out += [a + '.l', a + '.r']
        else: out.append(a + '.' + s)
    return out
KINDS = [k for k, _ in RR]
def kind_of(n):
    n = base(n).lower()
    for k, rx in RR:
        if re.search(rx, n): return k

reg = bpy.data.collections['9: Regions of human body']
skin_objs, hair_objs = [], []
for o in list(reg.all_objects):
    if o.type != 'MESH' or len(o.data.polygons) == 0 or o.name.endswith('.g'): continue
    b = base(o.name).lower()
    if b in ('hairs of head', 'hairs of eyebrow'): hair_objs.append(o); continue
    if b in ('eyelashes', 'eyebrow', 'urogenital region', 'pubic hairs'): continue   # niente genitali: la zona si richiude liscia piu' avanti
    skin_objs.append(o)
print('skin objs', len(skin_objs), 'hair', len(hair_objs))

def merged(objs, labels=True):
    Vs, Ts, L, off = [], [], [], 0
    for o in objs:
        V, T = world_arrays(o)
        Vs.append(V); Ts.append(T + off); off += len(V)
        L += [(KINDS.index(kind_of(o.name)) if labels else 0, 'lrc'.index(side_of(o.name)))] * len(V)
    return np.vstack(Vs), np.vstack(Ts), np.array(L)

def weld_subdivide(V, T, levels):
    me = bpy.data.meshes.new('t'); me.from_pydata(V.tolist(), [], T.tolist()); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0006)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('t', me); bpy.context.scene.collection.objects.link(ob)
    if levels:
        m = ob.modifiers.new('s', 'SUBSURF'); m.levels = levels; m.render_levels = levels
    d2 = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(d2))
    bpy.data.objects.remove(ob)
    V2 = np.empty(len(me2.vertices) * 3); me2.vertices.foreach_get('co', V2); V2 = V2.reshape(-1, 3)
    me2.calc_loop_triangles(); T2 = np.empty(len(me2.loop_triangles) * 3, dtype=np.int64); me2.loop_triangles.foreach_get('vertices', T2)
    bpy.data.meshes.remove(me2)
    return V2, T2.reshape(-1, 3)

def kd_of(P):
    kd = kdtree.KDTree(len(P))
    for i, p in enumerate(P): kd.insert(p.tolist(), i)
    kd.balance(); return kd

def seg_d(P, A, Bp):
    ab = Bp - A; t = np.clip(((P - A) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(P - (A + np.outer(t, ab)), axis=1)
def seg_weights(P, names, p=2.0, k=3):
    D = np.stack([seg_d(P, *SEG[n]) for n in names], 1)
    W = 1.0 / (D + .008) ** p
    if W.shape[1] > k:
        thr = np.sort(W, 1)[:, -k][:, None]; W = np.where(W >= thr, W, 0)
    W /= W.sum(1, keepdims=True); W[W < .04] = 0; W /= W.sum(1, keepdims=True)
    return W

# ---------- pelle ----------
V0, T0, L0 = merged(skin_objs)
V, T = weld_subdivide(V0, T0, SUBD)
kd0 = kd_of(V0)
lab = np.array([L0[kd0.find(v.tolist())[1]] for v in V])
print('skin verts', len(V), 'tris', len(T))
# chiude il vuoto lasciato dalla zona genitale con una superficie liscia (come un manichino)
def fill_crotch(V, T):
    me = bpy.data.meshes.new('fc'); me.from_pydata(V.tolist(), [], T.tolist()); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    hz = J['pelvis'][2]
    near = lambda v: abs(v.co.x) < .13 and hz - .26 < v.co.z < hz + .08 and v.co.y < .06
    edges = [e for e in bm.edges if e.is_boundary and near(e.verts[0]) and near(e.verts[1])]
    n0 = len(bm.faces)
    res = bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    newf = res.get('faces', [])
    bmesh.ops.triangulate(bm, faces=newf)
    bm.faces.ensure_lookup_table()
    fillv = set(v for f in bm.faces[n0:] for v in f.verts)
    # suddivide il riempimento e lo leviga, tenendo fermo il bordo
    newf = [f for f in bm.faces[n0:]]
    r2 = bmesh.ops.subdivide_edges(bm, edges=list(set(e for f in newf for e in f.edges if all(v in fillv for v in e.verts))), cuts=2, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    bm.verts.ensure_lookup_table()
    inner = [v for v in bm.verts if near(v) and not v.is_boundary and (v in fillv or v.index >= len(V))]
    for _ in range(60): bmesh.ops.smooth_vert(bm, verts=inner, factor=.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(me); bm.free()
    V2 = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', V2); V2 = V2.reshape(-1, 3)
    me.calc_loop_triangles(); T2 = np.empty(len(me.loop_triangles) * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', T2)
    bpy.data.meshes.remove(me)
    print('crotch filled: boundary edges', len(edges), 'new faces', len(newf), 'verts', len(V), '->', len(V2))
    return V2, T2.reshape(-1, 3)
V, T = fill_crotch(V, T)
lab = np.array([L0[kd0.find(v.tolist())[1]] for v in V])
# niente genitali: la regione urogenitale viene levigata fino a una superficie liscia da manichino (bordi fermi)
def smooth_region(V, T, mask, iters=120):
    me = bpy.data.meshes.new('sm'); me.from_pydata(V.tolist(), [], T.tolist()); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    inner = [v for v in bm.verts if mask[v.index] and not v.is_boundary and all(mask[e.other_vert(v).index] for e in v.link_edges)]
    for _ in range(iters): bmesh.ops.smooth_vert(bm, verts=inner, factor=.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    out = np.array([v.co[:] for v in bm.verts]); bm.free(); bpy.data.meshes.remove(me)
    return out, len(inner)
ug = np.array([kind_of_name == 'x' for kind_of_name in []])
UGI = [i for i, o in enumerate(skin_objs)]
ugmask = np.zeros(len(V), bool)
kd_ug = None
_ugo = [o for o in skin_objs if base(o.name).lower() in ('urogenital region', 'pubic hairs')]
if _ugo:
    UV = np.vstack([world_arrays(o)[0] for o in _ugo]); kd_ug = kd_of(UV)
    for i, v in enumerate(V):
        if kd_ug.find(v.tolist())[2] < .004: ugmask[i] = True
    V, n_in = smooth_region(V, T, ugmask)
    # davanti piatto: nessun punto piu' avanti del bordo della regione (y negativa = davanti nel modello)
    edge = [i for i in np.nonzero(ugmask)[0]]
    yb = np.percentile(V[ugmask, 1], 85)
    sel = ugmask & (V[:, 1] < yb)
    V[sel, 1] = yb + (V[sel, 1] - yb) * .12
    V, _ = smooth_region(V, T, ugmask, 60)
    print('urogenital smoothed', int(ugmask.sum()), n_in)
# davanti al cavallo nessun punto sporge oltre la linea che unisce il davanti delle due cosce (y negativa = davanti)
hz = J['pelvis'][2]
zone = (np.abs(V[:, 0]) < .095) & (V[:, 2] > hz - .2) & (V[:, 2] < hz + .02) & (V[:, 1] < .03)
ring = (np.abs(V[:, 0]) > .095) & (np.abs(V[:, 0]) < .14) & (V[:, 1] < .03)
zs = np.linspace(hz - .22, hz + .04, 14); lim = []
for z0 in zs:
    sel = ring & (np.abs(V[:, 2] - z0) < .02)
    lim.append(V[sel, 1].min() if sel.any() else -.06)
lim = np.interp(V[zone, 2], zs, np.array(lim)) + .02
before = V[zone, 1].min()
V[zone, 1] = np.maximum(V[zone, 1], lim)
cm = np.zeros(len(V), bool); cm[np.nonzero(zone)[0]] = True
V, _ = smooth_region(V, T, cm, 80)
print('crotch flattened', int(zone.sum()), round(float(before), 3), '->', round(float(V[zone, 1].min()), 3))

W = np.zeros((len(V), len(ALLB)))
for ki, kind in enumerate(KINDS):
    for si, s in enumerate('lrc'):
        idx = np.nonzero((lab[:, 0] == ki) & (lab[:, 1] == si))[0]
        if not len(idx): continue
        names = allowed(kind, s)
        w = seg_weights(V[idx], names)
        for j, n in enumerate(names): W[idx, ALLB.index(n)] = w[:, j]

# mani e dita: peso dall'osso piu' vicino del modello osseo (falangi → dita, primo metacarpo → pollice)
def hand_label(n, s):
    n = n.lower()
    if 'first finger of hand' in n: return 'thumb2.' + s
    if 'first metacarpal' in n: return 'thumb1.' + s
    if re.search(r'proximal phalanx of (second|third|fourth|fifth) finger of hand', n): return 'fing1.' + s
    if re.search(r'(middle|distal) phalanx of (second|third|fourth|fifth) finger of hand', n): return 'fing2.' + s
    if re.search(r'metacarpal|carpal|scaphoid|lunate|triquetrum|pisiform|trapez|capitate|hamate', n): return 'hand.' + s
    return None
skel = bpy.data.collections['1: Skeletal system']
for s in 'lr':
    pts, lbl = [], []
    for o in list(skel.all_objects):
        if o.type != 'MESH' or not o.name.endswith('.' + s): continue
        hl = hand_label(base(o.name), s)
        if not hl: continue
        P = B(o.name); P = P[::max(1, len(P) // 400)]
        pts.append(P); lbl += [hl] * len(P)
    P = np.vstack(pts); kd = kd_of(P)
    hk, wk = KINDS.index('hand'), KINDS.index('wrist')
    idx = np.nonzero(((lab[:, 0] == hk)) & (lab[:, 1] == 'lrc'.index(s)))[0]
    for i in idx:
        W[i] = 0; acc = {}
        for (co, j, d) in kd.find_n(V[i].tolist(), 28):
            acc[lbl[j]] = acc.get(lbl[j], 0) + 1 / (d + .006) ** 2
        tot = sum(acc.values())
        for n, w in acc.items(): W[i, ALLB.index(n)] = w / tot
    print('hand weights', s, len(idx))

# pesi levigati lungo la superficie: pieghe piu' morbide a gomiti, ginocchia e dita
E = np.vstack([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
for it in range(3):
    acc = np.zeros_like(W); cnt = np.zeros(len(W))
    np.add.at(acc, E[:, 0], W[E[:, 1]]); np.add.at(acc, E[:, 1], W[E[:, 0]]); np.add.at(cnt, E[:, 0], 1); np.add.at(cnt, E[:, 1], 1)
    W = .5 * W + .5 * acc / np.maximum(cnt, 1)[:, None]
# sulle mani qualche passaggio in piu': le nocche si piegano senza che le dita sembrino pezzi staccati
hm = np.isin(lab[:, 0], [KINDS.index('hand'), KINDS.index('wrist')])
for it in range(6):
    acc = np.zeros_like(W); cnt = np.zeros(len(W))
    np.add.at(acc, E[:, 0], W[E[:, 1]]); np.add.at(acc, E[:, 1], W[E[:, 0]]); np.add.at(cnt, E[:, 0], 1); np.add.at(cnt, E[:, 1], 1)
    W[hm] = .4 * W[hm] + .6 * (acc / np.maximum(cnt, 1)[:, None])[hm]
W[W < .02] = 0; W /= W.sum(1, keepdims=True)

# mappa dei muscoli dipinta sulla pelle: gruppo del muscolo superficiale piu' vicino + vicinanza
MRULES = [
 ('chest', r'pectoralis major|clavicular head of pectoralis|sternocostal head of pectoralis|abdominal part of pectoralis'),
 ('delt_front', r'clavicular part of deltoid'), ('delt_side', r'acromial part of deltoid'), ('delt_rear', r'scapular spinal part of deltoid'),
 ('biceps', r'biceps brachii'), ('brachialis', r'^brachialis'), ('triceps', r'triceps brachii|^anconeus'),
 ('forearm', r'^brachioradialis|extensor carpi|^extensor digitorum$|extensor digiti minimi|flexor carpi|flexor digitorum superficialis|palmaris longus|pronator teres|extensor pollicis|abductor pollicis longus'),
 ('traps_up', r'descending part of trapezius'), ('traps_mid', r'transverse part of trapezius|ascending part of trapezius'),
 ('lats', r'latissimus dorsi|teres major'), ('rotator', r'infraspinatus|teres minor'), ('rhomboids', r'rhomboid major'),
 ('erector', r'iliocostalis lumborum|longissimus thoracis'), ('serratus', r'serratus anterior'), ('abs', r'rectus abdominis'),
 ('obliques', r'external abdominal oblique'), ('glute_max', r'gluteus maximus'), ('glute_med', r'gluteus medius'),
 ('quads', r'rectus femoris|vastus (lateralis|medialis)'), ('adductors', r'adductor (magnus|longus)|gracilis|pectineus'),
 ('hams', r'biceps femoris|semitendinosus|semimembranosus'), ('hip_other', r'tensor fasciae latae|sartorius'),
 ('calves', r'gastrocnemius|soleus'), ('shin', r'tibialis anterior|fibularis longus|extensor digitorum longus'),
 ('neck', r'sternocleidomastoid|splenius capitis|levator scapulae'),
]
GIDS = [g for g, _ in MRULES]
mus = bpy.data.collections['4: Muscular system']
mp, ml = [], []
for o in list(mus.all_objects):
    if o.type != 'MESH' or len(o.data.polygons) == 0: continue
    n = base(o.name).lower().strip('() ')
    if re.search(r'fascia|sheath|aponeurosis|tendon of|ligament', n): continue
    g = next((g for g, rx in MRULES if re.search(rx, n)), None)
    if not g: continue
    P, _ = world_arrays(o); P = P[::max(1, len(P) // 1500)]
    mp.append(P); ml += [GIDS.index(g)] * len(P)
MP = np.vstack(mp); kdm = kd_of(MP)
COLS = np.zeros((len(V), 4)); COLS[:, 3] = 1
for i, v in enumerate(V):
    co, j, d = kdm.find(v.tolist())
    COLS[i, 0] = (ml[j] + 1) / 64.0
    COLS[i, 1] = max(0.0, min(1.0, 1 - (d - .012) / .03))
# mani e piedi restano color pelle: i tendini dei muscoli dell'avambraccio e della gamba non devono colorarli
hk, fk = KINDS.index('hand'), KINDS.index('foot')
COLS[(lab[:, 0] == hk) | (lab[:, 0] == fk), 0:2] = 0
# pantaloncini: bacino e parte alta delle cosce
th = KINDS.index('thigh'); pel = KINDS.index('pelvis'); ab = KINDS.index('abdomen')
for i, v in enumerate(V):
    k = lab[i, 0]; s = 'lrc'[lab[i, 1]] if lab[i, 1] < 2 else 'l'
    hipz, knz = J['hip.' + s][2], J['knee.' + s][2]
    # pantaloncini per altezza: dalla vita a meta' coscia, su busto, bacino e cosce (mai su braccia e mani)
    if KINDS[k] not in ('hand', 'wrist', 'forearm', 'elbow', 'arm') and knz + .64 * (hipz - knz) < v[2] < J['pelvis'][2] + .085: COLS[i, 2] = 1
print('shorts verts', int(COLS[:, 2].sum()))
json.dump(GIDS, open(OUT + '.groups.json', 'w'))

created = []
def make_obj(name, V, T, Wm, color, cols=None):
    me = bpy.data.meshes.new(name); me.from_pydata(V.tolist(), [], T.tolist()); me.update()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    vg = [ob.vertex_groups.new(name=b) for b in ALLB]
    bm = bmesh.new(); bm.from_mesh(me); lay = bm.verts.layers.deform.verify(); bm.verts.ensure_lookup_table()
    for i, v in enumerate(bm.verts):
        for j in np.nonzero(Wm[i])[0]: v[lay][vg[j].index] = float(Wm[i, j])
    bm.to_mesh(me); bm.free()
    if cols is not None:
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT'); ca.data.foreach_set('color', cols.astype(np.float32).ravel())
        me.color_attributes.active_color = ca
    mat = bpy.data.materials.new('mat_' + name); mat.use_nodes = True
    mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = color
    ob.data.materials.append(mat); created.append(ob)
make_obj('skin', V, T, W, (.85, .84, .82, 1), COLS)

# pantaloncini come capo vero, generati da anelli lisci attorno a bacino e cosce (non copiano le forme sotto)
def build_shorts():
    hz, knz = J['pelvis'][2], J['knee.l'][2]
    top, crotch, bottom = hz + .07, hz - .085, knz + .64 * (J['hip.l'][2] - knz)
    kindsOK = np.array([KINDS[k] not in ('hand', 'wrist', 'forearm', 'elbow', 'arm') for k in lab[:, 0]])
    def ring(P, cx, cy, n=48, pad=.009, skipFront=False):
        ang = np.arctan2(P[:, 1] - cy, P[:, 0] - cx); r = np.hypot(P[:, 0] - cx, P[:, 1] - cy)
        if skipFront:                       # davanti al cavallo: ignora la zona centrale, il contorno si interpola dai lati
            keep = ~((np.abs(P[:, 0]) < .085) & (P[:, 1] < cy)); ang, r = ang[keep], r[keep]
        out = np.full(n, np.nan)
        for i in range(n):
            a = -np.pi + 2 * np.pi * i / n; d = np.abs(np.angle(np.exp(1j * (ang - a)))); sel = d < np.pi / n * 1.7
            if sel.any(): out[i] = r[sel].max()
        idx = np.arange(n); good = ~np.isnan(out)
        out = np.interp(idx, np.concatenate([idx[good] - n, idx[good], idx[good] + n]), np.tile(out[good], 3))
        for _ in range(4): out = (np.roll(out, 1) + 2 * out + np.roll(out, -1)) / 4
        return [(cx + (rr + pad) * np.cos(-np.pi + 2 * np.pi * i / n), cy + (rr + pad) * np.sin(-np.pi + 2 * np.pi * i / n)) for i, rr in enumerate(out)]
    verts, faces, rings = [], [], []
    def add_ring(pts, z):
        i0 = len(verts); verts.extend([(x, y, z) for x, y in pts]); return i0
    def loft(a, b, n=48):
        for i in range(n): j = (i + 1) % n; faces.append((a + i, a + j, b + j, b + i))
    # bacino: un solo anello attorno a tutte e due le cosce, dalla vita al cavallo
    prev = None
    for z in np.linspace(top, crotch, 8):
        sel = kindsOK & (np.abs(V[:, 2] - z) < .012)
        P = V[sel]; cx, cy = 0.0, float(np.median(P[:, 1]))
        i0 = add_ring(ring(P, cx, cy, skipFront=z < hz + .03), z)
        if prev is not None: loft(prev, i0)
        prev = i0
    c = len(verts); verts.append((0.0, float(np.mean([v[1] for v in verts[prev:prev + 48]])), crotch - .005))
    for i in range(48): faces.append((prev + i, prev + (i + 1) % 48, c)[::-1])
    # gambe: un anello per coscia dal cavallo a meta' coscia
    for sg in (1, -1):
        prev = None
        for z in np.linspace(crotch + .035, bottom, 6):
            sel = kindsOK & (np.abs(V[:, 2] - z) < .012) & (V[:, 0] * sg > .005)
            P = V[sel]; cx, cy = float(np.median(P[:, 0])), float(np.median(P[:, 1]))
            i0 = add_ring(ring(P, cx, cy, pad=.008), z)
            if prev is not None: loft(prev, i0)
            prev = i0
    SVv = np.array(verts)
    me = bpy.data.meshes.new('shorts'); me.from_pydata(SVv.tolist(), [], faces); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    me.calc_loop_triangles(); TT = np.empty(len(me.loop_triangles) * 3, dtype=np.int64); me.loop_triangles.foreach_get('vertices', TT)
    VV = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', VV); VV = VV.reshape(-1, 3); bpy.data.meshes.remove(me)
    names = ['root', 'spine1', 'thigh.l', 'thigh.r']
    Wn = seg_weights(VV, names); WW = np.zeros((len(VV), len(ALLB)))
    for j, n in enumerate(names): WW[:, ALLB.index(n)] = Wn[:, j]
    make_obj('shorts', VV, TT.reshape(-1, 3), WW, (.16, .17, .19, 1))
    print('shorts garment', len(VV), 'verts')
build_shorts()


# capelli e sopracciglia
HV, HT, _ = merged(hair_objs, labels=False)
HW = np.zeros((len(HV), len(ALLB))); HW[:, ALLB.index('head')] = 1
make_obj('hair', HV, HT, HW, (.18, .14, .12, 1))

# occhi: bianco (segmento posteriore + cornea) e iride scura
def objs_named(*prefix): return [o for o in bpy.data.objects if o.type == 'MESH' and len(o.data.polygons) and any(o.name.startswith(x + '.') for x in prefix)]
for name, pre, col in (('eyew', ('Posterior segment of eyeball', 'Cornea'), (.93, .92, .9, 1)), ('eyed', ('Iris',), (.12, .1, .09, 1))):
    EV, ET, _ = merged(objs_named(*pre), labels=False)
    EW = np.zeros((len(EV), len(ALLB))); EW[:, ALLB.index('head')] = 1
    make_obj(name, EV, ET, EW, col)

# ---------- armatura ed export ----------
ad = bpy.data.armatures.new('rig'); arm = bpy.data.objects.new('rig', ad); bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
for o in bpy.data.objects: o.select_set(False)
arm.select_set(True); bpy.ops.object.mode_set(mode='EDIT'); eb = {}
for name, par, h, t in BONES:
    e = ad.edit_bones.new(name); e.head = Vector(J[h].tolist()); e.tail = Vector(J[t].tolist()); eb[name] = e
for name, par, h, t in BONES:
    if par: eb[name].parent = eb[par]
bpy.ops.object.mode_set(mode='OBJECT')
for ob in created:
    ob.parent = arm; m = ob.modifiers.new('Armature', 'ARMATURE'); m.object = arm
for o in bpy.data.objects: o.select_set(False)
arm.select_set(True)
for ob in created: ob.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=False,
    export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
    export_draco_position_quantization=13, export_draco_normal_quantization=9, export_draco_color_quantization=10,
    export_skins=True, export_animations=False, export_yup=True, export_normals=True, export_texcoords=False,
    export_vertex_color='ACTIVE', export_materials='EXPORT', export_cameras=False, export_lights=False)
print('EXPORTED', OUT)
