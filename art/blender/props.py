"""TABULA world props: the isles of Scriptoria, rebuilt as soft, cel-shade-friendly models.

Run inside Blender (via Blender MCP):

    import props as P; P.build('tree_round')      # or P.build_all()

Each prop exports to public/models/<name>.glb as a root node '<name>' holding one joined mesh
'<name>:mesh', plus child nodes '<name>:<node>' that the game moves (windmill blades, the tide
bell, the spire orb, an inkwell's glow...). Materials are named '<name>.<role>'. The game retints
some roles per instance (island top/soil/rock, leaf/trunk, wall/roof, glow...); a role ending in
'_d' is a darker shade of its base role and is retinted with it (see src/game/world/assets.ts).

Blender is Z-up and the game's forward (+Z) is Blender -Y, so fronts (doors, faces) sit at -Y.
"""

import math
import random

import bmesh
import bpy
from mathutils import Vector as V
from mathutils import noise

import tabula_lib as L
from tabula_lib import material, spline, tube

# ---------------------------------------------------------------------------------------------
# builder


class Prop:
    def __init__(self, name):
        self.name = name
        L.purge_default()
        L.fresh_collection(name)
        self.parts = []
        self.nodes = {}
        self.mats = {}
        self.flat = set()

    def m(self, role, color=None, *, flat=False, **kw):
        if role in self.mats and color is None:
            return self.mats[role]
        self.mats[role] = material(role, color, **kw)
        if flat:
            self.flat.add(self.mats[role].name)
        return self.mats[role]

    def glow(self, role, color, strength=2.0):
        return self.m(role, color, emit=color, strength=strength)

    def node(self, key, loc):
        self.nodes[key] = (V(loc), [])

    def add(self, *objs, node=None):
        tgt = self.parts if node is None else self.nodes[node][1]
        for o in objs:
            if o is not None:
                tgt.append(o)
        return objs[0] if objs else None

    def _join(self, objs, name):
        j = L.join(objs, name)
        if self.flat:
            me = j.data
            for p in me.polygons:
                if me.materials and me.materials[p.material_index].name in self.flat:
                    p.use_smooth = False
        return j

    def finish(self, export=True):
        # join first: a part may share the prop's name, and the root must get that name exactly
        main = self._join(self.parts, f'{self.name}:mesh') if self.parts else None
        joined = {k: (loc, self._join(objs, f'{self.name}:{k}.mesh') if objs else None)
                  for k, (loc, objs) in self.nodes.items()}
        root = L.pivot(self.name, (0, 0, 0))
        root.name = self.name
        if main:
            L.attach(main, root)
        for k, (loc, j) in joined.items():
            pv = L.pivot(f'{self.name}:{k}', loc, root)
            if j:
                L.attach(j, pv)
        tris = L.stats(root)
        out = L.export_glb(root, f'{self.name}.glb') if export else None
        return root, tris, out


# ---------------------------------------------------------------------------------------------
# shape helpers


def lathe(name, rings, *, n=48, mat=None, row_mats=None, mats=None, cap_top=False, cap_bot=False, phase=0.0):
    """Revolve rings (top to bottom) around Z. Each ring is (r, z) or f(theta) -> (r, z).

    row_mats: material index per row of quads (between ring i and i+1), into mats."""
    verts, faces, fmat = [], [], []
    R = len(rings)
    for rg in rings:
        for j in range(n):
            t = 2 * math.pi * j / n + phase
            r, z = rg(t) if callable(rg) else rg
            verts.append((math.cos(t) * r, math.sin(t) * r, z))
    for i in range(R - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            c, d = (i + 1) * n + (j + 1) % n, (i + 1) * n + j
            faces.append((a, d, c, b))
            fmat.append(row_mats[i] if row_mats else 0)
    if cap_top:
        z0 = sum(verts[j][2] for j in range(n)) / n
        ci = len(verts)
        verts.append((0, 0, z0))
        for j in range(n):
            faces.append((ci, j, (j + 1) % n))
            fmat.append(row_mats[0] if row_mats else 0)
    if cap_bot:
        base = (R - 1) * n
        z1 = sum(verts[base + j][2] for j in range(n)) / n
        ci = len(verts)
        verts.append((0, 0, z1))
        for j in range(n):
            faces.append((ci, base + (j + 1) % n, base + j))
            fmat.append(row_mats[-1] if row_mats else 0)
    o = L._mesh_obj(name, verts, faces)
    if mats:
        for m_ in mats:
            o.data.materials.append(m_)
        for p, mi in zip(o.data.polygons, fmat):
            p.material_index = mi
    elif mat is not None:
        L.set_mat(o, mat)
    L._fix_normals(o)
    return o


def move(o, d):
    from mathutils import Matrix

    o.data.transform(Matrix.Translation(V(d)))
    o.data.update()
    return o


def rot_z(o, deg, about=(0, 0, 0)):
    from mathutils import Matrix

    c = V(about)
    o.data.transform(Matrix.Translation(c) @ Matrix.Rotation(math.radians(deg), 4, 'Z') @ Matrix.Translation(-c))
    o.data.update()
    return o


def craggy(o, amp, scale, seed=0, up_bias=0.0):
    """Lumpy rock surface: displace along normals with layered noise."""
    off = V((seed * 17.3, seed * 9.1, seed * 4.7))
    for v in o.data.vertices:
        p = v.co * scale + off
        n = noise.noise(p) * 0.7 + noise.noise(p * 2.3) * 0.3
        v.co += v.normal * n * amp * (1 + up_bias * max(0.0, v.normal.z))
    o.data.update()
    return o


def by_normal(o, mats, fn):
    """Assign materials per face: fn(normal, center) -> index into mats."""
    o.data.materials.clear()
    for m_ in mats:
        o.data.materials.append(m_)
    for p in o.data.polygons:
        p.material_index = fn(p.normal, p.center)
    return o


def plank(name, a, b, w, t, mat, *, up=(0, 0, 1)):
    """A board from a to b, width w (across, perpendicular to up), thickness t (along up)."""
    a, b, up = V(a), V(b), V(up).normalized()
    d = b - a
    L_ = d.length
    x = d.normalized()
    y = up.cross(x).normalized()
    z = x.cross(y)
    from mathutils import Matrix

    o = L.box(name, (0, 0, 0), (L_, w, t), mat=mat, bevel=min(w, t) * 0.18, segs=1)
    M = Matrix((x, y, z)).transposed().to_4x4()
    M.translation = (a + b) / 2
    o.data.transform(M)
    o.data.update()
    return o


def extrude_outline(name, pts2d, depth, mat, *, bevel=0.0, segs=2, y=0.0):
    """A flat shape in the XZ plane (pts2d as (x, z)), extruded along +Y by depth, centred on y."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y - depth / 2, z)) for x, z in pts2d]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    for v in moved:
        v.co.y += depth
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    L.link(o)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = 'ANGLE'
        L.apply_mods(o)
    L.set_mat(o, mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def flowers(P, center, count, radius, seed=1, colors=('#FF9CC8', '#FFD98A', '#F7F5FF', '#FF7AB6')):
    rnd = random.Random(seed)
    stem = P.m('leafy', '#5FA866')
    for i in range(count):
        a = rnd.uniform(0, math.tau)
        r = radius * math.sqrt(rnd.random())
        p = V(center) + V((math.cos(a) * r, math.sin(a) * r, 0))
        col = colors[i % len(colors)]
        m = P.m('petal' + str(i % len(colors)), col)
        h = rnd.uniform(0.08, 0.16)
        P.add(tube('stem', [p, p + V((0, 0, h))], 0.008, n=5, mat=stem, subd=0))
        P.add(L.blob('bloom', p + V((0, 0, h + 0.02)), (0.04, 0.04, 0.025), mat=m, segs=(8, 5)))


# ---------------------------------------------------------------------------------------------
# isles


def build_island(export=True):
    """A floating isle of radius 1 (the game scales it by the isle radius); the top is z = 0."""
    P = Prop('island')
    top = P.m('top', '#8FD27A')
    top_d = P.m('top_d', '#5E9C5A')
    soil = P.m('soil', '#C89A6A')
    soil_d = P.m('soil_d', '#9A6E4A')
    rock = P.m('rock', '#8E89AE')
    rock_d = P.m('rock_d', '#625D86')
    crystal = P.glow('crystal', '#8FF3FF', 2.2)

    def wob(t, k=1.0):
        return 1 + k * (0.006 * math.sin(5 * t + 0.7) + 0.004 * math.sin(13 * t + 2.1))

    def drip(t):
        s = max(0.0, math.sin(9 * t + 1.4 * math.sin(3 * t)))
        return 0.03 * s ** 3

    # grass cap: a flat top, a rounded lip and grass that hangs over the edge in soft drips
    n = 128
    grass = lathe('grass', [
        (0.0, 0.0),
        (0.6, 0.0),
        lambda t: (0.975 * wob(t, 0.3), 0.0),
        lambda t: (0.995 * wob(t), -0.006),
        lambda t: (1.006 * wob(t), -0.018),
        lambda t: (1.006 * wob(t), -0.034 - drip(t) * 0.6),
        lambda t: (0.996 * wob(t), -0.046 - drip(t)),
        lambda t: (0.978 * wob(t), -0.05 - drip(t) * 0.9),
    ], n=n, mats=[top, top_d], row_mats=[0, 0, 0, 0, 0, 1, 1])
    P.add(grass)
    # soil band in two-tone strata
    rows = [(0.982, -0.03), (0.978, -0.07), (0.972, -0.075), (0.966, -0.11), (0.958, -0.116), (0.948, -0.16)]
    soil_rings = [lambda t, r=r, z=z: (r * wob(t, 1.4) * (1 + 0.006 * noise.noise(V((math.cos(t) * 4, math.sin(t) * 4, z * 20)))), z)
                  for r, z in rows]
    P.add(lathe('soil', soil_rings, n=96, mats=[soil, soil_d], row_mats=[0, 1, 0, 1, 0]))

    # the rock root: an inverted, craggy cone with a second smaller root beside it
    def root_rings(r0, z0, depth, k=24, seed=0, tipx=0.0, tipy=0.0):
        out = []
        for i in range(k + 1):
            u = i / k
            r = r0 * (1 - u ** 1.45) ** 0.95 * (1 - 0.1 * math.sin(u * math.pi))
            z = z0 - depth * u
            out.append(lambda t, r=r, z=z, u=u: (
                max(0.0, r * (1 + 0.16 * noise.noise(V((math.cos(t) * 2.5 + seed, math.sin(t) * 2.5, z * 5))))),
                z))
        return out

    body = lathe('rockroot', root_rings(0.95, -0.155, 0.85, k=16), n=44, mats=[rock, rock_d],
                 row_mats=[0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1])
    craggy(body, 0.025, 6.0, seed=1)
    P.add(body)
    side = lathe('rockroot2', root_rings(0.42, -0.14, 0.62, k=10, seed=5), n=24, mats=[rock, rock_d],
                 row_mats=[0] * 5 + [1] * 5)
    craggy(side, 0.02, 7.0, seed=4)
    move(side, (0.36, 0.22, 0))
    P.add(side)
    side2 = lathe('rockroot3', root_rings(0.3, -0.14, 0.45, k=8, seed=9), n=20, mats=[rock, rock_d],
                  row_mats=[0] * 4 + [1] * 4)
    move(side2, (-0.42, -0.3, 0))
    P.add(side2)
    # glowing crystals growing out of the underside
    rnd = random.Random(3)
    for k in range(5):
        a = rnd.uniform(0, math.tau)
        z = rnd.uniform(-0.3, -0.5)
        u = (-0.155 - z) / 0.85
        r = 0.95 * (1 - u ** 1.45) ** 0.95 * 0.9
        base = V((math.cos(a) * r, math.sin(a) * r, z))
        out = V((math.cos(a), math.sin(a), -0.6)).normalized()
        for s in range(3):
            d = (out + V((rnd.uniform(-0.4, 0.4), rnd.uniform(-0.4, 0.4), rnd.uniform(-0.3, 0.2)))).normalized()
            ln = rnd.uniform(0.06, 0.12)
            P.add(tube('crystal', [base, base + d * ln * 0.7, base + d * ln], [(0, 0.018), (0.7, 0.02), (1, 0.0)],
                       n=5, mat=crystal, subd=0, cap1=False))
    # roots and vines hanging from under the lip
    vine = top_d
    for k in range(14):
        a = k * math.tau / 14 + 0.21 * math.sin(k * 3.3)
        base = V((math.cos(a) * 0.985, math.sin(a) * 0.985, -0.045))
        ln = 0.06 + 0.06 * (0.5 + 0.5 * math.sin(k * 2.7))
        pts = [base, base + V((math.cos(a) * 0.008, math.sin(a) * 0.008, -ln * 0.5)),
               base + V((math.cos(a) * 0.004, math.sin(a) * 0.004, -ln))]
        P.add(tube('vine', spline(pts, steps=3), [(0, 0.005), (1, 0.002)], n=5, mat=vine, subd=0))
    # small floating rocks with their own grass caps
    for i in range(3):
        a = i * 2.3 + 0.6
        c = V((math.cos(a) * 1.13, math.sin(a) * 1.13, -0.14 - i * 0.065))
        s = 0.085 - i * 0.012
        rk = lathe('float', root_rings(s, 0.0, s * 1.6, k=5, seed=i + 2), n=12, mats=[rock, rock_d], row_mats=[0, 0, 0, 1, 1])
        move(rk, c)
        P.add(rk)
        cap = lathe('floatcap', [(0, 0.008), (s * 0.7, 0.008), (s * 1.06, 0.0), (s * 1.02, -0.008), (s * 0.95, -0.01)],
                    n=12, mats=[top, top_d], row_mats=[0, 0, 0, 1])
        move(cap, c)
        P.add(cap)
    return P.finish(export)


# ---------------------------------------------------------------------------------------------
# trees


def build_tree_round(export=True):
    """A broadleaf tree ~3 m tall: a bent trunk and a cloud of soft canopy puffs."""
    P = Prop('tree_round')
    trunk = P.m('trunk', '#6B4632')
    leaf = P.m('leaf', '#4F9A5C')
    leaf_d = P.m('leaf_d', '#356E48')
    pts = spline([V((0, 0, -0.05)), V((0.02, 0, 0.6)), V((-0.04, 0.02, 1.2)), V((0.05, 0, 1.75))], steps=3)
    P.add(tube('trunk', pts, [(0, 0.22), (0.12, 0.17), (0.6, 0.13), (1, 0.09)], n=10, mat=trunk, subd=0))
    for k in range(4):
        a = k * math.tau / 4 + 0.4
        d = V((math.cos(a), math.sin(a), 0))
        P.add(tube('rootflare', [V((0, 0, 0.25)) + d * 0.05, d * 0.22 + V((0, 0, 0.06)), d * 0.34 + V((0, 0, -0.04))],
                   [(0, 0.08), (1, 0.03)], n=6, mat=trunk, subd=0))
    for a, z in ((0.8, 1.2), (3.6, 1.35)):
        d = V((math.cos(a), math.sin(a), 0))
        P.add(tube('branch', [V((0, 0, z)), d * 0.35 + V((0, 0, z + 0.3)), d * 0.5 + V((0, 0, z + 0.5))],
                   [(0, 0.06), (1, 0.025)], n=6, mat=trunk, subd=0))
    puffs = [((0, 0, 2.0), (0.92, 0.88, 0.72)), ((0.1, 0.05, 2.5), (0.56, 0.54, 0.46))]
    for k in range(6):
        a = k * math.tau / 6 + 0.3
        r = 0.62 + 0.08 * math.sin(k * 2.1)
        z = 1.82 + 0.22 * math.sin(k * 1.7 + 0.5)
        s = 0.5 + 0.08 * math.cos(k * 1.3)
        puffs.append(((math.cos(a) * r, math.sin(a) * r, z), (s, s, s * 0.85)))
    for i, (c, rr) in enumerate(puffs):
        b = L.blob('puff', c, rr, segs=(12, 8))
        craggy(b, 0.04, 2.5, seed=i)
        by_normal(b, [leaf, leaf_d], lambda nrm, ctr: 1 if nrm.z < -0.45 else 0)
        P.add(b)
    return P.finish(export)


def build_tree_pine(export=True):
    """A conifer ~3.8 m tall: three scalloped tiers on a straight trunk."""
    P = Prop('tree_pine')
    trunk = P.m('trunk', '#5B4636')
    leaf = P.m('leaf', '#2C6346')
    leaf_d = P.m('leaf_d', '#1E4632')
    P.add(tube('trunk', [V((0, 0, -0.05)), V((0, 0, 1.4))], [(0, 0.18), (0.15, 0.14), (1, 0.1)], n=8, mat=trunk, subd=0))
    tiers = [(0.85, 2.55, 1.0), (1.55, 3.15, 0.78), (2.25, 3.8, 0.55)]
    for i, (z0, z1, R) in enumerate(tiers):
        k = 9 - i
        ph = i * 0.35

        def skirt(t, R=R, k=k, ph=ph):
            return R * (1 + 0.11 * math.cos(k * (t + ph))), z0 - 0.06 * (0.5 + 0.5 * math.cos(k * (t + ph)))

        rings = [
            (0.0, z1),
            (R * 0.35, z1 - (z1 - z0) * 0.32),
            (lambda t, R=R, k=k, ph=ph: (R * 0.72 * (1 + 0.05 * math.cos(k * (t + ph))), z0 + (z1 - z0) * 0.3)),
            skirt,
            (lambda t, R=R, k=k, ph=ph: (R * 0.86 * (1 + 0.1 * math.cos(k * (t + ph))), z0 - 0.02)),
            (0.16, z0 + 0.12),
        ]
        P.add(lathe('tier', rings, n=36, mats=[leaf, leaf_d], row_mats=[0, 0, 0, 1, 1]))
    return P.finish(export)


# ---------------------------------------------------------------------------------------------
# buildings


def window(P, center, w, h, normal, *, frame='#7A5236', box=True, seed=0):
    """A glowing window with a wooden frame, a cross mullion and a flower box, facing normal."""
    from mathutils import Matrix

    glow = P.glow('window', '#FFD98A', 1.4)
    wood = P.m('frame', frame)
    n = V(normal).normalized()
    up = V((0, 0, 1))
    side = up.cross(n).normalized()
    M = Matrix((side, n, up)).transposed().to_4x4()
    M.translation = V(center)
    objs = [L.box('pane', (0, 0.0, 0), (w, 0.03, h), mat=glow)]
    for sx in (-1, 1):
        objs.append(L.box('jamb', (sx * (w / 2 + 0.03), 0.03, 0), (0.07, 0.07, h + 0.12), mat=wood, bevel=0.012, segs=1))
    for sz in (-1, 1):
        objs.append(L.box('sill', (0, 0.035, sz * (h / 2 + 0.03)), (w + 0.18, 0.08 if sz < 0 else 0.07, 0.07), mat=wood,
                          bevel=0.012, segs=1))
    objs.append(L.box('mullion', (0, 0.02, 0), (0.04, 0.04, h), mat=wood))
    objs.append(L.box('transom', (0, 0.02, 0), (w, 0.04, 0.04), mat=wood))
    if box:
        objs.append(L.box('flowerbox', (0, 0.12, -h / 2 - 0.13), (w + 0.1, 0.16, 0.13), mat=P.m('flowerbox', '#9A6B45'),
                          bevel=0.015, segs=1))
        rnd = random.Random(seed)
        cols = ['#FF9CC8', '#FFD98A', '#FF7AB6', '#F7F5FF']
        for i in range(5):
            x = -w / 2 + 0.05 + i * (w - 0.1) / 4
            objs.append(L.blob('bush', (x, 0.12, -h / 2 - 0.04), (0.07, 0.06, 0.05), mat=P.m('leafy', '#5FA866'), segs=(8, 5)))
            objs.append(L.blob('bloom', (x + rnd.uniform(-0.02, 0.02), 0.1, -h / 2 + 0.0), (0.035, 0.03, 0.03),
                               mat=P.m('petal' + str(i % 4), cols[i % 4]), segs=(8, 5)))
    for o in objs:
        o.data.transform(M)
        o.data.update()
        P.add(o)


def gable_roof(P, w, d, h, rise, *, over=0.28, thick=0.14, roof=None, roof_d=None, tiles=4):
    """Two slabs meeting at a ridge along Y, over walls w x d of height h."""
    roof = roof or P.m('roof')
    roof_d = roof_d or P.m('roof_d')
    half = w / 2 + over
    ang = math.atan2(rise, w / 2)
    drop = over * math.tan(ang)
    for sx in (-1, 1):
        a = V((sx * half, 0, h - drop))
        b = V((0, 0, h + rise + thick * 0.4))
        n_out = V((sx * math.sin(ang), 0, math.cos(ang)))
        for k in range(tiles):
            u0 = k / tiles
            p0 = a.lerp(b, u0) + n_out * (thick * 0.5)
            P.add(plank('tilerow', p0 + V((0, -(d / 2 + over), 0)), p0 + V((0, d / 2 + over, 0)), 0.1, 0.05, roof_d,
                        up=n_out))
        P.add(plank('roofslab', a, b, d + 2 * over, thick, roof, up=n_out))
    ridge = V((0, 0, h + rise + thick * 0.55))
    P.add(tube('ridge', [ridge + V((0, -(d / 2 + over + 0.04), 0)), ridge + V((0, d / 2 + over + 0.04, 0))], 0.1,
               n=10, mat=roof_d, subd=0))


def build_house(export=True):
    """A Hearthpage cottage, 3 x 3 m with 2.2 m walls (the game scales it to each house)."""
    P = Prop('house')
    w, d, h = 3.0, 3.0, 2.2
    wall = P.m('wall', '#F3EBDD')
    P.m('wall_d', '#D8CDB8')
    P.m('roof', '#C46A4A')
    P.m('roof_d', '#9A4E3A')
    wood = P.m('timber', '#7A5236')
    stone = P.m('stone', '#B9B2C9')
    rise = 1.25
    P.add(L.box('foundation', (0, 0, 0.13), (w + 0.16, d + 0.16, 0.26), mat=stone, bevel=0.04, segs=2))
    P.add(L.box('walls', (0, 0, h / 2 + 0.1), (w, d, h - 0.2), mat=wall, bevel=0.03, segs=1))
    # gable ends (front and back)
    for sy in (-1, 1):
        tri = extrude_outline('gable', [(-w / 2, h), (w / 2, h), (0, h + rise)], 0.12, wall, y=sy * (d / 2 - 0.06))
        P.add(tri)
    # timber frame
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.add(L.box('post', (sx * (w / 2 + 0.01), sy * (d / 2 + 0.01), h / 2 + 0.1), (0.16, 0.16, h - 0.1), mat=wood,
                        bevel=0.02, segs=1))
    for z in (h - 0.02, 1.0):
        for sy in (-1, 1):
            P.add(L.box('beam', (0, sy * (d / 2 + 0.03), z), (w + 0.1, 0.1, 0.13), mat=wood, bevel=0.02, segs=1))
        for sx in (-1, 1):
            P.add(L.box('beam', (sx * (w / 2 + 0.03), 0, z), (0.1, d + 0.1, 0.13), mat=wood, bevel=0.02, segs=1))
    for sy in (-1, 1):
        for sx in (-1, 1):
            P.add(plank('rafter', V((sx * w / 2, sy * (d / 2 + 0.05), h)), V((0, sy * (d / 2 + 0.05), h + rise)), 0.1, 0.1,
                        wood, up=(0, sy, 0)))
    gable_roof(P, w, d, h, rise)
    # chimney
    P.add(L.box('chimney', (0.75, 0.55, h + rise * 0.75), (0.42, 0.42, 1.3), mat=stone, bevel=0.03, segs=1))
    P.add(L.box('chimneycap', (0.75, 0.55, h + rise * 0.75 + 0.68), (0.54, 0.54, 0.1), mat=P.m('stone_d', '#8E89AE'),
                bevel=0.02, segs=1))
    # door with a rounded top, on the front (-Y)
    door = P.m('door', '#6B4632')
    dy = -d / 2 - 0.02
    outline = [(-0.36, 0.26), (-0.36, 1.25)] + [(math.cos(math.radians(180 - x)) * 0.36, 1.25 + math.sin(math.radians(180 - x)) * 0.36)
                                                  for x in range(15, 180, 15)] + [(0.36, 1.25), (0.36, 0.26)]
    P.add(extrude_outline('door', outline, 0.08, door, bevel=0.015, segs=1, y=dy))
    frame = [(-0.46, 0.26), (-0.46, 1.25)] + [(math.cos(math.radians(180 - x)) * 0.46, 1.25 + math.sin(math.radians(180 - x)) * 0.46)
                                               for x in range(15, 180, 15)] + [(0.46, 1.25), (0.46, 0.26)]
    P.add(extrude_outline('doorframe', frame, 0.05, wood, bevel=0.01, segs=1, y=dy + 0.03))
    for x in (-0.12, 0.12):
        P.add(L.box('doorplank', (x, dy - 0.045, 0.85), (0.02, 0.01, 1.1), mat=P.m('door_d', '#4E3222')))
    P.add(L.blob('knob', (0.22, dy - 0.07, 0.85), 0.035, mat=P.m('brass', '#E8C46A', rough=0.4), segs=(8, 6)))
    P.add(L.box('step', (0, dy - 0.2, 0.12), (1.0, 0.4, 0.24), mat=stone, bevel=0.03, segs=1))
    # windows: two on the front, one on each side, a round one up in the gable
    for sx in (-1, 1):
        window(P, (sx * 0.95, -d / 2 - 0.02, 1.45), 0.5, 0.5, (0, -1, 0), seed=sx + 2)
        window(P, (sx * (w / 2 + 0.02), 0, 1.45), 0.5, 0.5, (sx, 0, 0), seed=sx + 5)
    gz = h + rise * 0.42
    P.add(L.ring('roundframe', (0, -d / 2 - 0.08, gz), 0.22, 0.22, 0.04, thick_z=0.04, n=6, segs=20, mat=wood, rot=(90, 0, 0),
                 subd=0))
    P.add(L.cylinder('roundpane', (0, -d / 2 - 0.05, gz), 0.2, 0.03, mat=P.glow('window', '#FFD98A', 1.4), n=16,
                     rot=(90, 0, 0)))
    # a lantern beside the door
    P.add(L.box('lamparm', (0.62, dy - 0.12, 1.75), (0.04, 0.26, 0.04), mat=P.m('iron', '#3A3150')))
    P.add(L.blob('lamp', (0.62, dy - 0.25, 1.62), (0.07, 0.07, 0.1), mat=P.glow('lampglow', '#FFD98A', 1.6), segs=(10, 6)))
    P.add(L.cylinder('lamptop', (0.62, dy - 0.25, 1.74), 0.08, 0.05, mat=P.m('iron'), n=8, r_top=0.02))
    flowers(P, (-1.1, -d / 2 - 0.45, 0.0), 6, 0.25, seed=4)
    return P.finish(export)


def build_windmill(export=True):
    """Hearthpage's windmill: a tapered plaster tower, a red cap and four canvas sails."""
    P = Prop('windmill')
    wall = P.m('wall', '#F3EBDD')
    stone = P.m('stone', '#B9B2C9')
    wood = P.m('timber', '#7A5236')
    roof = P.m('roof', '#C46A4A')
    roof_d = P.m('roof_d', '#9A4E3A')
    P.add(lathe('base', [(1.32, 0.45), (1.36, 0.4), (1.36, 0.0)], n=16, mat=stone, cap_top=True))
    P.add(lathe('tower', [(0.86, 4.45), (0.98, 3.4), (1.12, 1.6), (1.22, 0.42)], n=16, mat=wall))
    for z, r in ((1.6, 1.13), (3.0, 1.0)):
        P.add(L.ring('band', (0, 0, z), r + 0.03, r + 0.03, 0.06, thick_z=0.04, n=4, segs=16, mat=wood, subd=0, power=3))
    P.add(lathe('roof', [(0.0, 6.0), (0.25, 5.75), (0.8, 4.95), (1.18, 4.42), (1.22, 4.32), (0.8, 4.3)], n=16,
                mats=[roof, roof_d], row_mats=[0, 0, 0, 1, 1]))
    P.add(L.blob('finial', (0, 0, 6.05), 0.1, mat=P.m('brass', '#E8C46A', rough=0.4), segs=(10, 6)))
    # door and windows on the front (-Y)
    door = P.m('door', '#6B4632')
    outline = [(-0.36, 0.42), (-0.36, 1.1)] + [(math.cos(math.radians(180 - x)) * 0.36, 1.1 + math.sin(math.radians(180 - x)) * 0.36)
                                                 for x in range(15, 180, 15)] + [(0.36, 1.1), (0.36, 0.42)]
    P.add(extrude_outline('door', outline, 0.2, door, bevel=0.015, segs=1, y=-1.17))
    for z, r in ((2.35, 1.07), (3.55, 0.95)):
        window(P, (0, -r - 0.02, z), 0.34, 0.4, (0, -1, 0), box=False)
    window(P, (1.05, -0.2, 2.6), 0.32, 0.38, (0.98, -0.2, 0), box=False)
    # balcony
    P.add(L.ring('balcony', (0, 0, 3.0), 1.25, 1.25, 0.04, thick_z=0.1, n=4, segs=20, mat=wood, subd=0, power=3))
    # the sails turn around the node's local Z in game (Blender -Y)
    hub = V((0, -1.18, 3.9))
    P.node('blades', hub)
    P.add(tube('axle', [V((0, -0.7, 3.9)), hub + V((0, -0.12, 0))], 0.12, n=10, mat=wood, subd=0), node='blades')
    P.add(L.blob('hub', hub + V((0, -0.14, 0)), (0.2, 0.14, 0.2), mat=P.m('brass'), segs=(12, 8)), node='blades')
    sail = P.m('sail', '#F7F2E6')
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        dvec = V((math.cos(a), 0, math.sin(a)))
        pvec = V((-math.sin(a), 0, math.cos(a)))
        P.add(plank('spar', hub + dvec * 0.1, hub + dvec * 3.3, 0.14, 0.1, wood, up=(0, -1, 0)), node='blades')
        c0 = hub + dvec * 0.75 + pvec * 0.34 + V((0, -0.06, 0))
        c1 = hub + dvec * 3.2 + pvec * 0.36 + V((0, -0.06, 0))
        P.add(plank('sail', c0, c1, 0.56, 0.035, sail, up=(0, -1, 0)), node='blades')
        for u in (0.0, 0.33, 0.66, 1.0):
            q = c0.lerp(c1, u) + V((0, -0.03, 0))
            P.add(plank('lath', q - pvec * 0.31, q + pvec * 0.31, 0.05, 0.04, wood, up=(0, -1, 0)), node='blades')
        P.add(plank('edge', c0 + pvec * 0.3 + V((0, -0.03, 0)), c1 + pvec * 0.32 + V((0, -0.03, 0)), 0.05, 0.04, wood,
                    up=(0, -1, 0)), node='blades')
    flowers(P, (-1.5, -0.8, 0.0), 6, 0.3, seed=7)
    return P.finish(export)


def build_forge(export=True):
    """Brakk's smithy in Forgehollow: stone walls, a dark roof, a big chimney and a glowing hearth."""
    P = Prop('forge')
    w, d, h = 4.0, 3.0, 2.6
    wall = P.m('wall', '#C9A08A')
    wall_d = P.m('wall_d', '#9A7464')
    P.m('roof', '#6B3B37')
    P.m('roof_d', '#4A2826')
    stone = P.m('stone', '#7A6A72')
    wood = P.m('timber', '#4A3428')
    fire = P.glow('fire', '#FF9A4A', 2.2)
    P.add(L.box('foundation', (0, 0, 0.16), (w + 0.2, d + 0.2, 0.32), mat=stone, bevel=0.05, segs=2))
    P.add(L.box('walls', (0, 0, h / 2), (w, d, h), mat=wall, bevel=0.04, segs=1))
    # stone courses
    for z in (0.75, 1.35, 1.95):
        P.add(L.box('course', (0, 0, z), (w + 0.04, d + 0.04, 0.06), mat=wall_d))
    for sy in (-1, 1):
        P.add(extrude_outline('gable', [(-w / 2, h), (w / 2, h), (0, h + 1.2)], 0.12, wall, y=sy * (d / 2 - 0.06)))
    gable_roof(P, w, d, h, 1.2, over=0.3)
    # chimney with glowing embers at the top
    P.add(L.box('chimney', (1.2, 0.6, 3.4), (0.8, 0.8, 2.6), mat=stone, bevel=0.04, segs=1))
    P.add(L.box('chimneycap', (1.2, 0.6, 4.75), (0.95, 0.95, 0.14), mat=wall_d, bevel=0.03, segs=1))
    P.add(L.box('embers', (1.2, 0.6, 4.8), (0.55, 0.55, 0.06), mat=fire))
    # the hearth opening on the front (-Y)
    arch = [(-0.75, 0.32), (-0.75, 1.05)] + [(math.cos(math.radians(180 - x)) * 0.75, 1.05 + math.sin(math.radians(180 - x)) * 0.45)
                                              for x in range(15, 180, 15)] + [(0.75, 1.05), (0.75, 0.32)]
    P.add(extrude_outline('hearth', arch, 0.04, fire, y=-d / 2 - 0.01))
    ring_pts = [(-0.92, 0.32), (-0.92, 1.05)] + [(math.cos(math.radians(180 - x)) * 0.92, 1.05 + math.sin(math.radians(180 - x)) * 0.6)
                                                  for x in range(15, 180, 15)] + [(0.92, 1.05), (0.92, 0.32)]
    P.add(extrude_outline('hearthframe', ring_pts, 0.1, stone, bevel=0.02, segs=1, y=-d / 2 - 0.04))
    # awning beam, anvil, tools
    for sx in (-1, 1):
        P.add(L.box('awningpost', (sx * 1.7, -d / 2 - 0.9, 1.1), (0.14, 0.14, 2.2), mat=wood, bevel=0.02, segs=1))
    P.add(plank('awning', V((0, -d / 2 - 0.05, 2.35)), V((0, -d / 2 - 1.15, 2.05)), 3.8, 0.08, P.m('roof'), up=(0, -0.26, 1)))
    iron = P.m('iron', '#3A3150', rough=0.45)
    P.add(L.box('anvilbase', (-0.9, -d / 2 - 0.85, 0.25), (0.3, 0.3, 0.5), mat=wood, bevel=0.02, segs=1))
    P.add(L.box('anvil', (-0.9, -d / 2 - 0.85, 0.58), (0.55, 0.22, 0.16), mat=iron, bevel=0.03, segs=1))
    P.add(tube('horn', [V((-1.17, -d / 2 - 0.85, 0.6)), V((-1.35, -d / 2 - 0.85, 0.6))], [(0, 0.07), (1, 0.0)], n=8, mat=iron,
               subd=0, cap1=False))
    P.add(L.box('glowbar', (-0.9, -d / 2 - 0.85, 0.69), (0.3, 0.05, 0.03), mat=fire))
    P.add(L.cylinder('barrel', (1.1, -d / 2 - 0.7, 0.35), 0.28, 0.7, mat=wood, n=12))
    P.add(L.cylinder('water', (1.1, -d / 2 - 0.7, 0.68), 0.24, 0.02, mat=P.m('water', '#3A8AA6'), n=12))
    return P.finish(export)


def build_spire(export=True):
    """King Null's spire: a dark tower wrapped in glowing ribbons, crowned by a pulsing orb."""
    P = Prop('spire')
    dark = P.m('dark', '#3A2E63')
    dark_d = P.m('dark_d', '#2A2147')
    band = P.m('band', '#5A4A8E')
    trim = P.m('gold', '#E8C46A', rough=0.4)
    glow = P.glow('ribbon', '#FF7AB6', 1.8)
    P.add(lathe('dais', [(3.0, 0.8), (3.5, 0.72), (3.5, 0.0)], n=32, mat=dark_d, cap_top=True))
    P.add(lathe('dais2', [(2.2, 1.2), (2.5, 1.12), (2.5, 0.8)], n=32, mat=band, cap_top=True))
    P.add(lathe('tower', [(1.0, 10.2), (1.08, 6.0), (1.3, 1.2)], n=24, mat=dark))
    for z, r in ((1.25, 1.42), (5.0, 1.2), (10.2, 1.3)):
        P.add(L.ring('collar', (0, 0, z), r, r, 0.12, thick_z=0.1, n=4, segs=24, mat=trim, subd=0, power=3))
    # gothic crown: a ring of spikes around the tapered top
    P.add(lathe('crown', [(0.0, 17.0), (0.25, 15.0), (0.9, 12.0), (1.25, 10.6), (1.3, 10.3)], n=24, mat=dark))
    for k in range(8):
        a = k * math.tau / 8
        p = V((math.cos(a) * 1.25, math.sin(a) * 1.25, 10.5))
        P.add(tube('spike', [p, p + V((math.cos(a) * 0.25, math.sin(a) * 0.25, 1.6))], [(0, 0.16), (1, 0.0)], n=6, mat=dark_d,
                   subd=0, cap1=False))
    # glowing windows up the tower
    for k in range(5):
        a = k * 2.4
        z = 2.5 + k * 1.6
        r = 1.3 - (z - 1.2) / 9 * 0.22
        P.add(L.box('slit', (math.cos(a) * r, math.sin(a) * r, z), (0.12, 0.12, 0.55), mat=glow, rot=(0, 0, math.degrees(a))))
    # spiral ribbon
    pts = []
    for i in range(80):
        u = i / 79
        a = u * math.tau * 2.2
        z = 1.6 + u * 8.3
        r = 1.36 - u * 0.24
        pts.append(V((math.cos(a) * r, math.sin(a) * r, z)))
    P.add(tube('ribbon', pts, 0.05, 0.16, n=6, side=(0, 0, 1), mat=band, subd=0))
    P.add(tube('ribbonglow', [p * 1.035 for p in pts], 0.02, 0.05, n=4, side=(0, 0, 1), mat=glow, subd=0))
    # floating rings around the crown
    for z, r, tilt in ((12.2, 2.0, 12), (14.0, 1.6, -18)):
        P.add(L.ring('halo', (0, 0, z), r, r, 0.04, thick_z=0.04, n=6, segs=40, mat=trim, subd=0, rot=(tilt, 0, 0)))
    P.node('orb', (0, 0, 17.6))
    # the game pulses the orb's scale around 1.2, so a 0.5 m radius reads as the 1.2 m orb
    P.add(L.blob('orb', (0, 0, 17.6), 0.5, mat=P.glow('orb', '#FF7AB6', 2.0), segs=(18, 12)), node='orb')
    return P.finish(export)


def build_bell_tower(export=True):
    """Loopwater's tide bell: four timber posts under a flared square roof, with a bronze bell."""
    P = Prop('bell_tower')
    post = P.m('post', '#F3EBDD')
    stone = P.m('stone', '#B9B2C9')
    wood = P.m('timber', '#7A5236')
    roof = P.m('roof', '#3A8AA6')
    roof_d = P.m('roof_d', '#2B6C86')
    P.add(L.box('plinth', (0, 0, 0.12), (2.3, 2.3, 0.24), mat=stone, bevel=0.04, segs=2))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.add(L.cylinder('post', (sx * 0.8, sy * 0.8, 1.9), 0.13, 3.3, mat=post, n=10))
            P.add(L.box('postbase', (sx * 0.8, sy * 0.8, 0.36), (0.36, 0.36, 0.24), mat=stone, bevel=0.03, segs=1))
    for z in (3.45, 3.65):
        for sy in (-1, 1):
            P.add(L.box('beam', (0, sy * 0.8, z), (1.86, 0.16, 0.14), mat=wood, bevel=0.02, segs=1))
        for sx in (-1, 1):
            P.add(L.box('beam', (sx * 0.8, 0, z), (0.16, 1.86, 0.14), mat=wood, bevel=0.02, segs=1))
    P.add(L.box('bellbeam', (0, 0, 3.5), (1.8, 0.14, 0.14), mat=wood, bevel=0.02, segs=1))

    def sq(R, z, lift=0.0):
        def f(t):
            c, s = abs(math.cos(t)), abs(math.sin(t))
            r = R / max(c, s)
            corner = (min(c, s) / max(c, s)) ** 4
            return r, z + lift * corner
        return f

    P.add(lathe('roof', [(0.0, 5.1), sq(0.35, 4.75), sq(1.05, 4.05), sq(1.5, 3.72, 0.22), sq(1.45, 3.62, 0.24),
                         sq(1.05, 3.7)], n=64, mats=[roof, roof_d], row_mats=[0, 0, 0, 1, 1], phase=math.pi / 4))
    P.add(L.blob('finial', (0, 0, 5.15), 0.12, mat=P.m('brass', '#E8C46A', rough=0.35), segs=(10, 6)))
    # the bell swings from its node
    bronze = P.m('bronze', '#E8C46A', rough=0.35)
    P.node('bell', (0, 0, 3.3))
    P.add(lathe('bell', [(0.0, 3.32), (0.18, 3.3), (0.3, 3.15), (0.34, 2.85), (0.42, 2.62), (0.5, 2.55), (0.44, 2.55),
                         (0.3, 2.62)], n=24, mat=bronze, cap_top=True), node='bell')
    P.add(L.ring('bellband', (0, 0, 2.75), 0.39, 0.39, 0.025, thick_z=0.02, n=4, segs=24, mat=P.m('bronze_d', '#B8902A'),
                 subd=0), node='bell')
    P.add(L.blob('clapper', (0, 0, 2.6), 0.08, mat=P.m('iron', '#3A3150'), segs=(8, 6)), node='bell')
    P.add(tube('hanger', [V((0, 0, 3.3)), V((0, 0, 3.45))], 0.04, n=6, mat=wood, subd=0), node='bell')
    return P.finish(export)


# ---------------------------------------------------------------------------------------------
# small props


def build_inkwell(export=True):
    """An isle's inkwell: a round ink pot with a gold band, a quill, and ink that glows when filled."""
    P = Prop('inkwell')
    pot = P.m('pot', '#2A2342', rough=0.35)
    pot_l = P.m('pot_l', '#3A3366', rough=0.35)
    gold = P.m('gold', '#E8C46A', rough=0.35)
    P.add(lathe('pot', [(0.32, 0.98), (0.37, 1.02), (0.37, 0.92), (0.33, 0.86), (0.48, 0.74), (0.6, 0.5), (0.62, 0.3),
                        (0.56, 0.08), (0.5, 0.0)], n=32, mats=[pot_l, pot_l, pot_l, pot, pot, pot, pot, pot],
                row_mats=[0, 0, 1, 1, 1, 1, 1, 1], cap_bot=True))
    P.add(lathe('inside', [(0.3, 0.98), (0.3, 0.9)], n=32, mat=pot))
    P.add(L.ring('band', (0, 0, 0.62), 0.6, 0.6, 0.04, thick_z=0.02, n=4, segs=32, mat=gold, subd=0))
    P.add(L.ring('lipband', (0, 0, 1.0), 0.38, 0.38, 0.02, thick_z=0.02, n=4, segs=32, mat=gold, subd=0))
    # a label with a glyph
    P.add(L.box('label', (0, -0.6, 0.42), (0.36, 0.04, 0.24), mat=P.m('label', '#F3EBDD'), rot=(-8, 0, 0)))
    P.add(L.box('glyphmark', (0, -0.625, 0.42), (0.18, 0.01, 0.03), mat=pot))
    # the quill
    base = V((0.04, 0.0, 0.92))
    tip = V((0.62, 0.05, 2.45))
    P.add(tube('shaft', [base, tip], [(0, 0.02), (1, 0.008)], n=6, mat=gold, subd=0))
    vane = P.m('vane', '#F7F5FF')
    q0, q1 = base.lerp(tip, 0.3), tip + (tip - base).normalized() * 0.15
    P.add(tube('vane', spline([q0, q0.lerp(q1, 0.5) + V((0.04, 0, 0)), q1], steps=4), [(0, 0.02), (0.35, 0.16), (0.8, 0.11), (1, 0.0)],
               0.012, n=8, side=(0, 1, 0), mat=vane, subd=0, cap1=False))
    P.add(tube('vanevein', [q0, q1], 0.008, n=4, mat=P.m('vein', '#C9C3E6'), subd=0))
    # glowing ink, toggled by the game
    P.node('glow', (0, 0, 0.97))
    ink = P.glow('ink', '#5ED6E8', 1.6)
    P.add(L.cylinder('ink', (0, 0, 0.965), 0.3, 0.02, mat=ink, n=24), node='glow')
    for k in range(3):
        a = k * math.tau / 3
        p = V((math.cos(a) * 0.12, math.sin(a) * 0.12, 1.1 + k * 0.12))
        P.add(L.blob('wisp', p, 0.03, mat=ink, segs=(6, 4)), node='glow')
    return P.finish(export)


def build_slab(export=True):
    """A Slab: a rounded stone tablet with an inset face and glowing glyph lines (the game spins it)."""
    P = Prop('slab')
    stone = P.m('stone', '#8E89AE')
    panel = P.m('panel', '#6F6A93')
    gold = P.m('gold', '#E8C46A', rough=0.35)
    outline = [(-0.6, 0.0), (0.6, 0.0), (0.6, 1.7)] + [(math.cos(math.radians(x)) * 0.6, 1.7 + math.sin(math.radians(x)) * 0.6)
                                                       for x in range(15, 180, 15)] + [(-0.6, 1.7)]
    P.add(extrude_outline('slab', outline, 0.3, stone, bevel=0.05, segs=2))
    inner = [(-0.47, 0.2), (0.47, 0.2), (0.47, 1.7)] + [(math.cos(math.radians(x)) * 0.47, 1.7 + math.sin(math.radians(x)) * 0.47)
                                                         for x in range(15, 180, 15)] + [(-0.47, 1.7)]
    for sy in (-1, 1):
        P.add(extrude_outline('panel', inner, 0.04, panel, y=sy * 0.15))
    P.add(L.ring('rim', (0, 0, 1.7), 0.63, 0.63, 0.16, thick_z=0.025, n=4, segs=32, mat=gold, subd=0, rot=(90, 0, 0)))
    P.node('glyph', (0, -0.19, 1.1))
    g = P.glow('glyph', '#8FF3FF', 2.0)
    for sy in (-1, 1):
        y = sy * 0.18
        for i in range(3):
            P.add(L.box('line', (0, y, 1.45 - i * 0.3), (0.6 - (i % 2) * 0.16, 0.02, 0.07), mat=g), node='glyph')
        P.add(L.ring('glyphring', (0, y, 1.95), 0.17, 0.17, 0.02, thick_z=0.02, n=4, segs=24, mat=g, subd=0, rot=(90, 0, 0)),
              node='glyph')
        P.add(L.blob('glyphdot', (0, y, 1.95), (0.05, 0.02, 0.05), mat=g, segs=(8, 6)), node='glyph')
    return P.finish(export)


def build_pedestal(export=True):
    """A round dais with a glowing ring inlay, where a Slab returns."""
    P = Prop('pedestal')
    base = P.m('base', '#6F6A93')
    base_d = P.m('base_d', '#4E4A70')
    glow = P.glow('glow', '#5ED6E8', 1.4)
    P.add(lathe('dais', [(0.0, 0.5), (1.0, 0.5), (1.08, 0.47), (1.1, 0.42), (1.12, 0.22), (1.25, 0.18), (1.28, 0.0)], n=48,
                mats=[base, base, base, base_d, base_d, base_d], row_mats=[0, 0, 0, 3, 3, 3]))
    P.add(L.ring('inlay', (0, 0, 0.505), 0.86, 0.86, 0.008, thick_z=0.04, n=4, segs=48, mat=glow, subd=0))
    for k in range(8):
        a = k * math.tau / 8
        P.add(L.box('rune', (math.cos(a) * 1.115, math.sin(a) * 1.115, 0.32), (0.04, 0.16, 0.12), mat=glow,
                    rot=(0, 0, math.degrees(a))))
    return P.finish(export)


def build_dock(export=True):
    """A plank jetty reaching off an isle's edge, with two lantern posts at its end."""
    P = Prop('dock')
    wood = P.m('plank', '#C9A47A')
    wood_d = P.m('plank_d', '#9A7452')
    post = P.m('post', '#7A5236')
    rnd = random.Random(2)
    for i in range(9):
        x = -1.0 + i * 0.25
        y0 = -0.15 - rnd.uniform(0, 0.08)
        y1 = -3.85 + rnd.uniform(0, 0.1)
        P.add(plank('plank', V((x, y0, 0.08 + rnd.uniform(-0.01, 0.01))), V((x, y1, 0.08)), 0.22, 0.08,
                    wood if i % 3 else wood_d))
    for y in (-0.4, -2.0, -3.6):
        P.add(L.box('joist', (0, y, -0.06), (2.3, 0.16, 0.14), mat=post, bevel=0.02, segs=1))
    for sx in (-1, 1):
        P.add(L.box('stringer', (sx * 0.95, -1.95, -0.15), (0.14, 3.9, 0.16), mat=post, bevel=0.02, segs=1))
        p = V((sx * 1.05, -3.6, 0))
        P.add(L.cylinder('post', p + V((0, 0, 0.35)), 0.12, 1.3, mat=post, n=10))
        P.add(L.ring('rope', p + V((0, 0, 0.45)), 0.135, 0.135, 0.02, thick_z=0.02, n=4, segs=12, mat=P.m('rope', '#E3D1A4'),
                     subd=0))
        P.add(L.cylinder('lampbase', p + V((0, 0, 1.03)), 0.14, 0.06, mat=P.m('iron', '#3A3150'), n=10))
        P.add(L.blob('lamp', p + V((0, 0, 1.14)), (0.12, 0.12, 0.14), mat=P.glow('lampglow', '#FFD98A', 1.8), segs=(10, 6)))
        P.add(L.cylinder('lampcap', p + V((0, 0, 1.3)), 0.15, 0.06, mat=P.m('iron'), n=10, r_top=0.03))
        for k in range(4):
            a = k * math.tau / 4 + math.pi / 4
            q = p + V((math.cos(a) * 0.12, math.sin(a) * 0.12, 1.15))
            P.add(L.box('cage', q, (0.02, 0.02, 0.26), mat=P.m('iron')))
    return P.finish(export)


def build_boat(export=True):
    """The paper boat between isles: an origami hull with a paper sail."""
    P = Prop('boat')
    paper = P.m('paper', '#F7F2E6', flat=True)
    fold = P.m('fold', '#E3D8C2', flat=True)
    # hull: a folded trough, wide at the gunwale, narrow at the keel, peaked at bow and stern
    L_, W, H = 1.7, 0.85, 0.62
    verts = [
        (-W * 0.42, -L_ * 0.72, 0.05), (W * 0.42, -L_ * 0.72, 0.05), (W * 0.42, L_ * 0.72, 0.05), (-W * 0.42, L_ * 0.72, 0.05),
        (-W, -L_ * 0.8, H), (W, -L_ * 0.8, H), (W, L_ * 0.8, H), (-W, L_ * 0.8, H),
        (0, -L_ * 1.05, H + 0.22), (0, L_ * 1.05, H + 0.22),
    ]
    faces = [(0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7), (4, 5, 8), (6, 7, 9),
             (0, 4, 8), (1, 8, 5), (0, 8, 1), (2, 9, 6), (3, 7, 9), (2, 3, 9)]
    hull = L._mesh_obj('hull', verts, faces, paper, smooth=False)
    L._fix_normals(hull)
    mod = hull.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = 0.04
    L.apply_mods(hull)
    for p in hull.data.polygons:
        p.use_smooth = False
    P.add(hull)
    # the central fold that rises into the sail, like a folded hat
    sail = L._mesh_obj('sailfold', [(0, -L_ * 0.7, H), (0, L_ * 0.7, H), (0, 0.05, H + 1.35)], [(0, 1, 2)], fold, smooth=False)
    mod = sail.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = 0.05
    mod.offset = 0
    L.apply_mods(sail)
    P.add(sail)
    for sx in (-1, 1):
        flap = L._mesh_obj('flap', [(0, -L_ * 0.55, H + 0.02), (0, L_ * 0.55, H + 0.02), (sx * 0.22, 0.0, H + 0.95)],
                           [(0, 1, 2)], paper, smooth=False)
        mod = flap.modifiers.new('solid', 'SOLIDIFY')
        mod.thickness = 0.03
        L.apply_mods(flap)
        P.add(flap)
    P.add(L.blob('pennantpole', (0, 0.05, H + 1.45), (0.02, 0.02, 0.12), mat=P.m('pole', '#7A5236'), segs=(6, 4)))
    P.add(L._mesh_obj('pennant', [(0, 0.05, H + 1.56), (0, 0.05, H + 1.42), (0.0, 0.42, H + 1.5)], [(0, 1, 2)],
                      P.m('pennant', '#5ED6E8', flat=True), smooth=False))
    for p in P.parts[-1].data.polygons:
        p.use_smooth = False
    return P.finish(export)


def build_signpost(export=True):
    """A wooden signpost with an arrow board."""
    P = Prop('signpost')
    post = P.m('post', '#7A5236')
    board = P.m('board', '#E9DFC2')
    ink = P.m('ink', '#7A5236')
    P.add(L.cylinder('post', (0, 0, 0.9), 0.09, 1.8, mat=post, n=8))
    P.add(L.cylinder('cap', (0, 0, 1.84), 0.12, 0.08, mat=post, n=8, r_top=0.05))
    arrow = [(-0.7, -0.27), (0.5, -0.27), (0.72, 0.0), (0.5, 0.27), (-0.7, 0.27)]
    o = extrude_outline('board', [(x, z + 1.55) for x, z in arrow], 0.09, board, bevel=0.025, segs=2, y=-0.12)
    P.add(o)
    for x0, x1, z in ((-0.5, 0.35, 1.62), (-0.5, 0.15, 1.48)):
        P.add(L.box('text', ((x0 + x1) / 2, -0.17, z), (x1 - x0, 0.01, 0.05), mat=ink))
    P.add(L.blob('nail', (-0.58, -0.17, 1.55), 0.02, mat=P.m('iron', '#3A3150'), segs=(6, 4)))
    return P.finish(export)


def build_arch(export=True):
    """A stone gate over a path, with a rune-lit lintel."""
    P = Prop('arch')
    stone = P.m('stone', '#8E89AE')
    stone_d = P.m('stone_d', '#6F6A93')
    glow = P.glow('glow', '#5ED6E8', 1.6)
    for sx in (-1, 1):
        x = sx * 1.2
        P.add(L.box('plinth', (x, 0, 0.18), (0.72, 0.72, 0.36), mat=stone_d, bevel=0.04, segs=2))
        P.add(L.box('pillar', (x, 0, 1.55), (0.48, 0.48, 2.4), mat=stone, bevel=0.05, segs=2))
        P.add(L.box('capital', (x, 0, 2.82), (0.66, 0.66, 0.18), mat=stone_d, bevel=0.03, segs=2))
        P.add(L.box('rune', (x, -0.245, 1.6), (0.08, 0.01, 0.9), mat=glow))
    pts = [V((math.sin(u) * 1.45, 0, 2.95 + math.cos(u) * 0.4 - 0.4 * 0.0)) for u in [(-1 + 2 * i / 16) * 1.25 for i in range(17)]]
    pts = [V((p.x, 0, 2.95 + 0.38 * (1 - (p.x / 1.45) ** 2))) for p in pts]
    P.add(tube('lintel', pts, 0.24, 0.3, n=8, side=(0, 1, 0), mat=stone, subd=0, power=4))
    P.add(tube('runeline', [p + V((0, -0.31, 0)) for p in pts[3:-3]], 0.03, 0.01, n=4, side=(0, 1, 0), mat=glow, subd=0))
    P.add(L.blob('keystone', (0, -0.05, 3.42), (0.18, 0.34, 0.22), mat=stone_d, segs=(8, 6)))
    P.add(L.blob('keygem', (0, -0.36, 3.42), (0.07, 0.03, 0.09), mat=glow, segs=(8, 6)))
    return P.finish(export)


def build_lantern(export=True):
    """A street lamp: an iron post with a curled hook and a caged glowing lantern."""
    P = Prop('lantern')
    iron = P.m('iron', '#3A3150', rough=0.45)
    glow = P.glow('glow', '#FFD98A', 1.8)
    P.add(L.cylinder('foot', (0, 0, 0.08), 0.16, 0.16, mat=iron, n=10, r_top=0.1))
    P.add(L.cylinder('pole', (0, 0, 1.05), 0.05, 1.9, mat=iron, n=8))
    hook = spline([V((0, 0, 1.95)), V((0, 0, 2.15)), V((0.15, 0, 2.3)), V((0.32, 0, 2.22))], steps=4)
    P.add(tube('hook', hook, 0.03, n=6, mat=iron, subd=0))
    P.add(tube('curl', spline([V((0, 0, 1.75)), V((0.12, 0, 1.82)), V((0.16, 0, 1.95)), V((0.08, 0, 2.0))], steps=3), 0.018, n=5,
               mat=iron, subd=0))
    c = V((0.32, 0, 1.98))
    P.add(L.cylinder('lamptop', c + V((0, 0, 0.19)), 0.15, 0.08, mat=iron, n=8, r_top=0.04))
    P.add(L.blob('lamp', c, (0.11, 0.11, 0.15), mat=glow, segs=(10, 6)))
    P.add(L.cylinder('lampbase', c + V((0, 0, -0.17)), 0.08, 0.05, mat=iron, n=8))
    for k in range(4):
        a = k * math.tau / 4 + math.pi / 4
        P.add(L.box('cage', c + V((math.cos(a) * 0.115, math.sin(a) * 0.115, 0)), (0.02, 0.02, 0.32), mat=iron))
    return P.finish(export)


def build_bench(export=True):
    """A park bench of slats on curved iron-and-wood legs."""
    P = Prop('bench')
    wood = P.m('slat', '#9A6B45')
    leg = P.m('leg', '#6B4632')
    for i in range(3):
        P.add(L.box('seat', (0, -0.18 + i * 0.17, 0.46), (1.8, 0.14, 0.05), mat=wood, bevel=0.015, segs=1))
    for i in range(3):
        P.add(L.box('back', (0, 0.3 + i * 0.015, 0.66 + i * 0.13), (1.8, 0.05, 0.1), mat=wood, bevel=0.015, segs=1,
                    rot=(-8, 0, 0)))
    for sx in (-1, 1):
        x = sx * 0.78
        P.add(tube('leg', spline([V((x, -0.22, 0.0)), V((x, -0.18, 0.44)), V((x, 0.27, 0.44)), V((x, 0.3, 0.0))], steps=3), 0.035,
                   0.025, n=6, side=(1, 0, 0), mat=leg, subd=0))
        P.add(tube('backleg', [V((x, 0.26, 0.42)), V((x, 0.34, 0.95))], 0.03, n=6, mat=leg, subd=0))
        P.add(tube('arm', spline([V((x, -0.24, 0.47)), V((x + sx * 0.05, -0.2, 0.66)), V((x, 0.25, 0.68))], steps=3), 0.028, n=6,
                   mat=leg, subd=0))
    return P.finish(export)


def build_heart(export=True):
    """A floating heart: a 'moment' to share with Lethe."""
    P = Prop('heart')
    pts = []
    for i in range(40):
        t = math.tau * i / 40
        x = 16 * math.sin(t) ** 3
        z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x * 0.022, z * 0.022))
    o = extrude_outline('heart', pts, 0.16, P.glow('heart', '#FF7AB6', 1.6), bevel=0.06, segs=3)
    P.add(o)
    return P.finish(export)


def build_rock(export=True):
    """A cluster of soft boulders (the game tints them per isle)."""
    P = Prop('rock')
    rock = P.m('rock', '#8E89AE')
    rock_d = P.m('rock_d', '#6F6A93')
    for i, (c, r) in enumerate(((V((0, 0, 0.22)), (0.7, 0.6, 0.46)), (V((0.55, -0.3, 0.1)), (0.3, 0.28, 0.22)),
                                (V((-0.5, 0.35, 0.08)), (0.24, 0.22, 0.16)))):
        b = L.blob('boulder', c, r, segs=(14, 9))
        craggy(b, 0.08 * r[0] / 0.7, 2.2, seed=i + 1)
        by_normal(b, [rock, rock_d], lambda nrm, ctr: 1 if nrm.z < -0.2 else 0)
        P.add(b)
    return P.finish(export)


def build_dune(export=True):
    """A soft sand dune with wind ripples."""
    P = Prop('dune')
    sand = P.m('sand', '#E2B867')
    sand_d = P.m('sand_d', '#C9974A')
    b = L.blob('dune', (0, 0, -0.2), (2.5, 1.8, 0.8), segs=(32, 14))
    for v in b.data.vertices:
        if v.co.z > -0.15:
            v.co.z += 0.03 * math.sin(v.co.x * 5 + v.co.y * 1.5) * (v.co.z + 0.2)
    b.data.update()
    by_normal(b, [sand, sand_d], lambda nrm, ctr: 1 if (nrm.x * 0.6 + nrm.y * 0.8) > 0.55 else 0)
    P.add(b)
    return P.finish(export)


def build_dome(export=True):
    """A Lexicon reading dome: a glass hemisphere on a ribbed frame."""
    P = Prop('dome')
    glass = P.m('glass', '#7FE3F0', rough=0.3)
    rib = P.m('rib', '#F3EBDD')
    gold = P.m('gold', '#E8C46A', rough=0.35)
    rings = [(0.0, 1.5)] + [(math.sin(math.radians(a)) * 1.5, math.cos(math.radians(a)) * 1.5) for a in range(15, 91, 15)]
    P.add(lathe('glass', rings, n=32, mat=glass))
    for k in range(8):
        a = k * math.tau / 8
        pts = [V((math.cos(a) * math.sin(math.radians(u)) * 1.53, math.sin(a) * math.sin(math.radians(u)) * 1.53,
                  math.cos(math.radians(u)) * 1.53)) for u in range(0, 91, 10)]
        P.add(tube('rib', pts, 0.045, n=6, mat=rib, subd=0))
    P.add(L.ring('midband', (0, 0, 0.75), 1.31, 1.31, 0.035, thick_z=0.035, n=4, segs=32, mat=rib, subd=0))
    P.add(lathe('base', [(1.4, 0.25), (1.62, 0.25), (1.62, 0.0), (1.4, 0.0)], n=32, mat=rib, cap_top=False))
    P.add(L.ring('baseband', (0, 0, 0.2), 1.63, 1.63, 0.03, thick_z=0.015, n=4, segs=32, mat=gold, subd=0))
    P.add(L.blob('finial', (0, 0, 1.58), 0.1, mat=P.glow('beacon', '#8FF3FF', 1.8), segs=(10, 6)))
    # an arched doorway on the front
    door = [(-0.35, 0.0), (-0.35, 0.6)] + [(math.cos(math.radians(180 - x)) * 0.35, 0.6 + math.sin(math.radians(180 - x)) * 0.35)
                                            for x in range(15, 180, 15)] + [(0.35, 0.6), (0.35, 0.0)]
    P.add(extrude_outline('door', door, 0.5, rib, bevel=0.02, segs=1, y=-1.35))
    P.add(extrude_outline('doorway', [(x * 0.78, z * 0.92) for x, z in door], 0.04, P.m('doorway', '#2B6C86'), y=-1.6))
    return P.finish(export)


def build_volcano(export=True):
    """Forgehollow's volcano: craggy slopes, a lava crater and glowing lava rivers."""
    P = Prop('volcano')
    rock = P.m('rock', '#4A2826')
    rock_d = P.m('rock_d', '#331A1C')
    lava = P.glow('lava', '#FF9A4A', 2.2)
    prof = [(1.0, 4.95), (1.18, 5.0), (1.45, 4.6), (2.2, 3.4), (3.1, 2.0), (3.9, 0.9), (4.4, 0.25), (4.6, 0.0)]
    rings = [(0.0, 4.55), (0.9, 4.6)] + [lambda t, r=r, z=z: (r * (1 + 0.06 * noise.noise(V((math.cos(t) * 2, math.sin(t) * 2, z)))), z)
                                         for r, z in prof]
    body = lathe('cone', rings, n=48, mats=[lava, rock, rock_d], row_mats=[0, 1, 1, 1, 1, 1, 2, 2, 2])
    P.add(body)
    for k in range(4):
        a = k * 1.7
        pts = []
        for i in range(10):
            u = i / 9
            z = 4.9 - u * 4.3
            r = 1.2 + (4.4 - 1.2) * (u ** 1.1)
            aa = a + 0.18 * math.sin(u * 5 + k)
            pts.append(V((math.cos(aa) * (r + 0.06), math.sin(aa) * (r + 0.06), z + 0.05)))
        P.add(tube('lavariver', pts, [(0, 0.13), (1, 0.05)], 0.05, n=5, side=(0, 0, 1), mat=lava, subd=0))
    for k in range(6):
        a = k * 1.05 + 0.3
        c = V((math.cos(a) * 4.6, math.sin(a) * 4.6, 0.15))
        b = L.blob('boulder', c, (0.45, 0.4, 0.32), segs=(10, 7))
        craggy(b, 0.06, 2.0, seed=k)
        L.set_mat(b, rock_d)
        P.add(b)
    return P.finish(export)


def build_music_box(export=True):
    """Mom's music box: a carved stand, an open red box with gold trim and a little twirling star."""
    P = Prop('music_box')
    wood = P.m('wood', '#9A6B45')
    red = P.m('box', '#C46A4A')
    gold = P.m('gold', '#E8C46A', rough=0.35)
    P.add(lathe('stand', [(0.36, 0.85), (0.42, 0.8), (0.3, 0.62), (0.22, 0.4), (0.3, 0.12), (0.45, 0.06), (0.45, 0.0)], n=20,
                mat=wood, cap_top=True))
    P.add(L.box('box', (0, 0, 1.05), (0.82, 0.6, 0.4), mat=red, bevel=0.04, segs=2))
    P.add(L.box('trim', (0, 0, 0.88), (0.86, 0.64, 0.05), mat=gold, bevel=0.015, segs=1))
    P.add(L.box('inside', (0, 0, 1.24), (0.72, 0.5, 0.03), mat=P.m('velvet', '#3A2E63')))
    # lid, open toward the back
    from mathutils import Matrix

    lid = L.box('lid', (0, 0.3, 0.0), (0.84, 0.62, 0.06), mat=red, bevel=0.02, segs=1)
    lid.data.transform(Matrix.Translation((0, 0.3, 1.27)) @ Matrix.Rotation(math.radians(-105), 4, 'X') @ Matrix.Translation((0, -0.3, 0)))
    P.add(lid)
    P.add(L.cylinder('drum', (0, 0, 1.3), 0.08, 0.06, mat=gold, n=12))
    star = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        r = 0.13 if i % 2 == 0 else 0.055
        star.append((math.cos(a) * r, math.sin(a) * r + 1.55))
    P.add(extrude_outline('star', star, 0.04, P.glow('star', '#FFD98A', 1.4), bevel=0.01, segs=1))
    P.add(tube('starpin', [V((0, 0, 1.3)), V((0, 0, 1.43))], 0.012, n=5, mat=gold, subd=0))
    P.add(tube('crank', [V((0.41, 0, 1.05)), V((0.52, 0, 1.05)), V((0.52, 0, 1.18))], 0.018, n=6, mat=gold, subd=0))
    P.add(L.blob('crankknob', (0.52, 0, 1.2), 0.035, mat=gold, segs=(8, 6)))
    return P.finish(export)


def build_stall(export=True):
    """Tomo's bakery stall: a wooden counter, a striped scalloped awning and fresh bread."""
    P = Prop('stall')
    wood = P.m('wood', '#C9A47A')
    wood_d = P.m('wood_d', '#9A7452')
    post = P.m('post', '#7A5236')
    red = P.m('awning', '#C46A4A')
    cream = P.m('awning_l', '#F3EBDD')
    P.add(L.box('counter', (0, 0, 0.55), (2.4, 0.9, 1.1), mat=wood, bevel=0.03, segs=1))
    P.add(L.box('top', (0, -0.02, 1.13), (2.55, 1.0, 0.07), mat=wood_d, bevel=0.02, segs=1))
    for i in range(5):
        P.add(L.box('panel', (-0.96 + i * 0.48, -0.455, 0.55), (0.04, 0.02, 0.95), mat=wood_d))
    for sx in (-1, 1):
        P.add(L.box('post', (sx * 1.12, 0.32, 1.45), (0.12, 0.12, 2.9), mat=post, bevel=0.02, segs=1))
    # awning: alternating stripes with a scalloped front edge
    n = 8
    for i in range(n):
        x0 = -1.4 + i * 2.8 / n
        x1 = x0 + 2.8 / n
        m = red if i % 2 == 0 else cream
        P.add(plank('stripe', V(((x0 + x1) / 2, 0.45, 2.85)), V(((x0 + x1) / 2, -0.75, 2.55)), x1 - x0 + 0.002, 0.05, m,
                    up=(0, 0.24, 1)))
        P.add(L.blob('scallop', ((x0 + x1) / 2, -0.76, 2.5), ((x1 - x0) / 2, 0.03, 0.09), mat=m, segs=(10, 6)))
    # bread loaves, a basket and a little sign
    loaf = P.m('bread', '#E8B26A')
    crust = P.m('crust', '#B87A3A')
    for i in range(3):
        c = V((-0.65 + i * 0.6, -0.1, 1.25))
        b = L.blob('loaf', c, (0.2, 0.12, 0.1), segs=(12, 8))
        by_normal(b, [loaf, crust], lambda nrm, ctr: 1 if nrm.z > 0.6 else 0)
        P.add(b)
        for k in (-1, 0, 1):
            P.add(L.box('score', c + V((k * 0.08, 0, 0.09)), (0.02, 0.16, 0.01), mat=loaf, rot=(0, 0, 25)))
    P.add(lathe('basket', [(0.22, 1.36), (0.18, 1.18), (0.12, 1.16)], n=14, mat=P.m('wicker', '#C9974A'), cap_bot=True))
    move(P.parts[-1], (0.95, 0.15, 0.0))
    for k in range(3):
        P.add(L.blob('bun', (0.95 + (k - 1) * 0.08, 0.15, 1.32), 0.07, mat=loaf, segs=(8, 6)))
    P.add(L.box('sign', (0, -0.48, 2.25), (0.9, 0.05, 0.3), mat=cream, bevel=0.02, segs=1))
    P.add(L.box('signline', (0, -0.51, 2.25), (0.6, 0.01, 0.06), mat=red))
    return P.finish(export)


def build_deck(export=True):
    """Hearthpage's stargazing deck: a raised plank platform with a rail and a telescope."""
    P = Prop('deck')
    wood = P.m('plank', '#9A6B45')
    wood_d = P.m('plank_d', '#7A5236')
    for i in range(12):
        x = -1.84 + i * 0.335
        P.add(plank('plank', V((x, -1.45, 0.27)), V((x, 1.45, 0.27)), 0.31, 0.06, wood if i % 4 else wood_d))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.add(L.box('leg', (sx * 1.85, sy * 1.35, 0.12), (0.18, 0.18, 0.3), mat=wood_d, bevel=0.02, segs=1))
    for y in (-1.35, 0, 1.35):
        P.add(L.box('joist', (0, y, 0.18), (3.9, 0.14, 0.12), mat=wood_d, bevel=0.015, segs=1))
    # rail on three sides, open at the front (-Y)
    for (a, b) in (((-1.9, 1.4), (1.9, 1.4)), ((-1.9, -1.4), (-1.9, 1.4)), ((1.9, -1.4), (1.9, 1.4))):
        A, B = V((a[0], a[1], 0.86)), V((b[0], b[1], 0.86))
        P.add(plank('rail', A, B, 0.1, 0.08, wood_d))
        n = int((B - A).length / 0.5)
        for k in range(n + 1):
            q = A.lerp(B, k / n)
            P.add(L.box('baluster', (q.x, q.y, 0.58), (0.06, 0.06, 0.56), mat=wood, bevel=0.01, segs=1))
    # a little brass telescope on a tripod
    brass = P.m('brass', '#E8C46A', rough=0.35)
    top = V((1.2, 0.7, 1.1))
    for k in range(3):
        a = k * math.tau / 3
        P.add(tube('tripod', [top, V((1.2 + math.cos(a) * 0.3, 0.7 + math.sin(a) * 0.3, 0.3))], 0.02, n=5, mat=wood_d, subd=0))
    P.add(tube('scope', [top + V((-0.18, 0.15, -0.08)), top + V((0.3, -0.25, 0.25))], [(0, 0.045), (1, 0.07)], n=10,
               mat=brass, subd=0))
    return P.finish(export)


def build_log(export=True):
    """A fallen, mossy log with mushrooms: Lethe's favourite seat in Forkwood."""
    P = Prop('log')
    bark = P.m('bark', '#6B4632')
    ring_c = P.m('rings', '#C9A47A')
    moss = P.m('moss', '#6FAF6A')
    pts = [V((-1.3, 0, 0.38)), V((0, 0.05, 0.4)), V((1.3, 0, 0.37))]
    o = tube('log', pts, 0.38, n=14, mat=bark, subd=0, cap0=False, cap1=False)
    craggy(o, 0.025, 4.0, seed=2)
    P.add(o)
    for sx in (-1, 1):
        P.add(L.cylinder('end', (sx * 1.3, 0, 0.38), 0.36, 0.04, mat=ring_c, n=14, rot=(0, 90, 0)))
        P.add(L.ring('growth', (sx * 1.325, 0, 0.38), 0.2, 0.2, 0.012, thick_z=0.012, n=4, segs=14, mat=bark, subd=0,
                     rot=(0, 90, 0)))
    m = L.blob('moss', (0.1, 0.02, 0.62), (1.0, 0.3, 0.14), segs=(20, 8))
    craggy(m, 0.03, 5.0, seed=5)
    L.set_mat(m, moss)
    P.add(m)
    cap = P.m('mushroom', '#E8574A')
    dots = P.m('spots', '#F7F2E6')
    stem = P.m('stem', '#F3EBDD')
    for (x, y, z, s) in ((0.7, -0.33, 0.5, 1.0), (0.85, -0.3, 0.42, 0.7), (-0.6, -0.34, 0.45, 0.8)):
        P.add(tube('stem', [V((x, y, z - 0.06 * s)), V((x, y - 0.06 * s, z + 0.06 * s))], 0.025 * s, n=6, mat=stem, subd=0))
        P.add(L.blob('cap', (x, y - 0.07 * s, z + 0.08 * s), (0.08 * s, 0.08 * s, 0.045 * s), mat=cap, segs=(10, 6),
                     deform=lambda p: (p[0], p[1], max(p[2], -0.01))))
        P.add(L.blob('spot', (x + 0.03 * s, y - 0.12 * s, z + 0.1 * s), 0.012 * s, mat=dots, segs=(6, 4)))
    for k in range(4):
        P.add(L.blob('fern', (-1.0 + k * 0.6, 0.36, 0.06), (0.18, 0.12, 0.08), mat=moss, segs=(8, 5)))
    return P.finish(export)


def build_obelisk(export=True):
    """A sandstone obelisk of the Lexicon, carved with glowing glyphs."""
    P = Prop('obelisk')
    sand = P.m('stone', '#C99A45')
    sand_d = P.m('stone_d', '#9A7432')
    glow = P.glow('glyph', '#8FF3FF', 1.8)
    P.add(L.box('base', (0, 0, 0.12), (0.8, 0.8, 0.24), mat=sand_d, bevel=0.03, segs=1))
    P.add(lathe('shaft', [(0.0, 2.75), (0.2, 2.45), (0.24, 2.4), (0.3, 0.26)], n=4, mat=sand, phase=math.pi / 4))
    P.add(L.box('band', (0, 0, 2.3), (0.36, 0.36, 0.08), mat=P.m('gold', '#E8C46A', rough=0.35)))
    for k in range(4):
        a = k * math.pi / 2
        d = V((math.cos(a), math.sin(a), 0))
        for i in range(3):
            z = 0.75 + i * 0.45
            r = (0.3 - (z - 0.26) / 2.14 * 0.06) * 0.72 + 0.005
            c = d * r + V((0, 0, z))
            size = (0.012, 0.16, 0.05) if abs(d.x) > 0.5 else (0.16, 0.012, 0.05)
            P.add(L.box('glyph', c, size, mat=glow))
    return P.finish(export)


def build_glider(export=True):
    """Itsuki's glider: folded paper wings with Lethe's pink ink along the edges (origin = between
    the shoulder blades; the game parents it to the body pivot)."""
    P = Prop('glider')
    paper = P.m('paper', '#F7F2E6', flat=True)
    fold = P.m('fold', '#E3D8C2', flat=True)
    ink = P.glow('ink', '#FF7AB6', 1.8)
    for sx in (-1, 1):
        root_f = V((sx * 0.05, 0.02, 0.06))
        root_b = V((sx * 0.05, 0.12, -0.12))
        lead = [root_f, V((sx * 0.45, 0.06, 0.2)), V((sx * 0.98, 0.26, 0.3))]
        trail = [V((sx * 0.98, 0.3, 0.27)), V((sx * 0.8, 0.34, 0.02)), V((sx * 0.55, 0.3, 0.06)), V((sx * 0.38, 0.32, -0.12)),
                 V((sx * 0.2, 0.22, -0.06)), root_b]
        # fan of folded panels from the root: alternate tones read as paper creases
        rim = lead[1:] + trail
        hub = (root_f + root_b) / 2
        for i in range(len(rim) - 1):
            tri = L._mesh_obj('panel', [hub, rim[i], rim[i + 1]], [(0, 1, 2)], paper if i % 2 == 0 else fold, smooth=False)
            mod = tri.modifiers.new('solid', 'SOLIDIFY')
            mod.thickness = 0.008
            mod.offset = 0
            L.apply_mods(tri)
            P.add(tri)
        P.add(tube('edge', spline(lead, steps=4), 0.012, n=5, mat=ink, subd=0))
        P.add(tube('spar', [hub, V((sx * 0.8, 0.28, 0.2))], 0.008, n=4, mat=P.m('spar', '#7A5236'), subd=0))
    P.add(L.blob('clasp', (0, 0.06, -0.02), (0.07, 0.04, 0.09), mat=ink, segs=(10, 6)))
    return P.finish(export)


# ---------------------------------------------------------------------------------------------

BUILDERS = {
    'island': build_island,
    'tree_round': build_tree_round,
    'tree_pine': build_tree_pine,
    'house': build_house,
    'windmill': build_windmill,
    'forge': build_forge,
    'spire': build_spire,
    'bell_tower': build_bell_tower,
    'inkwell': build_inkwell,
    'slab': build_slab,
    'pedestal': build_pedestal,
    'dock': build_dock,
    'boat': build_boat,
    'signpost': build_signpost,
    'arch': build_arch,
    'lantern': build_lantern,
    'bench': build_bench,
    'heart': build_heart,
    'rock': build_rock,
    'dune': build_dune,
    'dome': build_dome,
    'volcano': build_volcano,
    'music_box': build_music_box,
    'stall': build_stall,
    'deck': build_deck,
    'log': build_log,
    'obelisk': build_obelisk,
    'glider': build_glider,
}


def build(name, export=True):
    return BUILDERS[name](export)


def build_all(export=True, names=None):
    out = {}
    for n in names or BUILDERS:
        r = build(n, export)
        out[n] = (r[1], r[2][1] if r[2] else None)
    return out
