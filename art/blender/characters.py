"""TABULA characters, anime style (Genshin / Wuthering Waves inspired), built in Blender.

Each character is a pivot hierarchy the game animates procedurally:

    <name>            root at the feet
      body            hips; torso, outfit, accessories
        head          neck top; head, face, hair (Itsuki's memory streak locks are streak1..3)
        armL / armR   shoulders  -> foreL / foreR at the elbows
      legL / legR     hip joints -> shinL / shinR at the knees

Parts under a pivot are joined into one mesh per pivot, so each pivot is one entity in the game.
Run build_all() (or build('itsuki')) inside Blender; GLBs land in public/models/.
"""

import importlib
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import tabula_lib as L  # noqa: E402

importlib.reload(L)
from tabula_lib import V, bez, lock, material, mix_hex, prof, ring, spline, tube  # noqa: E402

import bpy  # noqa: E402
import bmesh  # noqa: E402


def D(az, el):
    """Unit direction from a head centre: az 0 = front (-Y), positive toward +X; el = elevation."""
    a, e = math.radians(az), math.radians(el)
    return V((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))


# ---------------------------------------------------------------------------------------------
# body measurements


BODIES = {
    # teen boy, ~5.8 heads
    'teen_m': dict(h=1.62, hr=0.115, sh_x=0.158, sh_z=1.255, neck=1.29, hip_x=0.072, hip_z=0.80,
                   knee=0.445, ankle=0.075, elbow=1.015, wrist=0.79, limb=1.0, chest=(0.13, 0.082, 0.085),
                   waist=(0.112, 0.072, 0.074), hips=(0.122, 0.08, 0.08), female=False),
    'teen_f': dict(h=1.56, hr=0.114, sh_x=0.142, sh_z=1.21, neck=1.245, hip_x=0.07, hip_z=0.78,
                   knee=0.43, ankle=0.072, elbow=0.985, wrist=0.765, limb=0.88, chest=(0.118, 0.075, 0.098),
                   waist=(0.098, 0.066, 0.068), hips=(0.13, 0.088, 0.085), female=True),
    'adult_f': dict(h=1.66, hr=0.112, sh_x=0.15, sh_z=1.30, neck=1.335, hip_x=0.074, hip_z=0.85,
                    knee=0.465, ankle=0.075, elbow=1.055, wrist=0.825, limb=0.9, chest=(0.124, 0.078, 0.105),
                    waist=(0.102, 0.068, 0.07), hips=(0.138, 0.092, 0.088), female=True),
    'adult_m': dict(h=1.78, hr=0.116, sh_x=0.185, sh_z=1.40, neck=1.44, hip_x=0.08, hip_z=0.90,
                    knee=0.50, ankle=0.08, elbow=1.12, wrist=0.87, limb=1.1, chest=(0.15, 0.095, 0.1),
                    waist=(0.13, 0.085, 0.088), hips=(0.135, 0.09, 0.09), female=False),
    'big_m': dict(h=1.88, hr=0.118, sh_x=0.235, sh_z=1.47, neck=1.52, hip_x=0.095, hip_z=0.92,
                  knee=0.51, ankle=0.085, elbow=1.16, wrist=0.89, limb=1.45, chest=(0.2, 0.125, 0.13),
                  waist=(0.165, 0.11, 0.115), hips=(0.16, 0.105, 0.105), female=False),
    'kid': dict(h=1.36, hr=0.118, sh_x=0.13, sh_z=1.015, neck=1.05, hip_x=0.062, hip_z=0.64,
                knee=0.35, ankle=0.065, elbow=0.82, wrist=0.635, limb=0.85, chest=(0.11, 0.075, 0.078),
                waist=(0.1, 0.07, 0.072), hips=(0.108, 0.075, 0.075), female=False),
    # Lethe: a floating Paimon-sized devil princess, ~3 heads
    'chibi': dict(h=1.2, hr=0.2, sh_x=0.105, sh_z=0.66, neck=0.7, hip_x=0.055, hip_z=0.40,
                  knee=0.22, ankle=0.05, elbow=0.53, wrist=0.42, limb=0.8, chest=(0.1, 0.075, 0.08),
                  waist=(0.088, 0.066, 0.068), hips=(0.1, 0.075, 0.075), female=True, chibi=True),
}


class B:
    """Derived measurements for one body."""

    def __init__(self, kind, **over):
        d = dict(BODIES[kind])
        d.update(over)
        for k, v in d.items():
            setattr(self, k, v)
        self.kind = kind
        self.chibi = d.get('chibi', False)
        self.hc = V((0, 0.0, self.h - 0.025 - self.hr))  # cranium centre
        self.neck_top = self.hc.z - self.hr * 0.85
        self.chin = self.hc.z - self.hr * 1.3


# ---------------------------------------------------------------------------------------------
# builder


PIVOTS = ['body', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR']


class Char:
    def __init__(self, name, body):
        self.name = name
        self.b = body
        L.purge_default()
        L.fresh_collection(name)
        self.parts = {k: [] for k in PIVOTS}
        self.loose = []  # (obj, pivot): kept as separate nodes (toggled by the game)
        self.mats = {}

    # materials -----------------------------------------------------------------------------
    def m(self, role, color=None, **kw):
        if role in self.mats and color is None:
            return self.mats[role]
        self.mats[role] = material(role, color, **kw)
        return self.mats[role]

    def add(self, piv, *objs):
        for o in objs:
            if o is not None:
                self.parts[piv].append(o)
        return objs[0] if objs else None

    # pivots + export ---------------------------------------------------------------------
    def joints(self):
        b = self.b
        J = {
            'body': V((0, 0, b.hip_z)),
            'head': V((0, 0.005, b.neck_top)),
        }
        for sx, s in ((-1, 'L'), (1, 'R')):
            J['arm' + s] = V((sx * b.sh_x, 0.0, b.sh_z))
            J['fore' + s] = self.elbow(sx)
            J['leg' + s] = V((sx * b.hip_x, 0.0, b.hip_z))
            J['shin' + s] = self.knee(sx)
        return J

    def shoulder(self, sx):
        return V((sx * self.b.sh_x, 0.0, self.b.sh_z))

    def elbow(self, sx):
        b = self.b
        return V((sx * (b.sh_x + 0.028 * b.limb), 0.012, b.elbow))

    def wrist(self, sx):
        b = self.b
        return V((sx * (b.sh_x + 0.045 * b.limb), -0.005, b.wrist))

    def knee(self, sx):
        b = self.b
        return V((sx * b.hip_x * 1.04, -0.012, b.knee))

    def ankle(self, sx):
        b = self.b
        return V((sx * b.hip_x * 1.05, 0.0, b.ankle))

    def finish(self, export=True, draco=False):
        J = self.joints()
        root = L.pivot(self.name, (0, 0, 0))
        piv = {}
        parent_of = {'body': root, 'head': 'body', 'armL': 'body', 'armR': 'body', 'foreL': 'armL',
                     'foreR': 'armR', 'legL': root, 'legR': root, 'shinL': 'legL', 'shinR': 'legR'}
        for k in PIVOTS:
            p = parent_of[k]
            piv[k] = L.pivot(f'{self.name}:{k}', J[k], piv[p] if isinstance(p, str) else p)
        for k in PIVOTS:
            objs = self.parts[k]
            if not objs:
                continue
            for o in objs:
                L.bake_transform(o)
            j = L.join(objs, f'{self.name}:{k}.mesh')
            L.attach(j, piv[k])
        for o, k in self.loose:
            L.bake_transform(o)
            o.name = f'{self.name}:{o.name.split(":")[-1].split(".")[0]}'
            L.attach(o, piv[k])
        # drop empty leaf pivots (e.g. no shins on a robe) but keep the main rig nodes
        for k in ('foreL', 'foreR', 'shinL', 'shinR'):
            if not piv[k].children:
                bpy.data.objects.remove(piv[k], do_unlink=True)
        self.root = root
        tris = L.stats(root)
        out = None
        if export:
            out = L.export_glb(root, f'{self.name}.glb', draco=draco)
        return root, tris, out


# ---------------------------------------------------------------------------------------------
# head + face


def head_deform(hr, jaw=0.62, chin=0.3, flat=0.86):
    def f(p):
        x, y, z = p
        zn = z / hr
        if zn < 0:
            t = -zn
            x *= 1 - (1 - jaw) * t**1.7
            y *= 1 - 0.22 * t**1.5
            z *= 1 + chin * t
            y -= 0.05 * hr * t * t
        if y < 0:
            y *= flat
        # a touch of cheek fullness
        if zn < 0.1 and y < 0:
            x *= 1 + 0.04 * max(0.0, 1 - abs(zn + 0.35) * 3)
        return (x, y, z)

    return f


def build_head(c, face, *, ears=True, ear_kind='round'):
    """Head mesh with a front-projected anime face texture; returns the head object."""
    b = c.b
    hr = b.hr
    hc = b.hc
    skin = face['skin']
    m_skin = c.m('skin', skin)
    f = dict(face)
    f.setdefault('half', hr * 1.02)
    f.setdefault('cz', -hr * 0.28)
    f.setdefault('eye_s', hr * 0.235)
    f.setdefault('eye_x', hr * 0.42)
    f.setdefault('eye_z', -hr * 0.2)
    if b.chibi:
        f['eye_s'] = hr * 0.26
        f['eye_x'] = hr * 0.43
        f['eye_z'] = -hr * 0.28
    img = L.paint_face(c.name, f)
    m_face = c.m('face', skin, tex=img)
    head = L.blob('head', hc, (hr, hr, hr), segs=(28, 20), deform=head_deform(hr, jaw=f.get('jaw', 0.62)))
    head.data.materials.append(m_face)
    head.data.materials.append(m_skin)
    L.subdivide(head, 1)
    # UVs in head space (the face texture is painted around the cranium centre)
    me = head.data
    for v in me.vertices:
        v.co -= hc
    L.project_front(head, 0.0, f['cz'], f['half'], 0, 1, front_limit=hr * 0.25)
    for v in me.vertices:
        v.co += hc
    me.update()
    c.add('head', head)
    # neck
    neck = tube('neck', [V((0, 0.012, b.neck - 0.04)), V((0, 0.01, b.neck_top + hr * 0.25))],
                hr * 0.36, hr * 0.33, n=12, mat=m_skin, subd=1)
    c.add('head', neck)
    if ears:
        for sx in (-1, 1):
            if ear_kind == 'elf':
                e = tube('ear', [hc + V((sx * hr * 0.9, 0.01, -hr * 0.2)), hc + V((sx * hr * 1.35, 0.03, hr * 0.15))],
                         [(0, hr * 0.14), (0.5, hr * 0.1), (1, 0)], hr * 0.05, n=8, side=(0, 0, 1), mat=m_skin)
            else:
                e = L.blob('ear', hc + V((sx * hr * 0.93, 0.012, -hr * 0.25)), (hr * 0.09, hr * 0.13, hr * 0.2),
                           mat=m_skin, segs=(10, 8))
            c.add('head', e)
    return head


# ---------------------------------------------------------------------------------------------
# hair


def hair_pt(b, az, el, rk):
    return b.hc + D(az, el) * (b.hr * rk)


def hair_lock(c, name, sph, width, mat, *, thick=None, piv='head', n=6, tip=0.0, belly=0.3, keep=False, add=True):
    """A lock through spherical points (az, el, rk) around the cranium; tip extends past the end."""
    b = c.b
    pts = [hair_pt(b, *p) for p in sph]
    path = spline(pts, steps=3)
    root = pts[0]
    out = (root - b.hc).normalized()
    d = (path[1] - path[0]).normalized()
    side = d.cross(out)
    if side.length < 1e-4:
        side = V((1, 0, 0))
    th = thick if thick is not None else width * 0.42
    rx = [(0, width * 0.8), (belly, width), (0.72, width * 0.62), (1, width * tip)]
    ry = [(0, th), (belly, th * 1.05), (0.8, th * 0.55), (1, th * tip)]
    o = tube(name, path, rx, ry, n=n, side=side, mat=mat, cap0=True, cap1=tip > 0, subd=1)
    if keep:
        c.loose.append((o, piv))
    elif add:
        c.add(piv, o)
    return o


def hair_cap(c, mat, *, front=0.42, nape=-0.78, side_low=-0.2, volume=1.1, back=1.16):
    """The hair mass over the cranium, cut away where the face shows."""
    b = c.b
    hr = b.hr

    def deform(p):
        x, y, z = p
        if y > 0:
            y *= back / volume
        if z < 0:
            x *= 1 - 0.18 * (-z / hr)
        return (x, y, z)

    cap = L.blob('haircap', b.hc + V((0, 0.006, 0.006)), (hr * volume, hr * volume, hr * (volume - 0.02)),
                 segs=(24, 16), deform=deform)
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    kill = []
    for fc in bm.faces:
        d = (fc.calc_center_median() - b.hc).normalized()
        face_zone = d.y < -0.2 and d.z < front - 0.6 * max(0.0, abs(d.x) - 0.45)
        below = d.z < (nape if d.y > 0.3 else side_low + (nape - side_low) * max(0.0, d.y + 0.1) / 0.4)
        if face_zone or below:
            kill.append(fc)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(cap.data)
    bm.free()
    L.set_mat(cap, mat)
    mod = cap.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = hr * 0.06
    mod.offset = -1
    L.apply_mods(cap)
    L.subdivide(cap, 1)
    c.add('head', cap)
    return cap


def bangs(c, mat, *, count=7, spread=58, length=-6, width=None, part=0.0, sweep=8, jag=True, rk=1.12):
    """Front fringe: locks from the crown falling over the forehead."""
    hr = c.b.hr
    w = width or hr * 0.3
    for i in range(count):
        t = i / (count - 1) * 2 - 1  # -1..1
        az = t * spread + part
        el_tip = length + (8 if jag and i % 2 else 0) - abs(t) * 6
        tipaz = az * 1.18 + sweep
        hair_lock(c, f'bang{i}', [(az * 0.4, 72, 1.04), (az * 0.85, 40, rk + 0.04), (tipaz * 0.95, 12, rk),
                                  (tipaz, el_tip, rk - 0.05)], w * (1.05 - 0.25 * abs(t)), mat)


def side_locks(c, mat, *, az=72, length=-70, width=None, rk=1.08, curl=0):
    hr = c.b.hr
    w = width or hr * 0.3
    for sx in (-1, 1):
        hair_lock(c, 'side', [(sx * (az - 25), 55, 1.06), (sx * az, 15, rk + 0.04), (sx * (az + 4), -30, rk),
                              (sx * (az - 4 + curl), length, rk - 0.06)], w, mat)


def back_locks(c, mat, *, count=7, length=-60, flick=0, width=None, rk=1.12, spread=150, out=0.0):
    hr = c.b.hr
    w = width or hr * 0.36
    for i in range(count):
        t = i / (count - 1) * 2 - 1
        az = 180 + t * spread * 0.5
        hair_lock(c, f'back{i}', [(az, 62, 1.05), (az, 25, rk + 0.02), (az + t * 6, -10, rk + out * 0.5),
                                  (az + t * (10 + flick), length, rk + out)], w * (1 - 0.15 * abs(t)), mat)


def crown_spikes(c, mat, *, count=6, width=None, lift=1.0):
    hr = c.b.hr
    w = width or hr * 0.34
    for i in range(count):
        az = 180 + (i - (count - 1) / 2) * (300 / count)
        hair_lock(c, f'crown{i}', [(az * 0.2, 88, 1.0), (az, 62, 1.13), (az, 30 * lift, 1.3 + 0.1 * lift)],
                  w, mat)


def ahoge(c, mat, *, az=10, size=1.0):
    hr = c.b.hr
    hair_lock(c, 'ahoge', [(az, 85, 1.0), (az + 10, 95, 1.35 * size), (az + 160, 80, 1.55 * size)],
              hr * 0.12 * size, mat, thick=hr * 0.04)


def long_back(c, mat, *, to_z, width=None, count=5, spread=0.85, color2=None):
    """Long hair falling down the back to height to_z (world)."""
    b = c.b
    hr = b.hr
    w = width or hr * 0.55
    for i in range(count):
        t = i / (count - 1) * 2 - 1
        az = 180 + t * 60 * spread
        top = hair_pt(b, az, 30, 1.12)
        mid = hair_pt(b, az, -40, 1.18)
        bot = V((top.x * 1.2 + t * 0.02, max(top.y, 0.02) + 0.08 + 0.01 * abs(t), to_z + abs(t) * 0.05))
        pts = spline([hair_pt(b, az, 70, 1.02), top, mid, mid.lerp(bot, 0.5) + V((0, 0.04, 0)), bot], steps=4)
        out = (top - b.hc).normalized()
        side = (pts[1] - pts[0]).normalized().cross(out)
        o = tube(f'long{i}', pts, [(0, w * 0.7), (0.25, w), (0.8, w * 0.75), (1, w * 0.05)],
                 [(0, w * 0.35), (0.3, w * 0.42), (1, w * 0.04)], n=8, side=side, mat=mat, cap1=False, subd=1)
        c.add('head', o)


# ---------------------------------------------------------------------------------------------
# outfit pieces


def torso_keys(b, *, hem_z, hem=(0.0, 0.0), flare=1.0, neck=True, bust=None, collar=0.0):
    """(z, rx, ryb, ryf) keys for a garment from hem to neck."""
    cx, cb, cf = b.chest
    wx, wb, wf = b.waist
    hx, hb, hf = b.hips
    if bust is None:
        bust = cf * (1.25 if b.female else 1.0)
    k = [
        (b.hip_z - 0.03, hx, hb, hf),
        (b.hip_z + (b.sh_z - b.hip_z) * 0.38, wx, wb, wf),
        (b.hip_z + (b.sh_z - b.hip_z) * 0.72, cx, cb, bust),
        (b.sh_z - 0.022, b.sh_x * 1.1, cb * 0.98, cf * 0.9),
        (b.sh_z + 0.014, b.sh_x * 0.9, cb * 0.85, cf * 0.78),
    ]
    if neck:
        k.append((b.neck - 0.005, b.hr * 0.4 + collar, b.hr * 0.38 + collar, b.hr * 0.38 + collar))
    if hem_z < b.hip_z - 0.04:
        hx2 = hem[0] or hx * 1.25 * flare
        hy2 = hem[1] or hb * 1.3 * flare
        mid = (hem_z + b.hip_z) / 2
        k = [(hem_z, hx2, hy2, hy2), (mid, hx + (hx2 - hx) * 0.45, hb + (hy2 - hb) * 0.45, hf + (hy2 - hf) * 0.45)] + k
    return k


def garment(c, name, keys, mat, *, n=18, power=2.2, open_front=None, solid=0.007, piv='body', subd=1,
            cap_top=True, trim=None, hem_trim=None):
    """A garment through (z, rx, ryb, ryf) keys, hem to neck.

    open_front(z) -> half-width of the front opening; open garments are built with a true angular
    gap so the edges run clean, and their edge columns (and hem row) can take trim materials.
    """
    keys = sorted(keys)
    z0, z1 = keys[0][0], keys[-1][0]
    span = z1 - z0
    ts = [(k[0] - z0) / span for k in keys]
    fx = prof(list(zip(ts, [k[1] for k in keys])))
    fb = prof(list(zip(ts, [k[2] for k in keys])))
    ff = prof(list(zip(ts, [k[3] for k in keys])))
    steps = max(8, int(span / 0.045))
    zs = [z0 + span * i / steps for i in range(steps + 1)]
    if open_front is None:
        pts = [V((0, 0, z)) for z in zs]
        o = tube(name, pts, lambda t: fx(t), ry=lambda t: fb(t), ryf=lambda t: ff(t), n=n, power=power, mat=mat,
                 subd=0, cap0=False, cap1=cap_top)
        mats = [mat]
        if hem_trim is not None:
            o.data.materials.append(hem_trim)
            for p in o.data.polygons:
                if p.center.z < z0 + span / steps * 0.99:
                    p.material_index = 1
    else:
        m = n + 6
        e = 2.0 / power
        verts, faces = [], []
        for z in zs:
            t = (z - z0) / span
            rx, rb, rf = fx(t), fb(t), ff(t)
            w = max(open_front(z), 0.004)
            th0 = math.asin(min(0.92, w / rx))
            for k in range(m + 1):
                th = th0 + (2 * math.pi - 2 * th0) * k / m
                sx_, cy = math.sin(th), -math.cos(th)  # th=0 is straight ahead (-Y)
                x = math.copysign(abs(sx_) ** e, sx_) * rx
                y = math.copysign(abs(cy) ** e, cy) * (rf if cy < 0 else rb)
                verts.append(V((x, y, z)))
        cols = m + 1
        for i in range(len(zs) - 1):
            for k in range(m):
                a = i * cols + k
                faces.append((a, a + 1, a + 1 + cols, a + cols))
        o = L._mesh_obj(name, verts, faces, mat)
        L._fix_normals(o)
        mats = [mat]
        for extra in (trim, hem_trim):
            if extra is not None and extra not in mats:
                o.data.materials.append(extra)
                mats.append(extra)
        for fi, p in enumerate(o.data.polygons):
            i, k = divmod(fi, m)
            if trim is not None and (k == 0 or k == m - 1):
                p.material_index = mats.index(trim)
            if hem_trim is not None and i == 0:
                p.material_index = mats.index(hem_trim)
    if subd:
        L.subdivide(o, subd)
    if solid:
        mod = o.modifiers.new('solid', 'SOLIDIFY')
        mod.thickness = solid
        mod.offset = 1
        mod.use_rim = True
        L.apply_mods(o)
    c.add(piv, o)
    return o


def sleeve_arm(c, sx, *, sleeve, hand, cuff=None, wide=1.0, short=False, skin=None, puff=1.0, glove=None):
    """Upper arm + forearm (with cuff) + hand, each on its pivot."""
    b = c.b
    S, E, W = c.shoulder(sx), c.elbow(sx), c.wrist(sx)
    t = 0.045 * b.limb
    s = 'L' if sx < 0 else 'R'
    up = tube('upper', [S + V((0, 0, 0.01)), S.lerp(E, 0.5), E], [(0, t * 1.0 * puff), (0.4, t * 0.95), (1, t * 0.84)],
              n=12, mat=sleeve, subd=1)
    sh = L.blob('shoulder', S + V((-sx * 0.012, 0, -0.012)), (t * 0.95 * puff, t * 0.95, t * 0.9 * puff), mat=sleeve,
                segs=(14, 10))
    c.add('arm' + s, up, sh)
    fore_mat = skin if short else sleeve
    fo = tube('fore', [E, E.lerp(W, 0.5), W], [(0, t * 0.85), (0.5, t * 0.78), (1, t * 0.68 * wide)],
              n=12, mat=fore_mat, subd=1)
    el = L.blob('elbow', E, (t * 0.86, t * 0.86, t * 0.86), mat=sleeve if not short else skin, segs=(12, 8))
    c.add('fore' + s, fo, el)
    if short:
        hem = tube('sleevehem', [S.lerp(E, 0.55), S.lerp(E, 0.75)], t * 1.1, n=12, mat=sleeve, subd=1)
        c.add('arm' + s, hem)
    if cuff:
        cf = tube('cuff', [E.lerp(W, 0.72), W + (W - E).normalized() * 0.012], [(0, t * 0.78), (1, t * 0.95 * wide)],
                  n=12, mat=cuff, subd=1, cap1=False)
        c.add('fore' + s, cf)
    # hand: a soft mitten with a thumb
    dirw = (W - E).normalized()
    H0 = W + dirw * 0.01
    H1 = W + dirw * 0.085 * b.limb ** 0.5
    hm = glove or hand
    palm = tube('hand', [H0, H0.lerp(H1, 0.5), H1], [(0, t * 0.55), (0.45, t * 0.68), (1, t * 0.3)],
                [(0, t * 0.4), (0.5, t * 0.36), (1, t * 0.18)], n=10, side=(0, 1, 0), mat=hm, subd=1)
    th = tube('thumb', [H0 + V((0, -t * 0.25, 0)), H0 + V((sx * -0.01, -t * 0.62, -0.03))],
              [(0, t * 0.22), (1, t * 0.12)], n=8, mat=hm, subd=1)
    c.add('fore' + s, palm, th)
    return H1


def leg(c, sx, *, pants, boot, boot_top=None, cuff=None, skin=None, bare_knee=False, heel=0.0, toe=1.0, thick=1.0):
    b = c.b
    s = 'L' if sx < 0 else 'R'
    Hp, K, A = V((sx * b.hip_x, 0, b.hip_z + 0.03)), c.knee(sx), c.ankle(sx)
    t = 0.06 * b.limb * thick
    thigh = tube('thigh', [Hp, Hp.lerp(K, 0.5), K], [(0, t * 1.12), (0.5, t * 0.95), (1, t * 0.75)], n=12,
                 mat=pants, subd=1)
    c.add('leg' + s, thigh)
    kn = L.blob('knee', K, (t * 0.76, t * 0.76, t * 0.76), mat=skin if bare_knee else pants, segs=(12, 8))
    shin = tube('shin', [K, K.lerp(A, 0.45) + V((0, 0.006, 0)), A],
                [(0, t * 0.74), (0.35, t * 0.72), (1, t * 0.52)], n=12, mat=skin if bare_knee else pants, subd=1)
    c.add('shin' + s, kn, shin)
    bt = boot_top if boot_top is not None else 0.35
    top = K.lerp(A, 1 - bt)
    if bt > 0.01:
        shaft = tube('bootshaft', [top, A], [(0, t * 0.8), (1, t * 0.66)], n=12, mat=boot, subd=1, cap0=False)
        c.add('shin' + s, shaft)
        if cuff:
            cu = tube('bootcuff', [top + V((0, 0, -0.01)), top + V((0, 0, 0.022))], t * 0.86, n=12, mat=cuff, subd=1)
            c.add('shin' + s, cu)
    foot_len = 0.13 * b.limb ** 0.5 * toe
    F0 = A + V((0, 0.025, -b.ankle * 0.45))
    F1 = V((A.x, -foot_len, 0.03 * b.limb ** 0.5))
    ft = tube('foot', [F0, F0.lerp(F1, 0.5) + V((0, 0, 0.01)), F1],
              [(0, t * 0.62), (0.6, t * 0.66), (1, t * 0.36)], [(0, t * 0.62), (0.5, t * 0.5), (1, t * 0.3)],
              n=12, side=(1, 0, 0), mat=boot, subd=1)
    sole = tube('sole', [F0 + V((0, 0.02, -0.035)), F1 + V((0, -0.008, -0.022))],
                [(0, t * 0.6), (1, t * 0.4)], [(0, 0.012), (1, 0.01)], n=10, side=(1, 0, 0),
                mat=c.m('sole', '#3A2A30'), subd=1)
    c.add('shin' + s, ft, sole)


def belt(c, z, mat, *, rx, ry, h=0.022, t=0.01, buckle=None, tilt=0.0):
    o = ring('belt', V((0, 0.0, z)), rx, ry, h, thick_z=t, n=6, segs=28, mat=mat, subd=1, rot=(tilt, 0, 0))
    c.add('body', o)
    if buckle:
        bk = L.box('buckle', V((0, -ry - t * 0.6, z)), (h * 1.6, t * 1.2, h * 1.7), mat=buckle, bevel=0.003)
        c.add('body', bk)


# ---------------------------------------------------------------------------------------------
# Itsuki (and his mirror)


ITSUKI = dict(hair='#3F4E9E', hair_hi='#5A6CC4', coat='#EADFC8', lining='#CDBF9F', sleeve='#E2D6BC', cuff='#C9B994',
              inner='#2E2A55', scarf='#4FC9DD', scarf2='#3BB3C8', stripe='#1E6E7C', iris='#E8A33D',
              pants='#2B2547', boots='#6B4632', bootcuff='#8A5E3F', brow='#2E3A7A')
MIRROR = dict(ITSUKI, hair='#CFC8EA', hair_hi='#EDE8FF', coat='#4A4370', lining='#3A3366', sleeve='#463F6C',
              cuff='#5A4A8E', inner='#1E1A38', scarf='#FF7AB6', scarf2='#FF8DC0', stripe='#B0306E',
              iris='#FF3D8B', brow='#8F86B8')


def build_itsuki(mirror=False, export=True):
    P = MIRROR if mirror else ITSUKI
    c = Char('itsuki_mirror' if mirror else 'itsuki', B('teen_m'))
    b = c.b
    skin = '#FBE3D3' if not mirror else '#E9E4F7'
    c.m('skin', skin)
    build_head(c, dict(skin=skin, iris=P['iris'], lash='#22183A', brow=P['brow'], style='sharp' if mirror else 'bright',
                       mouth='smirk' if mirror else 'smile', blush='#FF9DB0'))
    hair = c.m('hair', P['hair'])
    hair_cap(c, hair, front=0.5)
    bangs(c, hair, count=7, spread=56, length=-4, part=-6, sweep=4)
    side_locks(c, hair, az=74, length=-62)
    back_locks(c, hair, count=7, length=-58, flick=14, out=0.1)
    back_locks(c, hair, count=6, length=-72, flick=-8, out=-0.04, rk=1.04, spread=110, width=b.hr * 0.3)
    crown_spikes(c, hair, count=6, lift=0.9)
    ahoge(c, hair, az=12, size=1.0)
    # the memory streak: white locks laid over the blue, revealed as he forgets
    white = c.m('streak', '#F4F1FF')
    hr = b.hr
    s1 = hair_lock(c, 'streak1', [(8, 74, 1.1), (14, 42, 1.24), (19, 12, 1.2), (22, -4, 1.12)], hr * 0.27, white,
                   keep=True)
    s2 = L.join([
        hair_lock(c, 's2a', [(30, 72, 1.1), (40, 40, 1.24), (50, 10, 1.21), (56, -12, 1.13)], hr * 0.3, white, add=False),
        hair_lock(c, 's2b', [(45, 70, 1.12), (62, 40, 1.24), (74, 8, 1.19), (79, -40, 1.13)], hr * 0.3, white,
                  add=False),
    ], 'streak2')
    c.loose.append((s2, 'head'))
    s3 = L.join([
        hair_lock(c, 's3a', [(-25, 72, 1.1), (-36, 42, 1.24), (-46, 12, 1.21), (-50, -8, 1.13)], hr * 0.3, white,
                  add=False),
        hair_lock(c, 's3b', [(-150, 60, 1.12), (-160, 25, 1.2), (-166, -15, 1.2), (-172, -50, 1.24)], hr * 0.34,
                  white, add=False),
        hair_lock(c, 's3c', [(-60, 66, 1.12), (-80, 30, 1.21), (-95, -5, 1.2), (-100, -38, 1.18)], hr * 0.3, white,
                  add=False),
    ], 'streak3')
    c.loose.append((s3, 'head'))
    _ = s1

    # outfit: scribe's coat over a navy shirt
    coat = c.m('coat', P['coat'])
    lining = c.m('lining', P['lining'])
    inner = c.m('inner', P['inner'])
    keys = torso_keys(b, hem_z=0.5, flare=1.05)
    garment(c, 'coat', keys, coat,
            open_front=lambda z: 0.006 if z > 1.16 else 0.006 + (1.16 - z) * 0.14,
            solid=0.008, trim=lining, hem_trim=lining)
    ik = [(z, rx * 0.95, rb * 0.95, rf * 0.97) for z, rx, rb, rf in torso_keys(b, hem_z=b.hip_z)]
    garment(c, 'inner', ik, inner, solid=0, n=16)
    belt(c, b.hip_z + 0.115, c.m('belt', '#7A5236'), rx=b.waist[0] * 0.93, ry=b.waist[2] * 0.97,
         buckle=c.m('gold', '#E8C46A', rough=0.4))
    # scarf (it records every spell he learns)
    scarf = c.m('scarf', P['scarf'])
    scarf2 = c.m('scarf2', P['scarf2'])
    stripe = c.m('stripe', P['stripe'])
    nz = b.neck - 0.005
    c.add('body', ring('wrap1', V((0, 0.0, nz)), hr * 0.52, hr * 0.5, 0.032, thick_z=0.02, n=10, mat=scarf,
                       power=3.0, rot=(4, 0, 0)))
    c.add('body', ring('wrap2', V((0, -0.004, nz + 0.05)), hr * 0.47, hr * 0.45, 0.026, thick_z=0.018, n=10,
                       mat=scarf2, rot=(-10, 0, 0), power=3.0))
    c.add('body', ring('wrapline', V((0, 0.0, nz + 0.004)), hr * 0.545, hr * 0.525, 0.004, thick_z=0.0195, n=6,
                       mat=stripe, power=3.0, rot=(4, 0, 0)))
    tail = spline([V((0.045, -0.066, nz - 0.005)), V((0.066, -0.1, nz - 0.1)), V((0.1, -0.108, nz - 0.2)),
                   V((0.15, -0.09, nz - 0.3))], steps=4)
    c.add('body', tube('scarftail', tail, [(0, 0.026), (0.5, 0.03), (0.9, 0.034), (1, 0.03)],
                       [(0, 0.009), (1, 0.006)], n=8, side=(1, 0, -0.5), mat=scarf, subd=1))
    for tt in (0.7, 0.84):
        i = int(tt * (len(tail) - 1))
        seg = [tail[i], tail[i].lerp(tail[i + 1], 0.45)]
        c.add('body', tube('band', seg, 0.036, 0.0105, n=8, side=(1, 0, -0.5), mat=stripe, subd=1))
    # satchel strap + satchel with a little slab
    leather = c.m('leather', '#8A5E3F')
    flap = c.m('flap', '#6E4730')
    strap = spline([V((0.12, -0.03, 1.25)), V((0.06, -0.1, 1.13)), V((-0.06, -0.112, 0.98)), V((-0.15, -0.07, 0.84))],
                   steps=4)
    c.add('body', tube('strap', strap, 0.014, 0.004, n=6, side=(0.6, 0, 0.8), mat=c.m('belt'), subd=1))
    c.add('body', L.box('satchel', V((-0.178, -0.035, 0.79)), (0.055, 0.15, 0.12), mat=leather, bevel=0.012, segs=3))
    c.add('body', L.box('flap', V((-0.181, -0.035, 0.825)), (0.06, 0.155, 0.06), mat=flap, bevel=0.01, segs=3))
    slab = c.m('slab', '#8E89AE')
    c.add('body', L.box('miniSlab', V((-0.172, 0.0, 0.875)), (0.02, 0.055, 0.07), mat=slab, bevel=0.006))
    glyph = c.m('glyph', '#8FF3FF', emit='#8FF3FF', strength=2.0)
    for k in range(2):
        c.add('body', L.box('glyphline', V((-0.183, 0.0, 0.885 - k * 0.02)), (0.002, 0.035, 0.006), mat=glyph))
    # arms
    hand = c.m('skin')
    for sx in (-1, 1):
        sleeve_arm(c, sx, sleeve=c.m('sleeve', P['sleeve']), hand=hand, cuff=c.m('cuff', P['cuff']), wide=1.3)
    # Lethe's sigil on his right hand (+X)
    sig = c.m('sigil', '#FF7AB6', emit='#FF7AB6', strength=3.0)
    W = c.wrist(1)
    E = c.elbow(1)
    hc = W + (W - E).normalized() * 0.045 + V((0.022, 0, 0))
    c.add('foreR', ring('sigil', hc, 0.02, 0.02, 0.0035, thick_z=0.0035, n=6, segs=20, mat=sig, subd=0, rot=(0, 90, 0)))
    c.add('foreR', L.blob('sigilstar', hc + V((0.003, 0, 0)), (0.004, 0.008, 0.008), mat=sig, segs=(8, 6)))
    # legs
    for sx in (-1, 1):
        leg(c, sx, pants=c.m('pants', P['pants']), boot=c.m('boots', P['boots']), boot_top=0.62,
            cuff=c.m('bootcuff', P['bootcuff']))
    return c.finish(export=export)
