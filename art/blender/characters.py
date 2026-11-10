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
    'chibi': dict(h=1.2, hr=0.2, sh_x=0.105, sh_z=0.69, neck=0.735, hip_x=0.055, hip_z=0.42,
                  knee=0.22, ankle=0.05, elbow=0.53, wrist=0.42, limb=0.8, chest=(0.1, 0.075, 0.08),
                  waist=(0.088, 0.066, 0.068), hips=(0.1, 0.075, 0.075), female=True, chibi=True),
}


# Head scale per body kind, after the newest Genshin Impact cast: slender adults about seven
# heads tall, teens about six and a half; children and the chibi devil keep their big heads.
HEAD_K = {'teen_m': 0.92, 'teen_f': 0.92, 'adult_f': 0.9, 'adult_m': 0.9, 'big_m': 0.92, 'kid': 1.0}


class B:
    """Derived measurements for one body. raw=True skips the anime head scale (creatures)."""

    def __init__(self, kind, raw=False, **over):
        d = dict(BODIES[kind])
        # a different height scales every vertical landmark not given explicitly
        if 'h' in over:
            k = over['h'] / d['h']
            for key in ('sh_z', 'neck', 'hip_z', 'knee', 'ankle', 'elbow', 'wrist'):
                if key not in over:
                    d[key] *= k
        d.update(over)
        for k, v in d.items():
            setattr(self, k, v)
        self.kind = kind
        self.chibi = d.get('chibi', False)
        if not self.chibi and not raw:
            # a smaller head on the same height: the chin rises, and the body below it stretches to
            # meet it (longer torso and legs, the neck keeps its length)
            hr0 = self.hr
            self.hr = hr0 * HEAD_K.get(kind, 1.0)
            k = (self.h - 0.025 - 2.3 * self.hr) / (self.h - 0.025 - 2.3 * hr0)
            for key in ('sh_z', 'neck', 'hip_z', 'knee', 'elbow', 'wrist'):
                setattr(self, key, getattr(self, key) * k)
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
        self.joint_over = {}

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
        J.update(self.joint_over)
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

    def finish(self, export=True, draco=True):
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


def build_head(c, face, *, ears=True, ear_kind='round', neck=True):
    """Head mesh with a front-projected anime face texture; returns the head object."""
    b = c.b
    hr = b.hr
    hc = b.hc
    skin = face['skin']
    m_skin = c.m('skin', skin)
    f = dict(face)
    f.setdefault('half', hr * 1.02)
    f.setdefault('cz', -hr * 0.28)
    f.setdefault('size', 768)
    f.setdefault('eye_s', hr * 0.25)
    f.setdefault('eye_x', hr * 0.42)
    f.setdefault('eye_z', -hr * 0.22)
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
    if not neck:
        return head
    nk = tube('neck', [V((0, 0.012, b.neck - 0.04)), V((0, 0.01, b.neck_top + hr * 0.25))],
              hr * 0.36, hr * 0.33, n=12, mat=m_skin, subd=1)
    c.add('head', nk)
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


def hair_cap(c, mat, *, front=0.42, nape=-0.78, side_low=-0.2, volume=1.15, back=1.2):
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


def bangs(c, mat, *, count=7, spread=58, length=-6, width=None, part=0.0, sweep=8, jag=True, rk=1.17, clear=None):
    """Front fringe: locks from the crown falling over the forehead.

    clear: azimuth of the eye centres; a lock whose tip would cross an eye stops just above it, so
    long bangs fall between and beside the eyes (Genshin style) without hiding them.
    """
    hr = c.b.hr
    w = width or hr * 0.3
    for i in range(count):
        t = i / (count - 1) * 2 - 1  # -1..1
        az = t * spread + part
        el_tip = length + (8 if jag and i % 2 else 0) - abs(t) * 6
        tipaz = az * 1.18 + sweep
        if clear is not None and min(abs(tipaz - clear), abs(tipaz + clear)) < 13:
            el_tip = max(el_tip, -2)
        hair_lock(c, f'bang{i}', [(az * 0.4, 72, 1.04), (az * 0.85, 40, rk + 0.04), (tipaz * 0.95, 12, rk),
                                  (tipaz, el_tip, rk - 0.05)], w * (1.05 - 0.25 * abs(t)), mat)


def side_locks(c, mat, *, az=72, length=-70, width=None, rk=1.13, curl=0):
    hr = c.b.hr
    w = width or hr * 0.3
    for sx in (-1, 1):
        hair_lock(c, 'side', [(sx * (az - 25), 55, 1.06), (sx * az, 15, rk + 0.04), (sx * (az + 4), -30, rk),
                              (sx * (az - 4 + curl), length, rk - 0.06)], w, mat)


def back_locks(c, mat, *, count=7, length=-60, flick=0, width=None, rk=1.17, spread=150, out=0.0):
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


ITSUKI = dict(hair='#3F4E9E', hair_hi='#5A6CC4', coat='#EADFC8', lining='#2F7C8C', sleeve='#E2D6BC', cuff='#E2BE6A',
              inner='#2E2A55', scarf='#4FC9DD', scarf2='#3BB3C8', stripe='#1E6E7C', iris='#E8A33D',
              pants='#2B2547', boots='#6B4632', bootcuff='#D9B25E', brow='#2E3A7A', gold='#E8C46A', gem='#5FE3F0',
              glove='#2E2A55')
MIRROR = dict(ITSUKI, hair='#CFC8EA', hair_hi='#EDE8FF', coat='#4A4370', lining='#B0306E', sleeve='#463F6C',
              cuff='#B8A6E8', inner='#1E1A38', scarf='#FF7AB6', scarf2='#FF8DC0', stripe='#B0306E',
              iris='#FF3D8B', brow='#8F86B8', gold='#C9C2E8', gem='#FF3D8B', glove='#1E1A38', bootcuff='#B8A6E8')


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
    bangs(c, hair, count=9, spread=58, length=-17, part=-6, sweep=4, width=b.hr * 0.26, clear=25)
    side_locks(c, hair, az=74, length=-62)
    side_locks(c, hair, az=50, length=-52, width=b.hr * 0.2, rk=1.1)  # face-framing strands at the cheeks
    back_locks(c, hair, count=7, length=-58, flick=14, out=0.1)
    back_locks(c, hair, count=6, length=-72, flick=-8, out=-0.04, rk=1.09, spread=110, width=b.hr * 0.3)
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
    gold = c.m('gold', P['gold'], rough=0.35)
    garment(c, 'coat', keys, coat,
            open_front=lambda z: 0.006 if z > 1.16 else 0.006 + (1.16 - z) * 0.14,
            solid=0.008, trim=gold, hem_trim=gold)
    _ = lining
    ik = [(z, rx * 0.95, rb * 0.95, rf * 0.97) for z, rx, rb, rf in torso_keys(b, hem_z=b.hip_z)]
    garment(c, 'inner', ik, inner, solid=0, n=16)
    belt(c, b.hip_z + 0.115, c.m('belt', '#7A5236'), rx=b.waist[0] * 0.93, ry=b.waist[2] * 0.97, buckle=gold)
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
    # a jewelled brooch pinning the scarf, and a fine chain across to the coat
    gem = c.m('gem', P['gem'], emit=P['gem'], strength=1.6)
    bp = V((0.034, -hr * 0.66, nz - 0.012))
    c.add('body', ring('brooch', bp, 0.017, 0.017, 0.0045, thick_z=0.0045, n=6, segs=20, mat=gold, subd=0,
                       rot=(90, 0, 0)))
    c.add('body', L.blob('broochgem', bp + V((0, -0.002, 0)), (0.011, 0.006, 0.013), mat=gem, segs=(10, 8)))
    for sx_, dz in ((-1, 0), (1, 0)):
        c.add('body', tube('broochpt', [bp + V((sx_ * 0.016, 0, dz)), bp + V((sx_ * 0.03, 0.002, dz - 0.004))],
                           [(0, 0.006), (1, 0.0)], 0.003, n=6, side=(0, 0, 1), mat=gold, cap1=False))
    chain = spline([bp + V((-0.012, 0.0, -0.012)), V((-0.02, -b.chest[2] - 0.03, nz - 0.1)),
                    V((-0.075, -b.chest[2] - 0.02, nz - 0.12))], steps=6)
    c.add('body', tube('chain', chain, 0.0028, n=6, mat=gold, subd=0))
    hp = b.hc + D(58, 26) * hr * 1.2
    c.add('head', L.box('hairpin', hp, (0.006, 0.05, 0.012), mat=gold, bevel=0.003, rot=(0, 0, 30)))
    c.add('head', L.blob('pingem', hp + D(58, 26) * 0.006, (0.009, 0.009, 0.009), mat=gem, segs=(10, 8)))
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
        sleeve_arm(c, sx, sleeve=c.m('sleeve', P['sleeve']), hand=hand, cuff=c.m('cuff', P['cuff']), wide=1.3,
                   glove=c.m('glove', P['glove']))
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
        # a gold strap across each boot
        A = c.ankle(sx)
        c.add('shin' + ('L' if sx < 0 else 'R'), ring('bootstrap', A + V((0, -0.004, 0.05)), 0.047, 0.047, 0.006,
                                                      thick_z=0.012, n=6, segs=20, mat=c.m('bootcuff'), subd=0))
    return c.finish(export=export)


# ---------------------------------------------------------------------------------------------
# more hair styles


def hair_spiky(c, mat, *, lift=1.0, back_len=-58, wild=1.0, part=-6):
    hair_cap(c, mat, front=0.5)
    bangs(c, mat, count=9, spread=58, length=-15, part=part, sweep=4, width=c.b.hr * 0.26, clear=25)
    side_locks(c, mat, az=74, length=-58)
    side_locks(c, mat, az=50, length=-50, width=c.b.hr * 0.2, rk=1.1)
    back_locks(c, mat, count=7, length=back_len, flick=14 * wild, out=0.12 * wild)
    back_locks(c, mat, count=6, length=back_len - 14, flick=-8, out=-0.04, rk=1.09, spread=110, width=c.b.hr * 0.3)
    crown_spikes(c, mat, count=7, lift=lift)


def hair_bob(c, mat, *, length=-78, curl=10, part=0, count=9, fringe=-8):
    hr = c.b.hr
    hair_cap(c, mat, front=0.48, volume=1.17, back=1.24)
    bangs(c, mat, count=count, spread=60, length=fringe - 7, part=part, sweep=0, rk=1.18, width=hr * 0.27, clear=25)
    for sx in (-1, 1):
        for k, az in enumerate((62, 82, 104)):
            hair_lock(c, 'bobside', [(sx * (az - 30), 58, 1.08), (sx * az, 20, 1.2), (sx * (az + 4), -30, 1.22),
                                     (sx * (az - curl), length + k * 6, 1.12)], hr * 0.42, mat)
    for i in range(7):
        t = i / 6 * 2 - 1
        az = 180 + t * 64
        hair_lock(c, 'bobback', [(az, 60, 1.08), (az, 20, 1.2), (az, -30, 1.24), (az - t * curl, length + 4, 1.12)],
                  hr * 0.5, mat)


def hair_long(c, mat, *, to_z, part=0.0, fringe=-6, side_len=-110, count=9, spread=0.9):
    hr = c.b.hr
    hair_cap(c, mat, front=0.46, volume=1.15, back=1.20)
    bangs(c, mat, count=count, spread=62, length=fringe - 8, part=part, sweep=-part * 0.3, rk=1.17, width=hr * 0.26,
          clear=25)
    for sx in (-1, 1):
        hair_lock(c, 'longside', [(sx * 50, 60, 1.08), (sx * 74, 18, 1.18), (sx * 80, -40, 1.2), (sx * 78, side_len, 1.3)],
                  hr * 0.38, mat)
        pts = [hair_pt(c.b, sx * 86, -30, 1.15), hair_pt(c.b, sx * 92, -95, 1.4)]
        bot = V((sx * (c.b.hr * 1.05), -0.02, max(to_z + 0.1, c.b.sh_z - 0.25)))
        o = tube('frontlong', spline([pts[0], pts[1], bot], steps=4), [(0, hr * 0.32), (0.4, hr * 0.38), (1, 0.0)],
                 [(0, hr * 0.13), (1, 0.0)], n=6, side=(0, 1, 0), mat=mat, cap1=False)
        c.add('head', o)
    long_back(c, mat, to_z=to_z, count=7, spread=spread)


def hair_ponytail(c, mat, *, tie, to_z, side=1, fringe=-10, part=12):
    """Mom's low side ponytail draped over one shoulder."""
    hr = c.b.hr
    b = c.b
    hair_cap(c, mat, front=0.46, volume=1.14, back=1.22)
    bangs(c, mat, count=9, spread=58, length=fringe - 6, part=part, sweep=-6, rk=1.16, width=hr * 0.26, clear=25)
    side_locks(c, mat, az=76, length=-64, width=hr * 0.26)
    side_locks(c, mat, az=50, length=-52, width=hr * 0.19, rk=1.1)
    root = hair_pt(b, side * 140, -40, 1.12)
    c.add('head', L.blob('tie', root, (hr * 0.13, hr * 0.13, hr * 0.13), mat=tie, segs=(10, 8)))
    sh = V((side * b.sh_x * 0.62, -0.075, b.sh_z + 0.01))
    pts = spline([root, root + V((side * 0.05, 0.02, -0.08)), sh, V((side * b.sh_x * 0.55, -0.11, to_z))], steps=5)
    o = tube('ponytail', pts, [(0, hr * 0.2), (0.25, hr * 0.38), (0.75, hr * 0.32), (1, 0.0)],
             [(0, hr * 0.2), (0.3, hr * 0.26), (1, 0.0)], n=8, side=(1, 0, 0), mat=mat, cap1=False)
    c.add('body', o)


def hood(c, mat, *, trim=None, rk=1.34, point=0.25, drape=True):
    """A deep hood around the head with a trimmed rim and a drape onto the shoulders."""
    b = c.b
    hr = b.hr

    def deform(p):
        x, y, z = p
        if y > 0:
            k = y / (hr * rk)
            y *= 1.0 + 0.32 * k
            if z > 0:
                z += k * hr * point * 1.6 * (z / (hr * rk)) ** 1.5
                y += k * hr * point * 0.8 * (z / (hr * rk))
            else:
                z *= 1 + 0.55 * k
        return (x, y, z)

    o = L.blob('hood', b.hc + V((0, 0.012, 0.012)), (hr * rk, hr * rk, hr * rk * 1.04), segs=(24, 16), deform=deform)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    kill = [f for f in bm.faces if (lambda d: (d.y < -0.35 and d.z < 0.62 - 0.3 * abs(d.x)) or d.z < (-0.85 if d.y > 0.2 else -0.62))(
        (f.calc_center_median() - b.hc).normalized())]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    L.set_mat(o, mat)
    if trim is not None:
        o.data.materials.append(trim)
        for p in o.data.polygons:
            d = (p.center - b.hc).normalized()
            if d.y < -0.15 and d.z < 0.75:
                p.material_index = 1
    mod = o.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = hr * 0.08
    mod.offset = -1
    L.apply_mods(o)
    L.subdivide(o, 1)
    c.add('head', o)
    # the hood's point, falling down the back so it reads as cloth, not a helmet
    R = hr * rk
    tail = spline([b.hc + V((0, R * 1.0, R * 0.72)), b.hc + V((0, R * 1.42, R * 0.0)),
                   b.hc + V((0, R * 1.4, -R * 0.85)), b.hc + V((0, R * 1.22, -R * 1.65))], steps=5)
    c.add('head', tube('hoodtail', tail, [(0, R * 0.62), (0.45, R * 0.48), (1, 0.0)], [(0, R * 0.2), (1, R * 0.05)],
                       n=10, side=(1, 0, 0), mat=mat, cap1=False))
    if trim is not None:
        c.add('head', tube('hoodseam', [q + (q - b.hc).normalized() * R * 0.04 + V((0, R * 0.08, 0)) for q in tail[:-2]],
                           [(0, hr * 0.03), (1, hr * 0.02)], n=6, mat=trim, subd=0))
    if drape:
        keys = [(b.sh_z - 0.09, b.sh_x * 1.28, b.chest[1] * 1.45, b.chest[2] * 1.35),
                (b.sh_z + 0.0, b.sh_x * 1.1, b.chest[1] * 1.2, b.chest[2] * 1.15),
                (b.neck + 0.02, hr * 0.85, hr * 0.8, hr * 0.8)]
        garment(c, 'mantle', keys, mat, n=20, solid=0.01, cap_top=False, hem_trim=trim)


# ---------------------------------------------------------------------------------------------
# accessories


def eye_world(c, sx, face):
    b = c.b
    hr = b.hr
    ex = face.get('eye_x', hr * (0.43 if b.chibi else 0.42))
    ez = face.get('eye_z', -hr * (0.28 if b.chibi else 0.2))
    return b.hc + V((sx * ex, -hr * 0.9, ez))


def glasses(c, face, color, *, r=None):
    hr = c.b.hr
    m = c.m('glasses', color, rough=0.35)
    r = r or hr * 0.27
    pts = []
    for sx in (-1, 1):
        e = eye_world(c, sx, face) + V((0, -hr * 0.12, 0))
        pts.append(e)
        c.add('head', ring('lens', e, r, r * 0.82, 0.0035, thick_z=0.0035, n=6, segs=24, mat=m, subd=0, rot=(90, 0, 0)))
        temple = [e + V((sx * r, 0, 0)), e + V((sx * r * 1.3, hr * 0.5, hr * 0.02)), c.b.hc + V((sx * hr * 1.0, hr * 0.1, -hr * 0.15))]
        c.add('head', tube('temple', temple, 0.0028, n=6, mat=m, subd=0, cap0=False, cap1=False))
    bridge = [pts[0] + V((r, 0, r * 0.15)), (pts[0] + pts[1]) / 2 + V((0, -0.002, r * 0.3)), pts[1] + V((-r, 0, r * 0.15))]
    c.add('head', tube('bridge', spline(bridge, steps=3), 0.0028, n=6, mat=m, subd=0))


def horns(c, color, *, kind='curl', size=1.0, az=34, el=58, glow=None):
    b = c.b
    hr = b.hr
    m = c.m('horn', color, rough=0.45)
    for sx in (-1, 1):
        base = hair_pt(b, sx * az, el, 1.07)
        out = (base - b.hc).normalized()
        if kind == 'curl':  # ram-ish curl back and down
            pts = [base, base + out * hr * 0.35 * size + V((sx * 0.02, 0.03, 0.02)) * size,
                   base + V((sx * 0.07, 0.07, 0.0)) * size, base + V((sx * 0.05, 0.08, -0.05)) * size]
        elif kind == 'swept':  # swept back like a crown of blades
            pts = [base, base + out * hr * 0.4 * size, base + V((sx * 0.04, 0.09, 0.08)) * size,
                   base + V((sx * 0.05, 0.16, 0.1)) * size]
        else:  # straight up and a little out
            pts = [base, base + out * hr * 0.3 * size, base + V((sx * 0.035, 0.01, 0.1)) * size,
                   base + V((sx * 0.05, 0.0, 0.16)) * size]
        o = tube('horn', spline(pts, steps=4), [(0, hr * 0.13 * size), (0.5, hr * 0.09 * size), (1, 0.0)], n=8,
                 mat=m, cap1=False)
        c.add('head', o)
        if glow:
            g = c.m('hornglow', glow, emit=glow, strength=2.0)
            tip = spline(pts, steps=4)
            c.add('head', tube('hornband', [tip[3], tip[4]], hr * 0.105 * size, n=8, mat=g, subd=1))


def crown(c, gold, gem, *, r=None, h=None, spikes=5):
    b = c.b
    hr = b.hr
    r = r or hr * 0.62
    h = h or hr * 0.32
    m = c.m('gold', gold, rough=0.35)
    g = c.m('gem', gem, emit=gem, strength=2.5)
    top = b.hc + V((0, 0.01, hr * 0.98))
    c.add('head', ring('crownband', top, r, r, h * 0.35, thick_z=0.006, n=8, segs=32, mat=m, power=3))
    for i in range(spikes):
        a = math.pi * 2 * i / spikes - math.pi / 2
        p = top + V((math.cos(a) * r, math.sin(a) * r, 0))
        c.add('head', tube('spike', [p, p + V((0, 0, h))], [(0, hr * 0.12), (1, 0.0)], hr * 0.05, n=6,
                           side=(-math.sin(a), math.cos(a), 0), mat=m, subd=1))
    c.add('head', L.blob('crowngem', top + V((0, -r - 0.008, 0.004)), (hr * 0.09, hr * 0.05, hr * 0.11), mat=g,
                         segs=(10, 8)))


def tiara(c, gold, gem):
    b = c.b
    hr = b.hr
    m = c.m('gold', gold, rough=0.35)
    g = c.m('gem', gem, emit=gem, strength=2.5)
    pts = [hair_pt(b, az, 52 + 10 * math.cos(math.radians(az * 2)), 1.16) for az in range(-70, 71, 14)]
    c.add('head', tube('tiara', spline(pts, steps=3), 0.006, 0.004, n=6, side=(0, 0, 1), mat=m, subd=1))
    c.add('head', L.blob('tiaragem', hair_pt(b, 0, 64, 1.2), (0.016, 0.01, 0.02), mat=g, segs=(10, 8)))


def half_mask(c, face, color, *, line=None):
    """A smooth archivist's mask over the upper face, with eye slits."""
    b = c.b
    hr = b.hr
    m = c.m('mask', color, rough=0.4)
    o = L.blob('mask', b.hc, (hr * 1.06, hr * 1.06, hr * 1.06), segs=(28, 20), deform=head_deform(hr * 1.06))
    ez = face.get('eye_z', -hr * 0.2)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    kill = []
    for f in bm.faces:
        p = f.calc_center_median() - b.hc
        keep = p.y < -hr * 0.45 and (ez - hr * 0.36) < p.z < (ez + hr * 0.62)
        for sx in (-1, 1):
            ex = sx * face.get('eye_x', hr * 0.42)
            if abs(p.x - ex) < hr * 0.2 and abs(p.z - ez + hr * 0.02) < hr * 0.06:
                keep = False
        if not keep:
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    L.set_mat(o, m)
    mod = o.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = 0.006
    mod.offset = 1
    L.apply_mods(o)
    L.subdivide(o, 1)
    c.add('head', o)
    if line:
        lm = c.m('maskline', line, emit=line, strength=1.5)
        for sx in (-1, 1):
            e = eye_world(c, sx, face) + V((0, -hr * 0.2, hr * 0.17))
            c.add('head', tube('maskmark', [e + V((-sx * hr * 0.15, 0, 0)), e + V((sx * hr * 0.12, 0, hr * 0.08))],
                               0.0035, n=6, mat=lm, subd=0))


def beard(c, color):
    b = c.b
    hr = b.hr
    m = c.m('beard', color)
    chin = b.hc + V((0, -hr * 0.62, -hr * 1.05))
    c.add('head', L.blob('beard', chin, (hr * 0.62, hr * 0.42, hr * 0.5),
                         deform=lambda p: (p[0] * (1 - 0.35 * max(0.0, -p[2] / (hr * 0.5))), p[1], p[2] * (1.3 if p[2] < 0 else 1)),
                         mat=m, segs=(16, 12)))
    for sx in (-1, 1):
        root = b.hc + V((0, -hr * 0.98, -hr * 0.55))
        pts = [root, root + V((sx * hr * 0.25, -hr * 0.05, -hr * 0.02)), root + V((sx * hr * 0.5, -hr * 0.0, -hr * 0.2))]
        c.add('head', tube('stache', spline(pts, steps=3), [(0, hr * 0.12), (0.5, hr * 0.13), (1, 0.0)], hr * 0.06,
                           n=6, side=(0, 0, 1), mat=m, cap1=False))
        side = [b.hc + V((sx * hr * 0.88, -hr * 0.2, -hr * 0.25)), b.hc + V((sx * hr * 0.75, -hr * 0.45, -hr * 0.8))]
        c.add('head', tube('sideburn', side, [(0, hr * 0.12), (1, hr * 0.22)], hr * 0.1, n=6, mat=m))


def cape(c, outer, inner, *, top_z=None, hem_z=0.3, wrap=72, flare=1.6, collar=True):
    """A cape hanging from the shoulders down the back; inner faces take the lining colour."""
    b = c.b
    top_z = top_z or b.sh_z + 0.01
    zs = [hem_z + (top_z - hem_z) * i / 12 for i in range(13)]
    m = 18
    verts, faces = [], []
    for z in zs:
        t = (z - hem_z) / (top_z - hem_z)
        rx = b.sh_x * (1.12 + (1 - t) * (flare - 1.12))
        ry = b.chest[1] * (1.4 + (1 - t) * (flare - 1.0) * 1.2)
        th0 = math.radians(wrap - 10 * (1 - t))
        for k in range(m + 1):
            th = th0 + (2 * math.pi - 2 * th0) * k / m
            sx_, cy = math.sin(th), -math.cos(th)
            wave = 1 + 0.06 * (1 - t) * math.sin(k * 1.7)
            verts.append(V((sx_ * rx * wave, cy * ry * wave + 0.01, z)))
    cols = m + 1
    for i in range(len(zs) - 1):
        for k in range(m):
            a = i * cols + k
            faces.append((a, a + 1, a + 1 + cols, a + cols))
    o = L._mesh_obj('cape', verts, faces, c.m('cape', outer))
    L._fix_normals(o)
    o.data.materials.append(c.m('capein', inner))
    L.subdivide(o, 1)
    mod = o.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = 0.01
    mod.offset = 1
    mod.material_offset = 1
    L.apply_mods(o)
    c.add('body', o)
    if collar:
        keys = [(b.sh_z - 0.02, b.sh_x * 1.12, b.chest[1] * 1.25, b.chest[2] * 1.2),
                (b.neck + 0.06, b.hr * 0.75, b.hr * 0.72, b.hr * 0.6)]
        garment(c, 'capecollar', keys, c.m('capein'), n=20, solid=0.01, cap_top=False,
                open_front=lambda z: 0.035 + (z - b.sh_z) * 0.5)


def apron(c, color, *, top_z, bot_z, width=1.0, bib=True, string=None):
    b = c.b
    m = c.m('apron', color)
    wx = b.waist
    zs = [bot_z + (top_z - bot_z) * i / 10 for i in range(11)]
    m_cols = 10
    verts, faces = [], []
    waist_z = b.hip_z + (b.sh_z - b.hip_z) * 0.38
    for z in zs:
        below = z < waist_z
        k = (waist_z - z) / max(waist_z - bot_z, 1e-6) if below else 0
        rx = (b.hips[0] * 1.22 + k * 0.05) * width
        ry = (b.hips[2] * 1.18 + k * 0.05) if below else b.chest[2] * 1.12
        half = math.radians(62 if below else 40)
        if not bib and not below:
            continue
        for j in range(m_cols + 1):
            th = -half + 2 * half * j / m_cols
            verts.append(V((math.sin(th) * rx, -math.cos(th) * ry, z)))
    rows = len(verts) // (m_cols + 1)
    for i in range(rows - 1):
        for j in range(m_cols):
            a = i * (m_cols + 1) + j
            faces.append((a, a + 1, a + 2 + m_cols, a + 1 + m_cols))
    o = L._mesh_obj('apron', verts, faces, m)
    L._fix_normals(o)
    L.subdivide(o, 1)
    mod = o.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = 0.006
    mod.offset = 1
    L.apply_mods(o)
    c.add('body', o)
    if string:
        belt(c, waist_z, c.m('apronstring', string), rx=wx[0] * 1.06, ry=wx[2] * 1.12, h=0.01, t=0.006)


def pauldron(c, sx, color, trim=None, size=1.0):
    S = c.shoulder(sx)
    s = 'L' if sx < 0 else 'R'
    t = 0.04 * c.b.limb ** 0.6 * size
    o = L.blob('pauldron', S + V((sx * 0.004, 0, 0.004)), (t * 1.5, t * 1.4, t * 1.0), mat=c.m('pauldron', color),
               segs=(16, 10), deform=lambda p: (p[0], p[1], p[2] if p[2] > 0 else p[2] * 0.4))
    c.add('arm' + s, o)
    if trim:
        c.add('arm' + s, ring('pauldrontrim', S + V((sx * 0.004, 0, -0.004)), t * 1.45, t * 1.35, 0.006, thick_z=0.006,
                               n=6, mat=c.m('pauldrontrim', trim), subd=1))


def bracer(c, sx, color, *, trim=None):
    E, W = c.elbow(sx), c.wrist(sx)
    s = 'L' if sx < 0 else 'R'
    t = 0.045 * c.b.limb
    c.add('fore' + s, tube('bracer', [E.lerp(W, 0.35), W], [(0, t * 0.92), (1, t * 0.85)], n=12,
                           mat=c.m('bracer', color, rough=0.45), subd=1))
    if trim:
        for k in (0.4, 0.95):
            c.add('fore' + s, ring('bracerband', E.lerp(W, k), t * 0.92, t * 0.92, 0.006, thick_z=0.006, n=6,
                                   mat=c.m('bracertrim', trim), subd=1))


def hand_pos(c, sx):
    W, E = c.wrist(sx), c.elbow(sx)
    return W + (W - E).normalized() * 0.05


# ---------------------------------------------------------------------------------------------
# the humanoid assembler


def humanoid(c, P):
    """Head, hair, outfit, arms and legs from a spec dict; returns the face params."""
    b = c.b
    skin = P['skin']
    c.m('skin', skin)
    face = dict(skin=skin, lash='#22183A')
    face.update(P.get('face', {}))
    build_head(c, face, ear_kind=P.get('ears', 'round'))
    hair = c.m('hair', P['hair_color'])
    style = P.get('hair', 'spiky')
    hk = P.get('hair_kw', {})
    if callable(style):
        style(c, hair)
    elif style == 'spiky':
        hair_spiky(c, hair, **hk)
    elif style == 'bob':
        hair_bob(c, hair, **hk)
    elif style == 'long':
        hair_long(c, hair, **hk)
    elif style == 'ponytail':
        hair_ponytail(c, hair, **hk)
    elif style == 'hooded':
        bangs(c, hair, count=9, spread=50, length=-13, part=-4, sweep=4, rk=1.13, width=b.hr * 0.24, clear=25)
        side_locks(c, hair, az=70, length=-55, width=b.hr * 0.24, rk=1.09)
    top = P['top']
    keys = torso_keys(b, hem_z=top.get('hem_z', b.hip_z - 0.12), flare=top.get('flare', 1.0),
                      collar=top.get('collar', 0.0))
    if top.get('inner'):
        ik = [(z, rx * 0.95, rb * 0.95, rf * 0.97) for z, rx, rb, rf in torso_keys(b, hem_z=b.hip_z, collar=0.0)]
        garment(c, 'inner', ik, c.m('inner', top['inner']), solid=0, n=16)
    garment(c, 'top', keys, c.m('top', top['color']), open_front=top.get('open'), solid=top.get('solid', 0.008),
            trim=c.m('trim', top['trim']) if top.get('trim') else None,
            hem_trim=c.m('hem', top.get('hem', top.get('trim'))) if top.get('hem', top.get('trim')) else None)
    if top.get('belt'):
        bz = b.hip_z + (b.sh_z - b.hip_z) * 0.36
        belt(c, bz, c.m('belt', top['belt']), rx=b.waist[0] * 1.08, ry=b.waist[2] * 1.12,
             h=top.get('belt_h', 0.022), buckle=c.m('buckle', top.get('buckle', '#E8C46A'), rough=0.4))
    A = P['arms']
    for sx in (-1, 1):
        sleeve_arm(c, sx, sleeve=c.m('sleeve', A['sleeve']), hand=c.m('skin'),
                   cuff=c.m('cuff', A['cuff']) if A.get('cuff') else None, wide=A.get('wide', 1.0),
                   short=A.get('short', False), skin=c.m('skin'), puff=A.get('puff', 1.0),
                   glove=c.m('glove', A['glove']) if A.get('glove') else None)
    G = P.get('legs')
    if G:
        for sx in (-1, 1):
            leg(c, sx, pants=c.m('pants', G['pants']), boot=c.m('boots', G['boots']), boot_top=G.get('boot_top', 0.35),
                cuff=c.m('bootcuff', G['cuff']) if G.get('cuff') else None, skin=c.m('skin'),
                bare_knee=G.get('bare_knee', False), thick=G.get('thick', 1.0))
    return face


# ---------------------------------------------------------------------------------------------
# held props


def golf_club(c, sx, *, grip='#3A3A4A', shaft='#C9CCD6', head='#E8E2D0'):
    H = hand_pos(c, sx)
    s = 'L' if sx < 0 else 'R'
    end = V((H.x + sx * 0.06, H.y - 0.12, 0.05))
    c.add('fore' + s, tube('grip', [H + V((0, 0, 0.05)), H + (end - H).normalized() * 0.08], 0.011, n=8,
                           mat=c.m('grip', grip), subd=0))
    c.add('fore' + s, tube('shaft', [H, end], [(0, 0.008), (1, 0.005)], n=6, mat=c.m('shaft', shaft, rough=0.3), subd=0))
    c.add('fore' + s, L.box('clubhead', end + V((sx * 0.02, -0.02, 0.0)), (0.08, 0.035, 0.03), mat=c.m('clubhead', head),
                            bevel=0.01, segs=2))


def fishing_rod(c, sx):
    H = hand_pos(c, sx)
    s = 'L' if sx < 0 else 'R'
    tip = H + V((sx * 0.15, -0.9, 0.85))
    wood = c.m('rod', '#8A5E3F')
    c.add('fore' + s, tube('rod', [H + V((0, 0.08, -0.08)), tip], [(0, 0.014), (1, 0.004)], n=6, mat=wood, subd=0))
    c.add('fore' + s, cylinder_y(c, 'reel', H + V((sx * 0.03, 0.03, -0.03)), 0.025, 0.018, c.m('reel', '#E3D1A4')))
    line = [tip, tip + V((0, -0.15, -0.4)), tip + V((0, -0.3, -0.95))]
    c.add('fore' + s, tube('line', spline(line, steps=4), 0.0015, n=4, mat=c.m('fishline', '#F3EBDD'), subd=0))
    c.add('fore' + s, L.blob('bobber', line[-1], (0.02, 0.02, 0.025), mat=c.m('bobber', '#E8574A'), segs=(10, 8)))


def cylinder_y(c, name, center, r, h, mat):
    return tube(name, [center + V((-h / 2, 0, 0)), center + V((h / 2, 0, 0))], r, n=12, mat=mat, subd=0)


def quill(c, sx, *, vane='#F7F5FF', tip='#8FF3FF'):
    H = hand_pos(c, sx)
    s = 'L' if sx < 0 else 'R'
    base = H + V((0, -0.02, -0.03))
    end = base + V((sx * 0.06, -0.06, 0.42))
    c.add('fore' + s, tube('quillshaft', [base, end], [(0, 0.004), (1, 0.002)], n=6, mat=c.m('quillshaft', '#E8C46A'), subd=0))
    mid = base.lerp(end, 0.6)
    c.add('fore' + s, tube('vane', [base.lerp(end, 0.2), mid, end + V((0, 0, 0.04))], [(0, 0.004), (0.4, 0.035), (1, 0.0)],
                           0.004, n=8, side=(1, 0, 0), mat=c.m('vane', vane), subd=1, cap1=False))
    c.add('fore' + s, tube('nib', [base, base + V((0, 0, -0.05))], [(0, 0.004), (1, 0.0)], n=6,
                           mat=c.m('nib', tip, emit=tip, strength=2.0), subd=0, cap1=False))


def book(c, sx, cover, trim, *, glyph=None):
    H = hand_pos(c, sx)
    s = 'L' if sx < 0 else 'R'
    ctr = H + V((-sx * 0.04, -0.06, 0.02))
    c.add('fore' + s, L.box('book', ctr, (0.04, 0.16, 0.2), mat=c.m('book', cover), bevel=0.008, segs=2, rot=(0, 0, -sx * 20)))
    c.add('fore' + s, L.box('pages', ctr + V((0, -0.006, 0)), (0.032, 0.15, 0.19), mat=c.m('pages', '#F3EBDD'), rot=(0, 0, -sx * 20)))
    c.add('fore' + s, L.box('bookband', ctr, (0.044, 0.025, 0.205), mat=c.m('booktrim', trim, rough=0.4), rot=(0, 0, -sx * 20)))
    if glyph:
        c.add('fore' + s, L.blob('bookgem', ctr + V((sx * 0.024, 0, 0)), (0.006, 0.014, 0.014), mat=c.m('bookglyph', glyph,
                                 emit=glyph, strength=2.0), segs=(8, 6)))


def flat_cap(c, color, brim=None):
    b = c.b
    hr = b.hr
    m = c.m('cap', color)
    top = b.hc + V((0, 0.005, hr * 0.45))
    c.add('head', L.blob('captop', top, (hr * 1.2, hr * 1.25, hr * 0.62),
                         deform=lambda p: (p[0], p[1] * (1.0 if p[1] > 0 else 1.08), max(p[2], -hr * 0.12)), mat=m,
                         segs=(20, 12)))
    bm = c.m('brim', brim or color)
    c.add('head', L.blob('brim', b.hc + V((0, -hr * 1.05, hr * 0.42)), (hr * 0.75, hr * 0.48, hr * 0.06),
                         mat=bm, segs=(16, 8)))
    c.add('head', L.blob('capbutton', top + V((0, 0, hr * 0.6)), hr * 0.1, mat=bm, segs=(8, 6)))


def bandana(c, color):
    b = c.b
    hr = b.hr
    m = c.m('bandana', color)
    c.add('head', ring('bandana', b.hc + V((0, 0.0, hr * 0.35)), hr * 1.1, hr * 1.12, hr * 0.17, thick_z=0.007, n=8,
                       segs=28, mat=m, rot=(-14, 0, 0), power=3))
    knot = b.hc + V((hr * 0.2, hr * 1.12, hr * 0.12))
    c.add('head', L.blob('knot', knot, hr * 0.12, mat=m, segs=(10, 8)))
    for k in (-1, 1):
        c.add('head', tube('bandanatail', [knot, knot + V((0.03 + k * 0.02, 0.04, -0.07 - k * 0.02))],
                           [(0, hr * 0.12), (1, hr * 0.2)], 0.004, n=6, side=(1, 0, 0), mat=m))


def glitch_bits(c, color, n=7, seed=3):
    import random

    rnd = random.Random(seed)
    g = c.m('glitch', color, emit=color, strength=2.5)
    b = c.b
    for i in range(n):
        a = rnd.uniform(0, math.pi * 2)
        r = rnd.uniform(0.22, 0.34)
        z = rnd.uniform(b.hip_z, b.sh_z + 0.1)
        s = rnd.uniform(0.012, 0.028)
        c.add('body', L.box('bit', V((math.cos(a) * r, math.sin(a) * r, z)), (s, s, s), mat=g, rot=(rnd.uniform(0, 45), rnd.uniform(0, 45), 0)))


def devil_tail(c, color, tip_color, *, length=1.0, heart=True):
    b = c.b
    k = length
    root = V((0, b.hips[1] * 0.9, b.hip_z + 0.02))
    pts = spline([root, root + V((0.04, 0.12, -0.12)) * k, root + V((0.14, 0.2, -0.08)) * k, root + V((0.2, 0.18, 0.08)) * k], steps=5)
    c.add('body', tube('tail', pts, [(0, 0.016), (1, 0.008)], n=8, mat=c.m('tail', color), subd=1))
    tip = pts[-1]
    g = c.m('tailtip', tip_color, emit=tip_color, strength=1.6)
    if heart:
        for sx in (-1, 1):
            c.add('body', L.blob('heart', tip + V((sx * 0.018, 0.0, 0.03)), (0.024, 0.012, 0.024), mat=g, segs=(10, 8)))
        c.add('body', tube('heartpt', [tip + V((0, 0, 0.03)), tip + V((0, 0, -0.03))], [(0, 0.035), (1, 0.0)], 0.011,
                           n=8, side=(1, 0, 0), mat=g, subd=1, cap1=False))
    else:
        c.add('body', tube('spade', [tip, tip + V((0.04, -0.01, 0.05))], [(0, 0.02), (0.4, 0.03), (1, 0)], 0.008, n=8,
                           side=(0, 1, 0), mat=g, subd=1, cap1=False))


def bat_wings(c, bone, membrane, *, span=0.3, at=None, flap=20):
    """Small devil wings on the upper back: dark bones with a coloured membrane."""
    b = c.b
    at = at or V((0, b.chest[1] + 0.01, b.sh_z - 0.08))
    mb = c.m('wingbone', bone)
    mm = c.m('wing', membrane)
    for sx in (-1, 1):
        root = at + V((sx * 0.03, 0, 0))
        tip = root + V((sx * span, span * 0.35, span * 0.55))
        elbow = root + V((sx * span * 0.45, span * 0.25, span * 0.5))
        c.add('body', tube('wingarm', spline([root, elbow, tip], steps=3), [(0, 0.012), (1, 0.004)], n=6, mat=mb))
        # membrane: a fan from the root to scalloped points
        lows = [tip, root + V((sx * span * 0.85, span * 0.3, span * 0.05)), root + V((sx * span * 0.6, span * 0.22, -span * 0.12)),
                root + V((sx * span * 0.32, span * 0.12, -span * 0.08)), root + V((sx * 0.02, 0.01, -span * 0.05))]
        verts = [root, elbow] + lows
        faces = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5), (0, 5, 6)]
        o = L._mesh_obj('membrane', verts, faces, mm, smooth=False)
        L._fix_normals(o)
        mod = o.modifiers.new('sub', 'SUBSURF')
        mod.levels = 2
        L.apply_mods(o)
        mod = o.modifiers.new('solid', 'SOLIDIFY')
        mod.thickness = 0.006
        mod.offset = 0
        L.apply_mods(o)
        for p in o.data.polygons:
            p.use_smooth = True
        c.add('body', o)


def buns(c, mat, *, tails=True, tail_mat=None):
    b = c.b
    hr = b.hr
    for sx in (-1, 1):
        ctr = hair_pt(b, sx * 122, 40, 1.12)
        c.add('head', L.blob('bun', ctr, (hr * 0.4, hr * 0.38, hr * 0.38), mat=mat, segs=(14, 10)))
        if tails:
            pts = [ctr + V((sx * hr * 0.15, hr * 0.2, -hr * 0.1)), ctr + V((sx * hr * 0.4, hr * 0.35, -hr * 0.6)),
                   ctr + V((sx * hr * 0.45, hr * 0.2, -hr * 1.4)), ctr + V((sx * hr * 0.3, hr * 0.05, -hr * 2.0))]
            o = tube('twintail', spline(pts, steps=4), [(0, hr * 0.2), (0.3, hr * 0.27), (1, 0.0)],
                     [(0, hr * 0.15), (1, 0.0)], n=8, side=(0, 1, 0), mat=tail_mat or mat, cap1=False)
            c.add('head', o)


# ---------------------------------------------------------------------------------------------
# the cast


def jewelry(c, gold, gem, *, pin=True, pin_az=58):
    """A jewelled brooch at the collar and a pin in the hair: the Genshin cast's signature accents."""
    b = c.b
    g = c.m('jgold', gold, rough=0.35)
    j = c.m('jgem', gem, emit=gem, strength=1.4)
    bp = V((0, -(b.chest[2] * 1.05 + 0.014), b.sh_z - 0.05))
    c.add('body', ring('jbrooch', bp, 0.018, 0.018, 0.0045, thick_z=0.0045, n=6, segs=20, mat=g, subd=0,
                       rot=(90, 0, 0)))
    c.add('body', L.blob('jbroochgem', bp + V((0, -0.002, 0)), (0.012, 0.006, 0.014), mat=j, segs=(10, 8)))
    for sx in (-1, 1):
        c.add('body', tube('jwing', [bp + V((sx * 0.016, 0, 0)), bp + V((sx * 0.034, 0.002, -0.006))],
                           [(0, 0.007), (1, 0.0)], 0.003, n=6, side=(0, 0, 1), mat=g, cap1=False))
    c.add('body', tube('jdrop', [bp + V((0, 0, -0.016)), bp + V((0, -0.001, -0.04))], [(0, 0.005), (1, 0.0)], 0.004,
                       n=6, side=(1, 0, 0), mat=g, cap1=False))
    if pin:
        hp = b.hc + D(pin_az, 26) * b.hr * 1.2
        c.add('head', L.box('jpin', hp, (0.006, 0.05, 0.012), mat=g, bevel=0.003, rot=(0, 0, 30)))
        c.add('head', L.blob('jpingem', hp + D(pin_az, 26) * 0.006, (0.009, 0.009, 0.009), mat=j, segs=(10, 8)))


def build_mom(export=True):
    c = Char('mom', B('adult_f'))
    b = c.b
    face = humanoid(c, dict(
        skin='#F6D2BE', face=dict(iris='#6B4632', style='sleepy', mouth='smile', brow='#5B3A28', lashes=True,
                                  blush='#F09A9A'),
        hair='ponytail', hair_color='#8A5E3F', hair_kw=dict(tie=material('tie', '#C46A4A'), to_z=b.sh_z - 0.34, side=1),
        top=dict(color='#C46A4A', hem_z=0.12, flare=1.3, hem='#A4553A', collar=0.004),
        arms=dict(sleeve='#F3EBDD', short=True, puff=1.1),
        legs=dict(pants='#C46A4A', boots='#6B4632', boot_top=0.2),
    ))
    apron(c, '#F3EBDD', top_z=b.sh_z - 0.12, bot_z=0.36, bib=True, string='#E3D1A4')
    _ = face
    return c.finish(export=export)


def build_tomo(export=True):
    c = Char('tomo', B('teen_m', h=1.58, hr=0.116))
    b = c.b

    def flour(cv):
        cv.over(cv.soft_ellipse(-b.hr * 0.55, -b.hr * 0.5, b.hr * 0.12, b.hr * 0.07), '#FFFFFF', 0.8)

    humanoid(c, dict(
        skin='#F0CDB8', face=dict(iris='#6B4632', style='bright', mouth='grin', brow='#A07A3A', extras=[flour]),
        hair='bob', hair_color='#E8C46A', hair_kw=dict(length=-62, fringe=-12, curl=14),
        top=dict(color='#F3EBDD', hem_z=b.hip_z - 0.1, flare=1.05, collar=0.004),
        arms=dict(sleeve='#F3EBDD', short=True),
        legs=dict(pants='#6B5A4A', boots='#8A5E3F', boot_top=0.3, cuff='#C46A4A'),
    ))
    bandana(c, '#C46A4A')
    apron(c, '#C46A4A', top_z=b.sh_z - 0.14, bot_z=b.knee + 0.05, bib=True, string='#C46A4A')
    return c.finish(export=export)


def build_pix(export=True):
    c = Char('pix', B('kid'))
    b = c.b
    humanoid(c, dict(
        skin='#FBE3D3', face=dict(iris='#FFB347', style='bright', mouth='smirk', brow='#3E7A4A'),
        hair='bob', hair_color='#7BD389', hair_kw=dict(length=-60, fringe=-14, curl=18, count=7),
        top=dict(color='#3A3A4A', hem_z=b.hip_z - 0.08, flare=1.1, trim='#FFB347', open=lambda z: 0.012 + max(0, 0.9 - z) * 0.1,
                 inner='#F3EBDD', belt='#FFB347'),
        arms=dict(sleeve='#F3EBDD', cuff='#FFB347', wide=1.1),
        legs=dict(pants='#3A3A4A', boots='#5A4632', boot_top=0.55, cuff='#FFB347', bare_knee=True),
    ))
    flat_cap(c, '#FFB347', brim='#3A3A4A')
    golf_club(c, 1)
    return c.finish(export=export)


def build_wade(export=True):
    c = Char('wade', B('adult_m', h=1.68, hr=0.115, sh_z=1.33, neck=1.37))
    b = c.b
    humanoid(c, dict(
        skin='#E9B892', face=dict(iris='#4FA3E0', style='sleepy', mouth='smile', brow='#DCE2F3', blush_lines=False,
                                  blush='#E89A8A'),
        hair='hooded', hair_color='#DCE2F3',
        top=dict(color='#2B6C86', hem_z=0.42, flare=1.15, trim='#E3D1A4', open=lambda z: 0.006, belt='#6B4632'),
        arms=dict(sleeve='#2B6C86', cuff='#E3D1A4', wide=1.15),
        legs=dict(pants='#4A4A5A', boots='#3A3A4A', boot_top=0.8, cuff='#E3D1A4', thick=1.05),
    ))
    hood(c, c.m('top'), trim=c.m('trim'))
    beard(c, '#DCE2F3')
    fishing_rod(c, 1)
    return c.finish(export=export)


def build_vesper(export=True):
    c = Char('vesper', B('adult_f', h=1.72, hr=0.112))
    b = c.b
    face = humanoid(c, dict(
        skin='#FBE3D3', face=dict(iris='#4FA3E0', style='sharp', mouth='flat', brow='#9AA6C9', lashes=True),
        hair='long', hair_color='#DCE2F3', hair_kw=dict(to_z=b.hip_z - 0.02, fringe=-2, count=11),
        top=dict(color='#2F5C8F', hem_z=0.1, flare=1.35, trim='#E8C46A', collar=0.012,
                 open=lambda z: 0.006 if z > b.hip_z + 0.1 else 0.006 + (b.hip_z + 0.1 - z) * 0.2),
        arms=dict(sleeve='#2F5C8F', cuff='#E8C46A', wide=1.6),
        legs=dict(pants='#EEF2FA', boots='#E8E2F0', boot_top=0.3),
    ))
    under = [(z, rx * 0.93, rb * 0.93, rf * 0.95) for z, rx, rb, rf in torso_keys(b, hem_z=0.08, flare=1.2)]
    garment(c, 'underrobe', under, c.m('under', '#EEF2FA'), solid=0, n=16, cap_top=False)
    belt(c, b.hip_z + 0.11, c.m('sash', '#E8C46A', rough=0.4), rx=b.waist[0] * 1.1, ry=b.waist[2] * 1.15, h=0.018)
    glasses(c, face, '#E8C46A')
    quill(c, 1)
    jewelry(c, '#E8C46A', '#4FA3E0', pin_az=-58)
    return c.finish(export=export)


def build_brakk(export=True):
    c = Char('brakk', B('big_m', hr=0.127))
    b = c.b
    humanoid(c, dict(
        skin='#E9B892', face=dict(iris='#3B8A4A', style='sharp', mouth='grin', brow='#8A2E1E', blush='#E08070',
                                  blush_lines=False),
        hair='spiky', hair_color='#D9573B', hair_kw=dict(lift=1.35, wild=1.5, back_len=-50, part=8),
        top=dict(color='#6B4A2B', hem_z=b.hip_z - 0.1, flare=1.1, trim='#C9B994', inner='#3A2A20',
                 open=lambda z: 0.03 + max(0, 1.4 - z) * 0.08, belt='#3A2A20', buckle='#9AA0B0', belt_h=0.035),
        arms=dict(sleeve='#3A2A20', short=True, puff=1.15),
        legs=dict(pants='#4A3A2A', boots='#3A2A20', boot_top=0.5, cuff='#C9B994', thick=1.15),
    ))
    for sx in (-1, 1):
        bracer(c, sx, '#7A7F8E', trim='#C9B994')
    pauldron(c, -1, '#7A7F8E', trim='#C9B994', size=1.15)
    # the iron loop he carries on his back
    c.add('body', ring('ironloop', V((0, b.chest[1] + 0.07, b.sh_z - 0.12)), 0.2, 0.2, 0.025, thick_z=0.025, n=10,
                       segs=36, mat=c.m('iron', '#7A7F8E', rough=0.4), rot=(90, 0, 18)))
    jewelry(c, '#C9B994', '#3B8A4A')
    return c.finish(export=export)


def build_sable(export=True):
    c = Char('sable', B('teen_m', h=1.64, hr=0.114, sh_x=0.15))
    b = c.b
    face = humanoid(c, dict(
        skin='#FBE3D3', face=dict(iris='#E8A33D', style='sharp', mouth='flat', brow='#2E3A7A'),
        hair='hooded', hair_color='#3F4E9E',
        top=dict(color='#4A4370', hem_z=0.3, flare=1.2, trim='#E8C46A', inner='#2A2342',
                 open=lambda z: 0.008 if z > b.hip_z + 0.15 else 0.008 + (b.hip_z + 0.15 - z) * 0.15),
        arms=dict(sleeve='#4A4370', cuff='#E8C46A', wide=1.25, glove='#2A2342'),
        legs=dict(pants='#2A2342', boots='#3A3150', boot_top=0.65, cuff='#E8C46A'),
    ))
    hood(c, c.m('top'), trim=c.m('trim'), rk=1.3)
    half_mask(c, face, '#EDE6D6', line='#E8A33D')
    book(c, -1, '#3A3366', '#E8C46A', glyph='#8FF3FF')
    jewelry(c, '#E8C46A', '#8FF3FF', pin=False)
    return c.finish(export=export)


def build_overflow(export=True):
    c = Char('overflow', B('adult_m', h=1.76))
    b = c.b
    humanoid(c, dict(
        skin='#FBE3D3', face=dict(iris='#FFD08A', style='devil', mouth='grin', fang=True, brow='#C0602A'),
        hair='bob', hair_color='#FF9D5C', hair_kw=dict(length=-55, fringe=-4, curl=-10, count=7),
        top=dict(color='#8C3B2E', hem_z=b.hip_z - 0.22, flare=1.2, trim='#FFD08A', belt='#3A1E1A', collar=0.01),
        arms=dict(sleeve='#5A2620', glove='#3A1E1A'),
        legs=dict(pants='#5A2620', boots='#3A1E1A', boot_top=0.75, cuff='#FFD08A'),
    ))
    horns(c, '#3A1E1A', kind='curl', size=1.7, glow='#FFD08A')
    for sx in (-1, 1):
        pauldron(c, sx, '#5A2620', trim='#FFD08A')
        bracer(c, sx, '#5A2620', trim='#FFD08A')
    # breastplate
    pk = [(z, rx * 1.06, rb * 1.06, rf * 1.12) for z, rx, rb, rf in torso_keys(b, hem_z=b.hip_z, neck=False)
          if b.hip_z + 0.1 < z]
    garment(c, 'cuirass', pk, c.m('plate', '#6E2A22', rough=0.4), solid=0.01, n=18, hem_trim=c.m('trim'), cap_top=False)
    c.add('body', L.blob('platecore', V((0, -b.chest[2] * 1.18, b.hip_z + (b.sh_z - b.hip_z) * 0.66)), 0.02,
                         mat=c.m('core', '#FFD08A', emit='#FFB347', strength=2.0), segs=(10, 8)))
    cape(c, '#8C3B2E', '#FFD08A', hem_z=0.45, wrap=78, flare=1.4, collar=False)
    devil_tail(c, '#3A1E1A', '#FFB347', heart=False)
    jewelry(c, '#E8C46A', '#FF9A4A')
    return c.finish(export=export)


def build_deadlock(export=True):
    c = Char('deadlock', B('adult_f', h=1.74, hr=0.112))
    b = c.b
    humanoid(c, dict(
        skin='#E6E1F0', face=dict(iris='#9AE6FF', style='devil', mouth='smirk', brow='#5A6680', lashes=True,
                                  blush='#C9B2E6'),
        hair='long', hair_color='#8C9AB8', hair_kw=dict(to_z=0.62, fringe=-8, part=14, count=9),
        top=dict(color='#4B5675', hem_z=0.05, flare=1.55, trim='#9AE6FF', collar=0.014, belt='#2A2F45',
                 buckle='#9AE6FF'),
        arms=dict(sleeve='#4B5675', cuff='#9AE6FF', wide=1.7),
        legs=dict(pants='#4B5675', boots='#2A2F45', boot_top=0.3),
    ))
    horns(c, '#2A2F45', kind='swept', size=1.75, glow='#9AE6FF')
    # chains of locked loops at the hip
    iron = c.m('chain', '#9AA6C9', rough=0.4)
    for i in range(6):
        a = -0.9 + i * 0.32
        p = V((math.sin(a) * b.hips[0] * 1.35, -math.cos(a) * b.hips[2] * 1.3, b.hip_z - 0.04 - 0.05 * math.sin(i * 1.3) ** 2))
        c.add('body', ring('link', p, 0.018, 0.012, 0.005, thick_z=0.005, n=6, segs=14, mat=iron, subd=0,
                           rot=(90 if i % 2 else 0, 0, math.degrees(a))))
    c.add('body', L.box('padlock', V((b.hips[0] * 0.9, -b.hips[2] * 1.4, b.hip_z - 0.12)), (0.045, 0.02, 0.05),
                        mat=c.m('padlock', '#9AE6FF', emit='#9AE6FF', strength=1.4), bevel=0.008))
    jewelry(c, '#E8C46A', '#8FF3FF', pin_az=-58)
    return c.finish(export=export)


def build_segfault(export=True):
    c = Char('segfault', B('kid', h=1.42, hr=0.12))
    b = c.b
    humanoid(c, dict(
        skin='#E6F0E0', face=dict(iris='#A7F07A', style='devil', mouth='grin', fang=True, brow='#4A7A3A'),
        hair='spiky', hair_color='#A7F07A', hair_kw=dict(lift=1.2, wild=1.6, back_len=-55, part=-10),
        top=dict(color='#2F4A3A', hem_z=b.hip_z - 0.05, flare=1.1, trim='#A7F07A', inner='#1E2A22',
                 open=lambda z: 0.02 + max(0, 0.95 - z) * 0.12),
        arms=dict(sleeve='#2F4A3A', cuff='#A7F07A', wide=1.3),
        legs=dict(pants='#1E2A22', boots='#2F4A3A', boot_top=0.25, cuff='#A7F07A'),
    ))
    horns(c, '#1E2A22', kind='straight', size=1.45, glow='#A7F07A')
    glitch_bits(c, '#A7F07A')
    devil_tail(c, '#1E2A22', '#A7F07A', heart=False, length=0.9)
    jewelry(c, '#E8C46A', '#7BD389')
    return c.finish(export=export)


def build_null(export=True):
    c = Char('null', B('adult_m', hr=0.12))
    b = c.b
    humanoid(c, dict(
        skin='#D9D3F0', face=dict(iris='#FF3D8B', style='devil', mouth='smirk', brow='#B9B2D9', blush='#C9A2D9',
                                  blush_lines=False),
        hair='spiky', hair_color='#F2EEF8', hair_kw=dict(lift=1.1, wild=1.1, back_len=-75),
        top=dict(color='#3A2E63', hem_z=0.06, flare=1.35, trim='#FF7AB6', collar=0.012, belt='#E8C46A',
                 buckle='#FF7AB6'),
        arms=dict(sleeve='#3A2E63', cuff='#FF7AB6', wide=1.4, glove='#2A1430'),
        legs=dict(pants='#3A2E63', boots='#2A1430', boot_top=0.3),
    ))
    horns(c, '#2A1430', kind='curl', size=2.1, glow='#FF7AB6')
    crown(c, '#E8C46A', '#FF7AB6')
    for sx in (-1, 1):
        pauldron(c, sx, '#2A2147', trim='#E8C46A', size=1.1)
    cape(c, '#2A2147', '#FF7AB6', hem_z=0.05, wrap=70, flare=1.9)
    jewelry(c, '#E8C46A', '#FF7AB6', pin=False)
    return c.finish(export=export)


def build_lethe(export=True):
    c = Char('lethe', B('chibi'))
    b = c.b
    hr = b.hr
    skin = '#FFE7DC'
    c.m('skin', skin)
    build_head(c, dict(skin=skin, iris='#E0408A', style='devil', mouth='grin', fang=True, lashes=True,
                       lash='#3A1840', brow='#B0306E', blush='#FF7AB6'))
    hair = c.m('hair', '#FFB3D1')
    hair2 = c.m('hair2', '#F28DBA')
    hair_cap(c, hair, front=0.5, volume=1.17, back=1.24)
    bangs(c, hair, count=9, spread=62, length=-14, part=-4, sweep=2, jag=True, rk=1.18)
    side_locks(c, hair2, az=76, length=-78, width=hr * 0.3, rk=1.15)
    back_locks(c, hair, count=7, length=-70, flick=8, out=0.08, width=hr * 0.42)
    back_locks(c, hair, count=6, length=-86, flick=-6, out=-0.04, rk=1.10, spread=120, width=hr * 0.34)
    buns(c, hair, tails=True, tail_mat=hair2)
    ahoge(c, hair, az=-8, size=0.8)
    horns(c, '#3A1840', kind='curl', size=1.15, az=36, el=50)
    tiara(c, '#E8C46A', '#FF7AB6')
    dress = c.m('dress', '#6B2F7A')
    keys = torso_keys(b, hem_z=0.18, flare=1.7, collar=0.006)
    garment(c, 'dress', keys, dress, hem_trim=c.m('frill', '#FF9CC8'), solid=0.006, n=18)
    # white bodice panel with a heart gem
    c.add('body', L.blob('bodice', V((0, -b.chest[2] * 0.72, b.hip_z + (b.sh_z - b.hip_z) * 0.62)),
                         (b.chest[0] * 0.55, b.chest[2] * 0.5, (b.sh_z - b.hip_z) * 0.3), mat=c.m('bodice', '#F7EEF8'),
                         segs=(14, 10)))
    gem = c.m('gem', '#FF7AB6', emit='#FF7AB6', strength=2.4)
    gz = b.hip_z + (b.sh_z - b.hip_z) * 0.68
    for sx in (-1, 1):
        c.add('body', L.blob('gemheart', V((sx * 0.011, -b.chest[2] * 1.16, gz + 0.008)), (0.014, 0.008, 0.014), mat=gem,
                             segs=(8, 6)))
    c.add('body', tube('gempt', [V((0, -b.chest[2] * 1.16, gz + 0.01)), V((0, -b.chest[2] * 1.16, gz - 0.022))],
                       [(0, 0.024), (1, 0.0)], 0.008, n=8, side=(1, 0, 0), mat=gem, cap1=False))
    belt(c, b.hip_z + 0.08, c.m('ribbon', '#FF9CC8'), rx=b.waist[0] * 1.08, ry=b.waist[2] * 1.15, h=0.014, t=0.008)
    for sx in (-1, 1):
        sleeve_arm(c, sx, sleeve=c.m('sleeve', '#7E3A8E'), hand=c.m('skin'), cuff=c.m('cuff', '#FF9CC8'), wide=1.3,
                   puff=1.35)
        leg(c, sx, pants=c.m('stocking', '#2A1430'), boot=c.m('shoes', '#FF7AB6'), boot_top=0.15)
    bat_wings(c, '#3A1840', '#B44C8C', span=0.26)
    devil_tail(c, '#3A1840', '#FF7AB6', heart=True, length=1.2)
    return c.finish(export=export)


# ---------------------------------------------------------------------------------------------
# guardians


def build_golem(variant='warden', export=True):
    body_c, glow_c, dark_c = {'warden': ('#8E89AE', '#8FF3FF', '#6F6A93'),
                              'forge': ('#6B3B37', '#FF9A4A', '#4A2826')}[variant]
    name = 'golem' if variant == 'warden' else 'golem_forge'
    c = Char(name, B('big_m', raw=True, h=1.62, hr=0.16, hip_z=0.56, sh_z=1.12, sh_x=0.36, neck=1.2, elbow=0.86, wrist=0.6,
                     knee=0.3, ankle=0.06, hip_x=0.17, limb=1.6))
    b = c.b
    stone = c.m('stone', body_c, rough=0.9)
    dark = c.m('stonedark', dark_c, rough=0.9)
    glow = c.m('rune', glow_c, emit=glow_c, strength=2.4)
    moss = c.m('moss', '#6FAF6A' if variant == 'warden' else '#3A2420')
    # torso: a broad keystone chest over a narrower waist block
    c.add('body', L.box('chest', V((0, 0, 0.95)), (0.66, 0.44, 0.42), mat=stone, bevel=0.05, segs=3))
    c.add('body', L.box('belly', V((0, 0.0, 0.66)), (0.46, 0.34, 0.26), mat=dark, bevel=0.04, segs=3))
    c.add('body', L.box('shoulderslab', V((0, 0.02, 1.17)), (0.5, 0.36, 0.08), mat=dark, bevel=0.03, segs=2))
    if variant == 'warden':
        c.add('body', L.box('moss', V((0.1, 0.0, 1.215)), (0.32, 0.3, 0.02), mat=moss, bevel=0.01))
    c.add('body', ring('core', V((0, -0.225, 0.97)), 0.085, 0.085, 0.012, thick_z=0.012, n=8, segs=28, mat=glow,
                       rot=(90, 0, 0)))
    c.add('body', L.blob('coregem', V((0, -0.22, 0.97)), (0.045, 0.02, 0.045), mat=glow, segs=(12, 8)))
    for sx in (-1, 1):
        c.add('body', L.box('runeline', V((sx * 0.2, -0.222, 0.97)), (0.1, 0.006, 0.014), mat=glow))
        c.add('body', L.box('runev', V((sx * 0.26, -0.222, 1.03)), (0.014, 0.006, 0.11), mat=glow))
    # head: a rounded block with a glowing visor
    hz = 1.33
    c.add('head', L.box('headblock', V((0, -0.02, hz)), (0.3, 0.28, 0.24), mat=stone, bevel=0.06, segs=3))
    c.add('head', L.box('brow', V((0, -0.11, hz + 0.075)), (0.32, 0.12, 0.06), mat=dark, bevel=0.02))
    c.add('head', L.box('visor', V((0, -0.16, hz + 0.01)), (0.22, 0.02, 0.045), mat=c.m('visorbg', '#2A2342')))
    for sx in (-1, 1):
        c.add('head', L.blob('eye', V((sx * 0.055, -0.172, hz + 0.012)), (0.03, 0.01, 0.018), mat=glow, segs=(10, 6)))
    if variant == 'warden':
        # a little windmill on its back, the warden's sigil
        hub = V((0, 0.26, 1.08))
        c.add('body', tube('axle', [V((0, 0.2, 1.08)), hub], 0.025, n=10, mat=dark, subd=0))
        sail = c.m('sail', '#F3EBDD')
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            d = V((math.cos(a), 0, math.sin(a)))
            c.add('body', L.box('spar', hub + d * 0.16, (0.025, 0.02, 0.32), mat=c.m('spar', '#7A5236'),
                                rot=(0, -math.degrees(a) + 90, 0)))
            c.add('body', L.box('sailcloth', hub + d * 0.19 + V((0, 0.01, 0)) + V((-d.z, 0, d.x)) * 0.05,
                                (0.08, 0.008, 0.24), mat=sail, rot=(0, -math.degrees(a) + 90, 0)))
    for sx in (-1, 1):
        s = 'L' if sx < 0 else 'R'
        S, E, W = c.shoulder(sx), c.elbow(sx), c.wrist(sx)
        c.add('arm' + s, L.blob('shoulderball', S, (0.13, 0.13, 0.12), mat=dark, segs=(14, 10)))
        c.add('arm' + s, L.box('upperarm', S.lerp(E, 0.55), (0.17, 0.18, 0.26), mat=stone, bevel=0.04, segs=2))
        c.add('fore' + s, L.box('forearm', E.lerp(W, 0.45), (0.21, 0.22, 0.3), mat=stone, bevel=0.05, segs=3))
        c.add('fore' + s, L.box('fist', W + V((0, 0, -0.08)), (0.2, 0.2, 0.16), mat=dark, bevel=0.05, segs=3))
        c.add('fore' + s, L.box('armrune', E.lerp(W, 0.45) + V((sx * 0.106, 0, 0)), (0.006, 0.04, 0.16), mat=glow))
        H, K = V((sx * b.hip_x, 0, b.hip_z)), c.knee(sx)
        c.add('leg' + s, L.box('thighblock', H.lerp(K, 0.5), (0.2, 0.22, 0.24), mat=dark, bevel=0.04, segs=2))
        c.add('shin' + s, L.box('foot', V((K.x, -0.03, 0.15)), (0.24, 0.32, 0.3), mat=stone, bevel=0.05, segs=3))
    return c.finish(export=export)


def build_stag(export=True):
    """The wild stag of the Grove: a round, Genshin-style forest spirit with glowing antlers."""
    c = Char('stag', B('adult_m', raw=True, hr=0.11, hip_z=0.78, sh_z=0.78, sh_x=0.1, neck=1.1, hip_x=0.12, knee=0.4,
                       ankle=0.05))
    fur = c.m('fur', '#9A6B45')
    cream = c.m('cream', '#F3EBDD')
    hoof = c.m('hoof', '#3A2A30')
    glow = c.m('antler', '#8FF3FF', emit='#8FF3FF', strength=2.2)
    spot = c.m('spot', '#C9F7FF', emit='#8FF3FF', strength=1.2)
    Z = 0.8  # barrel height
    body = tube('barrel', spline([V((0, 0.36, Z - 0.02)), V((0, 0.1, Z)), V((0, -0.2, Z + 0.02)), V((0, -0.34, Z + 0.06))], steps=4),
                [(0, 0.12), (0.2, 0.2), (0.7, 0.21), (1, 0.16)], [(0, 0.13), (0.3, 0.23), (0.75, 0.24), (1, 0.17)],
                n=16, side=(1, 0, 0), mat=fur)
    c.add('body', body)
    c.add('body', L.blob('chestfluff', V((0, -0.37, Z - 0.04)), (0.14, 0.11, 0.17), mat=cream, segs=(14, 10)))
    c.add('body', L.blob('belly', V((0, -0.02, Z - 0.13)), (0.13, 0.28, 0.07), mat=cream, segs=(14, 10)))
    tail = tube('tail', [V((0, 0.38, Z + 0.02)), V((0, 0.47, Z + 0.07)), V((0, 0.5, Z - 0.02))], [(0, 0.045), (0.5, 0.065), (1, 0.0)],
                n=10, mat=cream, cap1=False)
    c.add('body', tail)
    for x, y, z in [(0.1, 0.05, 0.2), (-0.08, 0.2, 0.19), (0.07, 0.28, 0.15), (-0.11, -0.12, 0.21), (0.12, -0.22, 0.19),
                    (-0.04, 0.33, 0.1)]:
        c.add('body', L.blob('spot', V((x, y, Z + z)), (0.026, 0.026, 0.01), mat=spot, segs=(8, 6)))
    # a short, thick neck up to a big head
    neck = tube('neck', spline([V((0, -0.3, Z + 0.08)), V((0, -0.4, Z + 0.26)), V((0, -0.44, Z + 0.38))], steps=4),
                [(0, 0.14), (1, 0.1)], [(0, 0.16), (1, 0.11)], n=14, side=(1, 0, 0), mat=fur)
    c.add('body', neck)
    c.add('body', tube('mane', spline([V((0, -0.33, Z + 0.02)), V((0, -0.43, Z + 0.18)), V((0, -0.49, Z + 0.32))], steps=4),
                       [(0, 0.1), (1, 0.06)], [(0, 0.07), (1, 0.04)], n=10, side=(1, 0, 0), mat=cream))
    hcen = V((0, -0.5, Z + 0.48))
    c.joint_over['head'] = V((0, -0.45, Z + 0.38))
    R = (0.12, 0.13, 0.12)
    head = L.blob('skull', hcen, R, mat=fur, segs=(20, 14),
                  deform=lambda p: (p[0] * (1 - 0.3 * max(0.0, -p[1] / R[1])), p[1], p[2] * (1 - 0.22 * max(0.0, -p[1] / R[1]))))
    c.add('head', head)
    c.add('head', L.blob('snout', hcen + V((0, -0.13, -0.045)), (0.065, 0.07, 0.055), mat=cream, segs=(14, 10)))
    c.add('head', L.blob('nose', hcen + V((0, -0.195, -0.025)), (0.026, 0.016, 0.018), mat=hoof, segs=(10, 6)))
    eye = c.m('eye', '#22183A', rough=0.2)
    shine = c.m('shine', '#FFFFFF', emit='#FFFFFF', strength=1.0)
    blush = c.m('blush', '#F09A9A')
    for sx in (-1, 1):
        e = hcen + V((sx * 0.072, -0.07, 0.02))
        c.add('head', L.blob('eye', e, (0.022, 0.024, 0.032), mat=eye, segs=(10, 8)))
        c.add('head', L.blob('shine', e + V((sx * 0.01, -0.016, 0.012)), 0.008, mat=shine, segs=(6, 4)))
        c.add('head', L.blob('cheek', hcen + V((sx * 0.08, -0.085, -0.035)), (0.022, 0.01, 0.012), mat=blush, segs=(8, 6)))
        c.add('head', tube('ear', [hcen + V((sx * 0.08, 0.03, 0.07)), hcen + V((sx * 0.21, 0.07, 0.11))],
                           [(0, 0.035), (0.5, 0.05), (1, 0.0)], 0.014, n=8, side=(0, 0, 1), mat=fur, cap1=False))
        c.add('head', tube('earin', [hcen + V((sx * 0.09, 0.022, 0.072)), hcen + V((sx * 0.19, 0.058, 0.105))],
                           [(0, 0.02), (0.5, 0.032), (1, 0.0)], 0.006, n=8, side=(0, 0, 1), mat=cream, cap1=False))
        # glowing antlers: a main beam with three tines
        base = hcen + V((sx * 0.05, 0.02, 0.1))
        beam = spline([base, base + V((sx * 0.08, 0.04, 0.15)), base + V((sx * 0.19, 0.08, 0.27)),
                       base + V((sx * 0.24, 0.15, 0.42))], steps=4)
        c.add('head', tube('beam', beam, [(0, 0.018), (1, 0.005)], n=8, mat=glow))
        for t, d in ((0.3, V((sx * 0.02, -0.08, 0.12))), (0.55, V((sx * 0.12, -0.04, 0.1))), (0.78, V((sx * 0.02, 0.0, 0.12)))):
            p0 = beam[int(t * (len(beam) - 1))]
            c.add('head', tube('tine', [p0, p0 + d * 0.5 + V((0, 0, 0.02)), p0 + d], [(0, 0.011), (1, 0.0)], n=6, mat=glow,
                               cap1=False))
    # legs: front pair on the arm pivots, hind pair on the leg pivots, so the walk cycle trots
    for sx in (-1, 1):
        s = 'L' if sx < 0 else 'R'
        c.joint_over['arm' + s] = V((sx * 0.1, -0.26, Z - 0.02))
        c.joint_over['leg' + s] = V((sx * 0.1, 0.26, Z - 0.02))
        for y0, front in ((-0.26, True), (0.26, False)):
            piv = ('arm' if front else 'leg') + s
            top = V((sx * 0.11, y0, Z - 0.02))
            knee = V((sx * 0.115, y0 + (-0.02 if front else 0.06), 0.42))
            ank = V((sx * 0.115, y0 + (0.0 if front else 0.02), 0.08))
            c.add(piv, tube('leg', spline([top, knee, ank], steps=4), [(0, 0.085), (0.4, 0.05), (1, 0.04)], n=10,
                            mat=fur))
            c.add(piv, L.blob('sock', ank + V((0, 0, 0.03)), (0.044, 0.044, 0.05), mat=cream, segs=(10, 8)))
            c.add(piv, tube('hoof', [ank, ank + V((0, -0.01, -0.075))], [(0, 0.04), (1, 0.046)], n=10, mat=hoof, subd=1))
    return c.finish(export=export)


def build_sphinx(export=True):
    c = Char('sphinx', B('adult_f', raw=True, h=1.1, hr=0.13, hip_z=0.4, sh_z=0.62, sh_x=0.2, neck=0.75))
    b = c.b
    lion = c.m('lion', '#C99A45')
    lion2 = c.m('lionlight', '#E3C07A')
    teal = c.m('nemes', '#2B6C86')
    gold = c.m('gold', '#E8C46A', rough=0.4)
    # head forward on top of the chest
    b.hc = V((0, -0.42, 0.98))
    b.neck_top = b.hc.z - b.hr * 0.85
    b.chin = b.hc.z - b.hr * 1.3
    c.joint_over['head'] = V((0, -0.36, 0.86))
    skin = '#E3B888'
    c.m('skin', skin)

    def kohl(cv):
        for sx in (-1, 1):
            ex, ez, s_ = sx * b.hr * 0.42, -b.hr * 0.2, b.hr * 0.235
            cv.over(cv.stroke([(ex + sx * s_ * 1.0, ez + s_ * 0.3), (ex + sx * s_ * 1.7, ez + s_ * 0.05)], [s_ * 0.1, s_ * 0.03]),
                    '#22183A')

    build_head(c, dict(skin=skin, iris='#E8C46A', style='sleepy', mouth='flat', brow='#5A3A20', lashes=True,
                       blush='#E89A70', blush_lines=False, extras=[kohl]), ears=False, neck=False)
    # nemes headdress: a striped hood falling to the shoulders, with a gold band
    hr = b.hr
    nemes = L.blob('nemes', b.hc + V((0, 0.02, 0.02)), (hr * 1.18, hr * 1.18, hr * 1.12), segs=(24, 16))
    bm = bmesh.new()
    bm.from_mesh(nemes.data)
    kill = [f for f in bm.faces if (lambda d: d.y < -0.3 and d.z < 0.55)((f.calc_center_median() - b.hc).normalized())]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(nemes.data)
    bm.free()
    L.set_mat(nemes, teal)
    nemes.data.materials.append(gold)
    for p in nemes.data.polygons:
        d = (p.center - b.hc)
        if int((d.z + 1) / (hr * 0.24)) % 2 == 0:
            p.material_index = 1
    mod = nemes.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = 0.012
    mod.offset = -1
    L.apply_mods(nemes)
    L.subdivide(nemes, 1)
    c.add('head', nemes)
    for sx in (-1, 1):
        lap = [b.hc + V((sx * hr * 0.95, -hr * 0.1, -hr * 0.2)), b.hc + V((sx * hr * 1.25, -hr * 0.25, -hr * 1.1)),
               b.hc + V((sx * hr * 1.2, -hr * 0.45, -hr * 2.0))]
        c.add('head', tube('lappet', spline(lap, steps=4), [(0, hr * 0.38), (1, hr * 0.45)], hr * 0.06, n=8,
                           side=(0, 1, 0), mat=teal))
        sp = spline(lap, steps=4)
        for k in range(3):
            q = sp[min(len(sp) - 1, 2 + k * 2)]
            c.add('head', tube('lapband', [q, q + V((0, 0, -hr * 0.12))], hr * 0.47, hr * 0.07, n=8, side=(0, 1, 0),
                               mat=gold))
    c.add('head', ring('crownband', b.hc + V((0, 0, hr * 0.5)), hr * 1.08, hr * 1.1, hr * 0.12, thick_z=0.008, n=8,
                       segs=28, mat=gold, power=3, rot=(-12, 0, 0)))
    c.add('head', L.blob('uraeus', b.hc + V((0, -hr * 1.12, hr * 0.62)), (hr * 0.12, hr * 0.08, hr * 0.18),
                         mat=c.m('uraeus', '#8FF3FF', emit='#8FF3FF', strength=2.0), segs=(10, 8)))
    # reclining lion body
    c.add('body', tube('lionbody', spline([V((0, 0.45, 0.28)), V((0, 0.15, 0.36)), V((0, -0.2, 0.46)), V((0, -0.36, 0.6))], steps=4),
                       [(0, 0.17), (0.4, 0.22), (1, 0.18)], [(0, 0.15), (0.5, 0.2), (1, 0.2)], n=16, side=(1, 0, 0), mat=lion))
    c.add('body', L.blob('chest', V((0, -0.36, 0.58)), (0.17, 0.12, 0.2), mat=lion2, segs=(14, 10)))
    c.add('body', tube('sphinxneck', [V((0, -0.34, 0.66)), V((0, -0.41, 0.9))], 0.075, 0.07, n=12, mat=lion))
    c.add('body', tube('liontail', spline([V((0, 0.55, 0.25)), V((0.14, 0.62, 0.1)), V((0.28, 0.45, 0.06))], steps=4),
                       [(0, 0.03), (1, 0.02)], n=8, mat=lion))
    c.add('body', L.blob('tuft', V((0.3, 0.43, 0.06)), (0.04, 0.05, 0.035), mat=c.m('tuft', '#8A5E3F'), segs=(10, 8)))
    for sx in (-1, 1):
        # forepaws stretched forward, haunches folded
        c.add('body', tube('foreleg', spline([V((sx * 0.13, -0.25, 0.42)), V((sx * 0.15, -0.45, 0.12)), V((sx * 0.14, -0.72, 0.06))], steps=4),
                           [(0, 0.08), (0.5, 0.06), (1, 0.06)], n=12, mat=lion))
        c.add('body', L.blob('paw', V((sx * 0.14, -0.76, 0.05)), (0.07, 0.08, 0.05), mat=lion2, segs=(12, 8)))
        c.add('body', L.blob('haunch', V((sx * 0.17, 0.3, 0.24)), (0.12, 0.22, 0.2), mat=lion, segs=(14, 10)))
        c.add('body', L.blob('hindpaw', V((sx * 0.2, 0.05, 0.05)), (0.07, 0.11, 0.05), mat=lion2, segs=(12, 8)))
        # folded wings of the librarian
        wing = spline([V((sx * 0.16, -0.15, 0.62)), V((sx * 0.24, 0.15, 0.68)), V((sx * 0.2, 0.42, 0.52))], steps=4)
        c.add('body', tube('wing', wing, [(0, 0.06), (0.5, 0.1), (1, 0.0)], [(0, 0.02), (1, 0.01)], n=8, side=(0, 0, 1),
                           mat=c.m('wingfeather', '#2B6C86'), cap1=False))
        c.add('body', tube('wingedge', [p + V((0, 0, 0.012)) for p in wing], [(0, 0.035), (0.5, 0.06), (1, 0.0)], 0.012,
                           n=6, side=(0, 0, 1), mat=gold, cap1=False))
    # an open book between the paws
    c.add('body', L.box('book', V((0, -0.72, 0.08)), (0.26, 0.18, 0.03), mat=c.m('book', '#6B3B37'), bevel=0.008, rot=(0, 0, 0)))
    for sx in (-1, 1):
        c.add('body', L.box('page', V((sx * 0.065, -0.72, 0.1)), (0.12, 0.16, 0.012), mat=c.m('page', '#F3EBDD'),
                            rot=(0, sx * 8, 0)))
    return c.finish(export=export)


BUILDERS = {
    'itsuki': lambda e=True: build_itsuki(False, e),
    'itsuki_mirror': lambda e=True: build_itsuki(True, e),
    'lethe': build_lethe,
    'mom': build_mom,
    'tomo': build_tomo,
    'pix': build_pix,
    'wade': build_wade,
    'vesper': build_vesper,
    'brakk': build_brakk,
    'sable': build_sable,
    'overflow': build_overflow,
    'deadlock': build_deadlock,
    'segfault': build_segfault,
    'null': build_null,
    'golem': lambda e=True: build_golem('warden', e),
    'golem_forge': lambda e=True: build_golem('forge', e),
    'stag': build_stag,
    'sphinx': build_sphinx,
}


def build(name, export=True):
    return BUILDERS[name](export)


def build_all(export=True, names=None):
    out = {}
    for n in names or BUILDERS:
        r = build(n, export)
        out[n] = (r[1], r[2][1] if r[2] else None)
    return out
