"""TABULA anime environment set: the foliage, ground cover and sky props of the isles.

Run inside Blender (via Blender MCP), with this folder on sys.path:

    import anime_env as E; E.build('tree_round')     # or E.build_all()

These follow the anime open-world look: foliage is built as clumps whose normals point away from
the canopy centre, so the whole crown shades as one soft volume under the game's cel ramp (lighter
on top, cooler underneath) while its silhouette stays lumpy and leafy; grass and petals face up so
they light like the ground they grow from; clouds are cauliflower cumulus with flat, shaded bases.

Gradients are painted into a vertex colour ('Col', linear) that multiplies the material colour in
the game, so per-isle retinting (leaf, grass, petal...) keeps the painted light and shade.
Each prop exports like props.py: root '<name>', mesh '<name>:mesh', materials '<name>.<role>'.
"""

import math
import random

import bmesh
import bpy
from mathutils import Vector as V
from mathutils import noise

import tabula_lib as L
from props import Prop, lathe

# ---------------------------------------------------------------------------------------------
# painted attributes: vertex colour and custom (canopy) normals survive the join as attributes


def _attr(o, name, kind, domain='POINT'):
    a = o.data.attributes.get(name)
    if a is None:
        a = o.data.attributes.new(name, kind, domain)
    return a


def paint(o, fn):
    """Vertex colour from fn(co, normal) -> (r, g, b) in linear [0, 1]."""
    a = _attr(o, 'Col', 'FLOAT_COLOR')
    for v in o.data.vertices:
        r, g, b = fn(v.co, v.normal)
        a.data[v.index].color = (r, g, b, 1.0)
    return o


def aim_normals(o, fn):
    """Custom shading normal from fn(co, normal) -> Vector; applied after the prop is joined."""
    a = _attr(o, 'cnorm', 'FLOAT_VECTOR')
    for v in o.data.vertices:
        a.data[v.index].vector = fn(v.co, v.normal).normalized()
    return o


def _ensure_attrs(o):
    if o.type != 'MESH':
        return
    if o.data.attributes.get('Col') is None:
        paint(o, lambda c, n: (1.0, 1.0, 1.0))
    if o.data.attributes.get('cnorm') is None:
        aim_normals(o, lambda c, n: V(n))


def _apply_cnorm(o):
    me = o.data
    a = me.attributes.get('cnorm')
    if a is None:
        return
    vecs = [tuple(d.vector) for d in a.data]
    me.normals_split_custom_set_from_vertices(vecs)
    me.attributes.remove(me.attributes['cnorm'])
    me.color_attributes.active_color = me.color_attributes['Col']
    try:
        me.color_attributes.render_color_index = me.color_attributes.active_color_index
    except AttributeError:
        pass


def finish(P, export=True):
    """Prop.finish with painted vertex colours and custom normals carried through the export."""
    for o in P.parts:
        _ensure_attrs(o)
    for _, objs in P.nodes.values():
        for o in objs:
            _ensure_attrs(o)
    main = P._join(P.parts, f'{P.name}:mesh') if P.parts else None
    if main:
        _apply_cnorm(main)
    root = L.pivot(P.name, (0, 0, 0))
    root.name = P.name
    if main:
        L.attach(main, root)
    for k, (loc, objs) in P.nodes.items():
        j = P._join(objs, f'{P.name}:{k}.mesh') if objs else None
        pv = L.pivot(f'{P.name}:{k}', loc, root)
        if j:
            _apply_cnorm(j)
            L.attach(j, pv)
    tris = L.stats(root)
    out = L.export_glb(root, f'{P.name}.glb', vcol=True) if export else None
    return root, tris, out


# ---------------------------------------------------------------------------------------------
# shapes


def smooth01(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def ico(name, center, radii, *, subdiv=2, mat=None):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    rx, ry, rz = radii
    for v in bm.verts:
        v.co = V((v.co.x * rx, v.co.y * ry, v.co.z * rz)) + V(center)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    L.link(o)
    for p in me.polygons:
        p.use_smooth = True
    if mat is not None:
        L.set_mat(o, mat)
    return o


def cauliflower(o, center, amp, scale, seed=0, flat_below=None):
    """Rounded bumps (inverted cellular noise) pushed out from center: leafy clumps and cumulus."""
    off = V((seed * 13.7, seed * 7.3, seed * 3.1))
    c = V(center)
    for v in o.data.vertices:
        d = (v.co - c)
        dn = d.normalized() if d.length > 1e-6 else V((0, 0, 1))
        p = v.co * scale + off
        f = noise.voronoi(p)[0]
        bump = 1.0 - min(1.0, f[0] * 1.15)
        bump = bump * 0.75 + 0.25 * (noise.noise(p * 0.5) * 0.5 + 0.5)
        v.co = v.co + dn * bump * amp
        if flat_below is not None and v.co.z < flat_below:
            v.co.z = flat_below + (v.co.z - flat_below) * 0.12
    o.data.update()
    return o


def blade(name, base, height, width, lean, yaw, mat, segs=3):
    """A tapered, curving grass blade: a strip of quads ending in a point (two-sided in game)."""
    verts, faces = [], []
    side = V((math.cos(yaw + math.pi / 2), math.sin(yaw + math.pi / 2), 0))
    fwd = V((math.cos(yaw), math.sin(yaw), 0))
    for i in range(segs + 1):
        t = i / segs
        w = width * (1 - t) ** 0.9 * 0.5
        p = V(base) + V((0, 0, height * t)) + fwd * lean * t * t
        if i < segs:
            verts += [p - side * w, p + side * w]
        else:
            verts.append(p)
    for i in range(segs - 1):
        a = i * 2
        faces.append((a, a + 1, a + 3, a + 2))
    k = (segs - 1) * 2
    faces.append((k, k + 1, k + 2))
    return L._mesh_obj(name, verts, faces, m=mat)


# ---------------------------------------------------------------------------------------------
# foliage


def _canopy(P, leaf, clumps, center, seed, *, amp=0.12, scale=3.2, light=(1.0, 1.0, 0.86), dark=(0.3, 0.42, 0.52),
            normal_k=0.78, subdiv=2, fringe=26):
    """Leaf clumps that shade as one crown: radial normals, a painted top-light / under-shade."""
    c0 = V(center)
    lo = min(c[2] - r[2] for c, r in clumps)
    hi = max(c[2] + r[2] for c, r in clumps)
    for i, (c, r) in enumerate(clumps):
        o = ico('clump', c, r, subdiv=subdiv, mat=leaf)
        cauliflower(o, c, amp * max(r), scale / max(r) * 0.6, seed=seed + i)
        R = max(max(r) for _, r in clumps) * 1.6

        def col(co, n, c=V(c)):
            h = smooth01((co.z - lo) / max(1e-3, hi - lo))
            out = smooth01(((co - c0).length / R))
            k = smooth01(-0.05 + 0.85 * h + 0.3 * out + 0.1 * n.z)
            return tuple(dark[j] + (light[j] - dark[j]) * k for j in range(3))

        paint(o, col)
        aim_normals(o, lambda co, n: (co - c0).normalized() * normal_k + V(n) * (1 - normal_k))
        P.add(o)
        if fringe:
            leaves = _fringe(o, leaf, c, fringe, seed + i * 7)
            if leaves:
                paint(leaves, col)
                aim_normals(leaves, lambda co, n: (co - c0).normalized())
                P.add(leaves)


def _fringe(o, mat, center, count, seed):
    """Pointed leaves standing out of a clump's surface, so its edge reads leafy, not puffy."""
    rnd = random.Random(seed)
    vs = list(o.data.vertices)
    verts, faces = [], []
    c = V(center)
    for _ in range(count):
        v = vs[rnd.randrange(len(vs))]
        if v.co.z < c.z - 0.6 * (v.co - c).length:
            continue  # not under the crown
        n = (v.co - c).normalized()
        t = n.cross(V((0, 0, 1)))
        t = t.normalized() if t.length > 1e-4 else V((1, 0, 0))
        t = (t * math.cos(rnd.uniform(-0.8, 0.8)) + n.cross(t) * math.sin(rnd.uniform(-0.8, 0.8))).normalized()
        ln = rnd.uniform(0.13, 0.22)
        w = ln * 0.38
        base = v.co - n * 0.04
        tip = v.co + n * ln + V((0, 0, -0.03))
        mid = (base + tip) / 2
        k = len(verts)
        quad = [base, mid + t * w, tip, mid - t * w]
        verts += quad + [q + n * 0.004 for q in quad]  # a back face of its own (validate drops twins)
        faces += [(k, k + 1, k + 2, k + 3), (k + 4, k + 7, k + 6, k + 5)]
    if not faces:
        return None
    return L._mesh_obj('leaves', verts, faces, m=mat)


def build_tree_round(export=True):
    """A broadleaf tree ~3.6 m tall: a gently bent trunk with flared roots, three limbs, and a
    big round crown of leaf clumps."""
    P = Prop('tree_round')
    trunk = P.m('trunk', '#6B4632')
    leaf = P.m('leaf', '#5FAE5C')
    pts = L.spline([V((0, 0, -0.05)), V((0.03, 0, 0.7)), V((-0.05, 0.02, 1.35)), V((0.04, 0.0, 1.9))], steps=3)
    P.add(L.tube('trunk', pts, [(0, 0.2), (0.1, 0.15), (0.6, 0.12), (1, 0.08)], n=10, mat=trunk, subd=0))
    for k in range(5):
        a = k * math.tau / 5 + 0.3
        d = V((math.cos(a), math.sin(a), 0))
        P.add(L.tube('root', [V((0, 0, 0.3)) + d * 0.04, d * 0.2 + V((0, 0, 0.06)), d * 0.38 + V((0, 0, -0.05))],
                     [(0, 0.08), (1, 0.025)], n=6, mat=trunk, subd=0))
    for a, z, ln in ((0.6, 1.45, 0.75), (2.7, 1.6, 0.7), (4.6, 1.5, 0.65)):
        d = V((math.cos(a), math.sin(a), 0))
        P.add(L.tube('limb', [V((0, 0, z)), d * ln * 0.5 + V((0, 0, z + 0.35)), d * ln + V((0, 0, z + 0.75))],
                     [(0, 0.07), (1, 0.03)], n=6, mat=trunk, subd=0))
    rnd = random.Random(11)
    clumps = [((0.0, 0.0, 2.55), (1.05, 1.0, 0.82)), ((0.05, 0.1, 3.15), (0.7, 0.68, 0.55))]
    for k in range(7):
        a = k * math.tau / 7 + rnd.uniform(-0.2, 0.2)
        r = rnd.uniform(0.75, 0.95)
        z = 2.3 + rnd.uniform(-0.15, 0.35)
        s = rnd.uniform(0.5, 0.66)
        clumps.append(((math.cos(a) * r, math.sin(a) * r, z), (s, s, s * 0.82)))
    for k in range(4):
        a = k * math.tau / 4 + 0.8
        clumps.append(((math.cos(a) * 0.5, math.sin(a) * 0.5, 2.95), (0.5, 0.5, 0.42)))
    _canopy(P, leaf, clumps, (0, 0, 2.45), 3)
    return finish(P, export)


def build_tree_pine(export=True):
    """A conifer ~4 m tall: five drooping, scalloped tiers that shade as one cone."""
    P = Prop('tree_pine')
    trunk = P.m('trunk', '#5B4636')
    leaf = P.m('leaf', '#2E6B4A')
    P.add(L.tube('trunk', [V((0, 0, -0.05)), V((0, 0, 1.6))], [(0, 0.17), (0.15, 0.13), (1, 0.09)], n=8, mat=trunk,
                 subd=0))
    tiers = [(0.8, 1.85, 1.08), (1.35, 2.4, 0.92), (1.9, 2.95, 0.76), (2.45, 3.5, 0.58), (3.0, 4.15, 0.4)]
    axis_c = V((0, 0, 2.2))
    for i, (z0, z1, R) in enumerate(tiers):
        k = 11 - i
        ph = i * 0.41

        def skirt(t, R=R, k=k, ph=ph, z0=z0):
            s = 0.5 + 0.5 * math.cos(k * (t + ph))
            return R * (1 + 0.13 * s), z0 - 0.16 * s

        rings = [
            (0.0, z1),
            (R * 0.3, z1 - (z1 - z0) * 0.3),
            (lambda t, R=R, k=k, ph=ph, z0=z0, z1=z1: (R * 0.7 * (1 + 0.05 * math.cos(k * (t + ph))), z0 + (z1 - z0) * 0.32)),
            skirt,
            (lambda t, R=R, k=k, ph=ph, z0=z0: (R * 0.8 * (1 + 0.1 * math.cos(k * (t + ph))), z0 - 0.06)),
            (0.12, z0 + 0.15),
        ]
        o = lathe('tier', rings, n=44, mat=leaf)
        lo, hi = z0 - 0.2, z1

        def col(co, n, lo=lo, hi=hi):
            h = smooth01((co.z - lo) / (hi - lo))
            under = 1.0 if n.z < -0.2 else 0.0
            kk = smooth01(0.25 + 0.75 * h) * (1 - 0.55 * under)
            dark, light = (0.4, 0.5, 0.6), (1.0, 1.0, 0.9)
            return tuple(dark[j] + (light[j] - dark[j]) * kk for j in range(3))

        paint(o, col)
        aim_normals(o, lambda co, n: (V((co.x, co.y, (co.z - axis_c.z) * 0.45))).normalized() * 0.6 + V(n) * 0.4
                    if n.z > -0.2 else V(n))
        P.add(o)
    return finish(P, export)


def build_bush(export=True):
    """A round shrub ~0.9 m tall with a few blossoms; leaf and petal are retinted per instance."""
    P = Prop('bush')
    leaf = P.m('leaf', '#5FAE5C')
    petal = P.m('petal', '#FFB7D2')
    rnd = random.Random(5)
    clumps = [((0, 0, 0.42), (0.55, 0.52, 0.42))]
    for k in range(5):
        a = k * math.tau / 5 + rnd.uniform(-0.3, 0.3)
        clumps.append(((math.cos(a) * 0.38, math.sin(a) * 0.38, 0.3 + rnd.uniform(-0.05, 0.08)),
                       (0.36, 0.36, 0.3)))
    _canopy(P, leaf, clumps, (0, 0, 0.3), 21, amp=0.1, scale=3.0)
    for k in range(9):
        a = rnd.uniform(0, math.tau)
        el = rnd.uniform(0.15, 1.1)
        r = 0.62
        p = V((math.cos(a) * math.cos(el) * r, math.sin(a) * math.cos(el) * r, 0.32 + math.sin(el) * 0.45))
        b = L.blob('bloom', p, (0.06, 0.06, 0.045), mat=petal, segs=(8, 5))
        paint(b, lambda c, n: (1.0, 1.0, 1.0))
        P.add(b)
    return finish(P, export)


def build_grass(export=True):
    """A tuft of ~14 blades, 0.3-0.5 m: dark at the root, sunlit at the tips; normals face up."""
    P = Prop('grass')
    g = P.m('grass', '#7CC66A')
    rnd = random.Random(2)
    for i in range(14):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(0.0, 0.16)
        base = (math.cos(a) * r, math.sin(a) * r, -0.02)
        h = rnd.uniform(0.26, 0.5)
        o = blade('blade', base, h, rnd.uniform(0.05, 0.08), rnd.uniform(0.06, 0.2), a + rnd.uniform(-0.6, 0.6), g)
        paint(o, lambda c, n, h=h: tuple(x + (y - x) * smooth01(c.z / h) for x, y in zip((0.5, 0.6, 0.55),
                                                                                         (1.0, 1.0, 0.82))))
        aim_normals(o, lambda c, n: V((0, 0, 1)))
        P.add(o)
    return finish(P, export)


def build_flowers(export=True):
    """A clump of five-petal blossoms on short stems, faces up; 'petal' is retinted per instance."""
    P = Prop('flowers')
    stem = P.m('stem', '#5FA866')
    petal = P.m('petal', '#FFFFFF')
    eye = P.m('eye', '#FFD25A')
    rnd = random.Random(4)
    for i in range(6):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(0.0, 0.2)
        x, y = math.cos(a) * r, math.sin(a) * r
        h = rnd.uniform(0.14, 0.3)
        top = V((x, y, h))
        s = L.tube('stem', [V((x, y, -0.02)), top], 0.01, n=5, mat=stem, subd=0)
        aim_normals(s, lambda c, n: V((0, 0, 1)))
        P.add(s)
        for k in range(3):
            o = blade('leaf', (x, y, 0.0), h * 0.45, 0.05, 0.08, rnd.uniform(0, math.tau), stem, segs=2)
            aim_normals(o, lambda c, n: V((0, 0, 1)))
            P.add(o)
        # petals: five flattened teardrops around a domed centre
        rot = rnd.uniform(0, math.tau)
        sz = rnd.uniform(0.045, 0.06)
        for k in range(5):
            t = rot + k * math.tau / 5
            d = V((math.cos(t), math.sin(t), 0.25)).normalized()
            pc = top + d * sz * 0.9
            pt = L.blob('petal', pc, (sz * 0.75, sz * 0.75, sz * 0.18), mat=petal, segs=(8, 4))
            # stretch outward along d
            for v in pt.data.vertices:
                rel = v.co - pc
                along = rel.dot(V((d.x, d.y, 0)).normalized())
                v.co += V((d.x, d.y, 0)).normalized() * along * 0.5
            pt.data.update()
            paint(pt, lambda c, n, top=top: (1.0, 1.0, 1.0) if (c - top).length > sz * 0.5 else (0.85, 0.85, 0.9))
            aim_normals(pt, lambda c, n: V((0, 0, 1)))
            P.add(pt)
        P.add(L.blob('eye', top + V((0, 0, 0.012)), (sz * 0.38, sz * 0.38, sz * 0.25), mat=eye, segs=(8, 5)))
    return finish(P, export)


# ---------------------------------------------------------------------------------------------
# sky


def _cumulus(P, mat, puffs, seed, *, voxel=0.12, base_z=0.0, amp=0.18, scale=1.4):
    """Union a set of puffs into one cauliflower cumulus with a flat, shaded base."""
    objs = []
    for i, (c, r) in enumerate(puffs):
        o = ico('puff', c, r, subdiv=3)
        objs.append(o)
    j = L.join(objs, 'cloud')
    mod = j.modifiers.new('remesh', 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = voxel
    L.apply_mods(j)
    sm = j.modifiers.new('smooth', 'SMOOTH')
    sm.iterations = 6
    sm.factor = 0.8
    L.apply_mods(j)
    ctr = sum((V(c) for c, _ in puffs), V()) / len(puffs)
    cauliflower(j, ctr, amp, scale, seed=seed, flat_below=base_z)
    dec = j.modifiers.new('dec', 'DECIMATE')
    dec.ratio = 0.35
    L.apply_mods(j)
    L.set_mat(j, mat)
    for p in j.data.polygons:
        p.use_smooth = True
    zs = [v.co.z for v in j.data.vertices]
    lo, hi = min(zs), max(zs)

    def col(co, n):
        h = smooth01((co.z - lo) / max(1e-3, hi - lo) * 1.4)
        k = smooth01(0.1 + 0.9 * h) * (0.75 + 0.25 * max(0.0, n.z))
        dark, light = (0.62, 0.66, 0.86), (1.0, 1.0, 1.0)
        return tuple(dark[q] + (light[q] - dark[q]) * k for q in range(3))

    paint(j, col)
    aim_normals(j, lambda co, n: (co - ctr).normalized() * 0.55 + V(n) * 0.45)
    P.add(j)
    return j


def build_cloud(export=True):
    """A big cumulus ~14 m wide and ~6 m tall (the game scales it further)."""
    P = Prop('cloud')
    mat = P.m('cloud', '#FFFFFF')
    rnd = random.Random(8)
    puffs = [((0, 0, 1.6), (3.0, 2.4, 2.0)), ((2.6, 0.3, 1.2), (2.2, 1.9, 1.5)), ((-2.8, -0.2, 1.1), (2.3, 2.0, 1.4)),
             ((0.8, 0.2, 3.2), (1.9, 1.7, 1.7)), ((-1.0, -0.3, 2.9), (1.6, 1.5, 1.5)), ((4.8, 0.0, 0.8), (1.5, 1.4, 1.0)),
             ((-5.0, 0.2, 0.7), (1.4, 1.3, 0.9)), ((0.2, 0.1, 4.4), (1.1, 1.0, 1.0))]
    for k in range(8):
        a = rnd.uniform(0, math.tau)
        puffs.append(((math.cos(a) * rnd.uniform(1.5, 4.0), math.sin(a) * rnd.uniform(0.8, 1.6),
                       rnd.uniform(1.4, 3.2)), (rnd.uniform(0.8, 1.3),) * 3))
    _cumulus(P, mat, puffs, 3, voxel=0.16, base_z=0.15, amp=0.45, scale=0.9)
    return finish(P, export)


def build_cloud_sea(export=True):
    """The Blank seen from the isles: an annulus of cloud tops, radius ~40 to ~260 m, top near z=0.

    Each puff is a flattened cauliflower dome; they overlap so only their tops show from above."""
    P = Prop('cloud_sea')
    mat = P.m('cloud', '#FFFFFF')
    rnd = random.Random(31)
    n = 0
    for ring, (r0, r1, count, size) in enumerate(((40, 90, 46, (9, 15)), (85, 160, 64, (14, 24)),
                                                  (150, 260, 70, (22, 38)))):
        for i in range(count):
            a = rnd.uniform(0, math.tau)
            r = math.sqrt(rnd.uniform(r0 * r0, r1 * r1))
            s = rnd.uniform(*size)
            c = V((math.cos(a) * r, math.sin(a) * r, rnd.uniform(-3.0, 1.5)))
            o = ico('puff', c, (s, s * rnd.uniform(0.7, 1.0), s * rnd.uniform(0.3, 0.45)), subdiv=3 if ring == 0 else 2)
            cauliflower(o, c, s * 0.16, 0.9 / s * 3.0, seed=n, flat_below=c.z - s * 0.1)
            # keep only the upper half: the sea is seen from above
            bm = bmesh.new()
            bm.from_mesh(o.data)
            gone = [v for v in bm.verts if v.co.z < c.z - s * 0.12]
            bmesh.ops.delete(bm, geom=gone, context='VERTS')
            bm.to_mesh(o.data)
            bm.free()
            hi = c.z + s * 0.45

            def col(co, nn, c=c, hi=hi):
                h = smooth01((co.z - c.z) / max(1e-3, hi - c.z))
                k = smooth01(0.2 + 0.8 * h)
                dark, light = (0.66, 0.7, 0.88), (1.0, 1.0, 1.0)
                return tuple(dark[q] + (light[q] - dark[q]) * k for q in range(3))

            paint(o, col)
            aim_normals(o, lambda co, nn, c=c: (co - c).normalized() * 0.5 + V(nn) * 0.5)
            L.set_mat(o, mat)
            P.add(o)
            n += 1
    return finish(P, export)


# ---------------------------------------------------------------------------------------------
# isles


def build_island(export=True):
    """props.build_island with a dense, painted top and shaded cliffs.

    The top keeps z = 0 (the game walks on it) but gets ~40 rings so it can carry painted grass:
    sunny yellow-green drifts, cooler patches and a darker band at the lip. Cliffs darken and cool
    with depth, like light falling off under the isle."""
    import props as PR

    captured = {}
    orig = PR.Prop.finish

    def grab(self, export=True):
        captured['P'] = self
        return None, 0, None

    PR.Prop.finish = grab
    try:
        PR.build_island(export=False)
    finally:
        PR.Prop.finish = orig
    P = captured['P']
    top, top_d = P.mats['top'], P.mats['top_d']

    def wob(t, k=1.0):
        return 1 + k * (0.006 * math.sin(5 * t + 0.7) + 0.004 * math.sin(13 * t + 2.1))

    def drip(t):
        s_ = max(0.0, math.sin(9 * t + 1.4 * math.sin(3 * t)))
        return 0.03 * s_ ** 3

    old = next(o for o in P.parts if o.name.startswith('grass'))
    P.parts.remove(old)
    bpy.data.objects.remove(old, do_unlink=True)
    rings = [(lambda t, k=k: (0.975 * wob(t, 0.3) * k, 0.0)) for k in [i / 40 for i in range(41)]]
    lip = [
        lambda t: (0.995 * wob(t), -0.006),
        lambda t: (1.006 * wob(t), -0.018),
        lambda t: (1.006 * wob(t), -0.034 - drip(t) * 0.6),
        lambda t: (0.996 * wob(t), -0.046 - drip(t)),
        lambda t: (0.978 * wob(t), -0.05 - drip(t) * 0.9),
    ]
    grass = lathe('grass', rings + lip, n=128, mats=[top, top_d], row_mats=[0] * 40 + [0, 0, 0, 1, 1])
    P.parts.insert(0, grass)

    def ground(co, n):
        if co.z < -0.0005 or n.z < 0.5:
            return None
        p = V((co.x * 3.2, co.y * 3.2, 0.0))
        a = noise.noise(p) * 0.6 + noise.noise(p * 2.7 + V((5.1, 1.3, 0))) * 0.4
        b = noise.noise(p * 1.6 + V((9.7, 4.4, 0)))
        r = (co.x * co.x + co.y * co.y) ** 0.5
        sunny = smooth01((a - 0.05) * 3.0)
        cool = smooth01((-b - 0.15) * 3.0)
        base = (0.9, 0.93, 0.9)
        warm = (1.0, 1.0, 0.8)
        shade = (0.72, 0.82, 0.8)
        c = [base[i] + (warm[i] - base[i]) * sunny for i in range(3)]
        c = [c[i] + (shade[i] - c[i]) * cool * 0.8 for i in range(3)]
        edge = smooth01((r - 0.86) / 0.12)
        return tuple(c[i] * (1 - 0.12 * edge) for i in range(3))

    def cliff(co, n):
        depth = smooth01(-co.z / 0.9)
        k = 1.0 - 0.5 * depth
        cool = (1.0 - 0.12 * depth, 1.0 - 0.08 * depth, 1.0)
        lit = 0.92 + 0.08 * max(0.0, n.z)
        return tuple(k * cool[i] * lit for i in range(3))

    for o in P.parts:
        paint(o, lambda co, n: ground(co, n) or cliff(co, n))
    return finish(P, export)


BUILDERS = {
    'island': build_island,
    'tree_round': build_tree_round,
    'tree_pine': build_tree_pine,
    'bush': build_bush,
    'grass': build_grass,
    'flowers': build_flowers,
    'cloud': build_cloud,
    'cloud_sea': build_cloud_sea,
}


def build(name, export=True):
    return BUILDERS[name](export)


def build_all(export=True, names=None):
    out = {}
    for n in names or BUILDERS:
        r = build(n, export)
        out[n] = (r[1], r[2][1] if r[2] else None)
    return out
