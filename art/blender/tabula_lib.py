"""TABULA modeling library for Blender (run inside Blender through Blender MCP or the Python console).

Everything is built procedurally so the models can be regenerated from source:

- `tube()` sweeps a (super)elliptical cross-section along a path: limbs, torsos, coats, hair locks,
  horns, scarves and tails all come from it.
- `blob()` makes deformed spheres (heads, hair caps, rocks).
- `paint_face()` rasterises an anime face (big glossy eyes, lash lines, brows, blush) into a texture
  that is projected onto the front of a head.
- Materials are plain Principled BSDFs named `<asset>.<role>`; the game turns them into cel-shaded
  toon materials and draws screen-space outlines, so nothing here is engine-specific.

Conventions: Blender is Z-up and every character faces -Y (glTF +Z, the game's forward).
Units are metres. A character's root sits at its feet.
"""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

V = Vector
ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(ROOT, '..', '..'))
TEX_DIR = os.path.join(ROOT, 'textures')
OUT_DIR = os.path.join(REPO, 'public', 'models')


# ---------------------------------------------------------------------------------------------
# colour


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def lin(h):
    r, g, b = hex_rgb(h)
    return (to_linear(r), to_linear(g), to_linear(b), 1.0)


def mix_hex(a, b, k):
    """k=1 gives a, k=0 gives b."""
    ra, rb = hex_rgb(a), hex_rgb(b)
    return '#' + ''.join(f'{round((x * k + y * (1 - k)) * 255):02x}' for x, y in zip(ra, rb))


# ---------------------------------------------------------------------------------------------
# scene + collections


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')


def purge_default():
    for name in ('Cube', 'Light', 'Camera'):
        o = bpy.data.objects.get(name)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)


def fresh_collection(name):
    """A clean collection for one asset; rebuilding an asset replaces only its own objects."""
    ensure_object_mode()
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.all_objects):
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if data is not None and getattr(data, 'users', 1) == 0:
                if isinstance(data, bpy.types.Mesh):
                    bpy.data.meshes.remove(data)
    else:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    for m in list(bpy.data.materials):
        if m.name.startswith(name + '.') and m.users == 0:
            bpy.data.materials.remove(m)
    _ctx['col'] = col
    _ctx['asset'] = name
    return col


_ctx = {'col': None, 'asset': 'asset'}


def link(o):
    col = _ctx['col'] or bpy.context.scene.collection
    col.objects.link(o)
    return o


def pivot(name, loc=(0, 0, 0), parent=None):
    """An empty used as an animation pivot; it becomes a glTF node the game can rotate."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.08
    link(e)
    if parent:
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    e.matrix_world = Matrix.Translation(V(loc))
    return e


def attach(objs, parent):
    bpy.context.view_layer.update()
    if not isinstance(objs, (list, tuple)):
        objs = [objs]
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
        o.matrix_world = mw
    return objs


# ---------------------------------------------------------------------------------------------
# materials


def material(role, color, *, rough=0.75, emit=None, strength=1.0, tex=None, alpha=None):
    """Principled material named '<asset>.<role>'. emit makes it glow (the game draws it unlit)."""
    name = f"{_ctx['asset']}.{role}"
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (-300, 0)
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs['Base Color'].default_value = lin(color)
    bsdf.inputs['Roughness'].default_value = rough
    for key in ('Specular IOR Level', 'Specular'):
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = 0.2
            break
    if tex is not None:
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = tex
        tn.location = (-700, 0)
        tn.interpolation = 'Linear'
        nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha:
            nt.links.new(tn.outputs['Alpha'], bsdf.inputs['Alpha'])
    if emit:
        bsdf.inputs['Emission Color'].default_value = lin(emit)
        bsdf.inputs['Emission Strength'].default_value = strength
    if alpha is not None and tex is None:
        bsdf.inputs['Alpha'].default_value = alpha
    if alpha is not None:
        try:
            m.surface_render_method = 'BLENDED'
        except (AttributeError, TypeError):
            pass
    m.diffuse_color = lin(color)
    return m


def set_mat(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


# ---------------------------------------------------------------------------------------------
# path + profile helpers


def bez(p0, p1, p2, p3=None, steps=10):
    """Quadratic (3 points) or cubic (4 points) Bezier sampled into steps+1 points."""
    p0, p1, p2 = V(p0), V(p1), V(p2)
    pts = []
    for i in range(steps + 1):
        t = i / steps
        if p3 is None:
            p = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2
        else:
            q3 = V(p3)
            p = (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t**3 * q3
        pts.append(p)
    return pts


def spline(points, steps=6):
    """Catmull-Rom through the points."""
    P = [V(p) for p in points]
    P = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(
                0.5
                * (
                    (2 * p1)
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
                )
            )
    out.append(P[-2])
    return out


def line(a, b, steps=4):
    a, b = V(a), V(b)
    return [a.lerp(b, i / steps) for i in range(steps + 1)]


def smooth01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def prof(keys):
    """Piecewise smooth profile through (t, value) keys; returns f(t)."""
    keys = sorted(keys)

    def f(t):
        if t <= keys[0][0]:
            return keys[0][1]
        for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
            if t <= t1:
                k = smooth01((t - t0) / max(t1 - t0, 1e-9))
                return v0 + (v1 - v0) * k
        return keys[-1][1]

    return f


def _arc_params(pts):
    d = [0.0]
    for a, b in zip(pts, pts[1:]):
        d.append(d[-1] + (b - a).length)
    tot = d[-1] or 1.0
    return [x / tot for x in d]


def _as_fn(v):
    if callable(v):
        return v
    if isinstance(v, (list, tuple)):
        return prof(list(v)) if v and isinstance(v[0], (list, tuple)) else (lambda t, c=v: c)
    return lambda t, c=v: c


# ---------------------------------------------------------------------------------------------
# meshes


def _mesh_obj(name, verts, faces, m=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate(clean_customdata=False)
    me.update()
    o = bpy.data.objects.new(name, me)
    link(o)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    if m is not None:
        set_mat(o, m)
    return o


def tube(
    name,
    pts,
    rx,
    ry=None,
    ryf=None,
    *,
    n=12,
    side=(1, 0, 0),
    power=2.0,
    cap0=True,
    cap1=True,
    mat=None,
    subd=1,
    twist=0.0,
    flat_front=0.0,
    closed=False,
):
    """Sweep an elliptical section along pts.

    rx: half-width along the side axis; ry: half-depth toward the back; ryf: half-depth toward the
    front (defaults to ry). Each may be a number, a callable f(t) over arc length t in 0..1, or a
    list of (t, value) keys. side: hint for the width axis at the start. power>2 squares the
    section. Rings whose radius is ~0 collapse to a point, which makes tips.
    """
    pts = [V(p) for p in pts]
    ts = _arc_params(pts)
    fx = _as_fn(rx)
    fy = _as_fn(ry if ry is not None else rx)
    ff = _as_fn(ryf) if ryf is not None else fy
    ftw = _as_fn(twist)
    m = len(pts)
    T = []
    for i in range(m):
        if closed:
            t = (pts[(i + 1) % m] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        elif i == 0:
            t = pts[1] - pts[0]
        elif i == m - 1:
            t = pts[-1] - pts[-2]
        else:
            t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
        T.append(t.normalized())
    s = V(side)
    s = (s - T[0] * s.dot(T[0]))
    if s.length < 1e-6:
        s = V((0, 1, 0)) - T[0] * T[0].y
    s.normalize()
    frames = []
    for i in range(m):
        if i > 0:
            q = T[i - 1].rotation_difference(T[i])
            s = q @ s
            s = (s - T[i] * s.dot(T[i])).normalized()
        nrm = s.cross(T[i]).normalized()  # for an upward tube with side +X this is -Y: the front
        frames.append((s, nrm))
    verts, faces, rings = [], [], []
    e = 2.0 / power
    for i, (p, t) in enumerate(zip(pts, ts)):
        sx, nf = frames[i]
        a0 = ftw(t)
        if a0:
            c, sn = math.cos(a0), math.sin(a0)
            sx, nf = sx * c + nf * sn, nf * c - sx * sn
        rxv, ryb, ryfv = fx(t), fy(t), ff(t)
        if max(rxv, ryb, ryfv) < 1e-5:
            rings.append([len(verts)])
            verts.append(p.copy())
            continue
        ring = []
        for k in range(n):
            a = 2 * math.pi * k / n
            ca, sa = math.cos(a), math.sin(a)
            x = math.copysign(abs(ca) ** e, ca) * rxv
            yv = math.copysign(abs(sa) ** e, sa)
            depth = (ryfv if yv > 0 else ryb) * yv
            if flat_front and yv > 0:
                depth *= 1 - flat_front * yv * yv
            ring.append(len(verts))
            verts.append(p + sx * x + nf * depth)
        rings.append(ring)
    pairs = list(zip(rings, rings[1:]))
    if closed:
        pairs.append((rings[-1], rings[0]))
        cap0 = cap1 = False
    for r0, r1 in pairs:
        if len(r0) == 1 and len(r1) == 1:
            continue
        if len(r0) == 1:
            for k in range(n):
                faces.append((r0[0], r1[k], r1[(k + 1) % n]))
        elif len(r1) == 1:
            for k in range(n):
                faces.append((r0[k], r1[0], r0[(k + 1) % n]))
        else:
            for k in range(n):
                faces.append((r0[k], r1[k], r1[(k + 1) % n], r0[(k + 1) % n]))
    if cap0 and len(rings[0]) > 1:
        c = len(verts)
        verts.append(sum((verts[i] for i in rings[0]), V()) / n - T[0] * 0.0)
        for k in range(n):
            faces.append((rings[0][(k + 1) % n], c, rings[0][k]))
    if cap1 and len(rings[-1]) > 1:
        c = len(verts)
        verts.append(sum((verts[i] for i in rings[-1]), V()) / n)
        for k in range(n):
            faces.append((rings[-1][k], c, rings[-1][(k + 1) % n]))
    o = _mesh_obj(name, verts, faces, mat)
    _fix_normals(o)
    if subd:
        subdivide(o, subd)
    return o


def _fix_normals(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()


def subdivide(o, levels=1):
    mod = o.modifiers.new('subd', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    apply_mods(o)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def apply_mods(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    old = o.data
    o.modifiers.clear()
    o.data = me
    me.name = o.name
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return o


def blob(name, center, radii, *, mat=None, segs=(20, 14), deform=None, subd=0):
    """A UV sphere scaled to radii, optionally reshaped by deform(local Vector) -> Vector."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs[0], v_segments=segs[1], radius=1.0)
    rx, ry, rz = radii if isinstance(radii, (list, tuple)) else (radii, radii, radii)
    for v in bm.verts:
        p = V((v.co.x * rx, v.co.y * ry, v.co.z * rz))
        if deform:
            p = V(deform(p))
        v.co = p + V(center)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o)
    for p in me.polygons:
        p.use_smooth = True
    if mat is not None:
        set_mat(o, mat)
    if subd:
        subdivide(o, subd)
    return o


def box(name, center, size, *, mat=None, bevel=0.0, segs=2, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = V((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    link(o)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segs
        mod.limit_method = 'NONE'
        apply_mods(o)
    o.rotation_euler = [math.radians(a) for a in rot]
    o.location = V(center)
    bake_transform(o)
    if mat is not None:
        set_mat(o, mat)
    return o


def cylinder(name, center, r, h, *, mat=None, n=24, bevel=0.0, r_top=None, rot=(0, 0, 0)):
    rt = r if r_top is None else r_top
    pts = [V((0, 0, -h / 2)), V((0, 0, h / 2))]
    o = tube(name, pts, [(0, r), (1, rt)], n=n, mat=mat, subd=0)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = 'ANGLE'
        apply_mods(o)
    o.rotation_euler = [math.radians(a) for a in rot]
    o.location = V(center)
    bake_transform(o)
    return o


def bake_transform(o):
    """Apply the object's own transform into its mesh (keeps parenting intact)."""
    if o.type != 'MESH':
        return o
    if o.parent is None:
        mw = o.matrix_basis.copy()
    else:
        bpy.context.view_layer.update()
        mw = o.matrix_world.copy()
    o.data.transform(mw)
    o.parent = None
    o.matrix_basis = Matrix()
    return o


def transform(o, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    m = (
        Matrix.Translation(V(loc))
        @ Matrix.Rotation(math.radians(rot[2]), 4, 'Z')
        @ Matrix.Rotation(math.radians(rot[1]), 4, 'Y')
        @ Matrix.Rotation(math.radians(rot[0]), 4, 'X')
        @ Matrix.Diagonal(V((*scale, 1)))
    )
    o.data.transform(m)
    o.data.update()
    return o


def mirror_x(o, name=None):
    """A mirrored copy across x=0 (normals fixed)."""
    me = o.data.copy()
    c = bpy.data.objects.new(name or (o.name + '.R'), me)
    link(c)
    me.transform(Matrix.Diagonal(V((-1, 1, 1, 1))))
    me.flip_normals()
    me.update()
    return c


def join(objs, name=None):
    """Join meshes into the first; returns it."""
    objs = [o for o in objs if o is not None]
    if len(objs) == 1:
        if name:
            objs[0].name = name
            objs[0].data.name = name
        return objs[0]
    base = objs[0]
    for o in objs:
        bake_transform(o)
    bm = bmesh.new()
    mats = []
    for o in objs:
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        remap = []
        for m in o.data.materials:
            if m not in mats:
                mats.append(m)
            remap.append(mats.index(m))
        for f in tmp.faces:
            if remap:
                f.material_index = remap[f.material_index] if f.material_index < len(remap) else 0
        # copy uv layers by name
        me_tmp = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me_tmp)
        tmp.free()
        bm.from_mesh(me_tmp)
        bpy.data.meshes.remove(me_tmp)
    me = bpy.data.meshes.new(name or base.name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    for o in objs:
        old = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if old.users == 0:
            bpy.data.meshes.remove(old)
    out = bpy.data.objects.new(name or 'joined', me)
    link(out)
    return out


def sharp_shading(o):
    for p in o.data.polygons:
        p.use_smooth = False
    return o


def displace(o, fn):
    """Move every vertex: fn(Vector) -> Vector."""
    for v in o.data.vertices:
        v.co = V(fn(v.co.copy()))
    o.data.update()
    return o


def noise_displace(o, amp=0.02, scale=1.5, seed=0):
    from mathutils import noise

    off = V((seed * 13.1, seed * 7.7, seed * 3.3))
    for v in o.data.vertices:
        n = noise.noise(v.co * scale + off)
        v.co += v.normal * n * amp
    o.data.update()
    return o


# ---------------------------------------------------------------------------------------------
# hair


def ring(name, center, rx, ry, thick, *, thick_z=None, n=8, segs=24, mat=None, subd=1, rot=(0, 0, 0), power=2.0):
    """A closed band around the Z axis: belts, collars, scarf wraps, rings.

    thick is the band's half-height (along Z), thick_z its half-thickness (radial)."""
    pts = [V((math.cos(2 * math.pi * i / segs) * rx, math.sin(2 * math.pi * i / segs) * ry, 0)) for i in range(segs)]
    o = tube(name, pts, thick, thick_z if thick_z is not None else thick, n=n, side=(0, 0, 1), closed=True, mat=mat,
             subd=subd, power=power)
    o.rotation_euler = [math.radians(a) for a in rot]
    o.location = V(center)
    return bake_transform(o)


def lock(name, root, tip, *, bend=(0, 0, 0), width=0.04, thick=None, mat=None, n=6, side=None, belly=0.3, curl=None):
    """An anime hair lock: a flattened, tapering blade from root to tip that bows by `bend`.

    side: the axis the blade is wide along (defaults to horizontal across the path).
    curl: optional extra control point offset near the tip (for flicks).
    """
    root, tip = V(root), V(tip)
    mid = root.lerp(tip, 0.45) + V(bend)
    if curl is not None:
        p3 = tip
        p2 = root.lerp(tip, 0.8) + V(bend) * 0.6 + V(curl)
        pts = bez(root, mid, p2, p3, steps=10)
    else:
        pts = bez(root, mid, tip, steps=10)
    if side is None:
        d = (tip - root).normalized()
        side = d.cross(V((0, 0, 1)))
        if side.length < 1e-3:
            side = V((1, 0, 0))
    th = thick if thick is not None else width * 0.38
    rx = [(0, width * 0.85), (belly, width), (0.75, width * 0.55), (1, 0.0)]
    ry = [(0, th), (belly, th), (0.8, th * 0.5), (1, 0.0)]
    return tube(name, pts, rx, ry, n=n, side=side, mat=mat, cap0=True, cap1=False, subd=1)


# ---------------------------------------------------------------------------------------------
# anime face texture


class Canvas:
    """A small RGBA rasteriser in head space: x across the face, z up (metres)."""

    def __init__(self, size, cx, cz, half, bg):
        self.n = size
        self.half = half
        self.cx, self.cz = cx, cz
        self.px = 2 * half / size
        ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
        # row 0 is the TOP of the image here; flipped when written to Blender
        self.X = cx - half + (xs + 0.5) * self.px
        self.Z = cz + half - (ys + 0.5) * self.px
        r, g, b = hex_rgb(bg)
        self.img = np.zeros((size, size, 4), np.float32)
        self.img[..., 0], self.img[..., 1], self.img[..., 2], self.img[..., 3] = r, g, b, 1

    def over(self, cov, color, alpha=1.0):
        if isinstance(color, str):
            color = hex_rgb(color)
        a = np.clip(cov, 0, 1)[..., None] * alpha
        col = np.asarray(color, np.float32)
        if col.ndim == 1:
            col = col[None, None, :3]
        self.img[..., :3] = self.img[..., :3] * (1 - a) + col[..., :3] * a

    def ellipse(self, cx, cz, rx, rz, rot=0.0, soft=1.0):
        dx, dz = self.X - cx, self.Z - cz
        if rot:
            c, s = math.cos(rot), math.sin(rot)
            dx, dz = dx * c + dz * s, -dx * s + dz * c
        d = np.sqrt((dx / rx) ** 2 + (dz / rz) ** 2)
        edge = soft * self.px / min(rx, rz)
        return np.clip((1 - d) / edge + 0.5, 0, 1)

    def soft_ellipse(self, cx, cz, rx, rz):
        d = np.sqrt(((self.X - cx) / rx) ** 2 + ((self.Z - cz) / rz) ** 2)
        return np.clip(1 - d, 0, 1) ** 1.5

    def stroke(self, pts, widths):
        """Coverage of a polyline with per-point half-widths."""
        pts = [np.array(p, np.float32) for p in pts]
        widths = list(widths)
        cov = np.zeros_like(self.X)
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            wa, wb = widths[i], widths[i + 1]
            ab = b - a
            L2 = float(ab @ ab) or 1e-12
            t = np.clip(((self.X - a[0]) * ab[0] + (self.Z - a[1]) * ab[1]) / L2, 0, 1)
            qx = a[0] + t * ab[0]
            qz = a[1] + t * ab[1]
            d = np.sqrt((self.X - qx) ** 2 + (self.Z - qz) ** 2)
            w = wa + (wb - wa) * t
            cov = np.maximum(cov, np.clip((w - d) / self.px + 0.5, 0, 1))
        return cov

    def curve(self, p0, p1, p2, w0, w1, w2=None, steps=24):
        pts, ws = [], []
        for i in range(steps + 1):
            t = i / steps
            x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
            z = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
            pts.append((x, z))
            if w2 is None:
                ws.append(w0 + (w1 - w0) * t)
            else:
                ws.append(w0 + (w1 - w0) * (t / 0.5) if t < 0.5 else w1 + (w2 - w1) * ((t - 0.5) / 0.5))
        return self.stroke(pts, ws)

    def to_image(self, name, path=None):
        n = self.n
        img = bpy.data.images.get(name)
        if img is None or img.size[0] != n:
            if img:
                bpy.data.images.remove(img)
            img = bpy.data.images.new(name, n, n, alpha=False)
        flat = np.flipud(np.clip(self.img, 0, 1)).reshape(-1)
        img.pixels.foreach_set(flat)
        img.update()
        if path:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            img.filepath_raw = path
            img.file_format = 'PNG'
            img.save()
        return img


def _lerp3(a, b, k):
    return tuple(x * (1 - k) + y * k for x, y in zip(a, b))


def paint_face(asset, f):
    """Paint an anime face. f: dict of face params (head-space metres, see characters.py)."""
    size = f.get('size', 512)
    cv = Canvas(size, 0.0, f['cz'], f['half'], f['skin'])
    s = f['eye_s']  # eye half-width
    ex, ez = f['eye_x'], f['eye_z']
    iris = hex_rgb(f['iris'])
    lash = f.get('lash', '#2A1C3A')
    dark_iris = _lerp3(iris, hex_rgb(lash), 0.62)
    light_iris = _lerp3(iris, (1, 1, 1), 0.38)
    style = f.get('style', 'bright')  # bright | sleepy | sharp | devil
    open_k = {'bright': 1.0, 'sleepy': 0.55, 'sharp': 0.78, 'devil': 0.9}[style]
    tilt = {'bright': 0.0, 'sleepy': -0.05, 'sharp': 0.18, 'devil': 0.12}[style]

    # blush under the eyes
    for sx in (-1, 1):
        cv.over(cv.soft_ellipse(sx * (ex + s * 0.25), ez - s * 1.35, s * 1.05, s * 0.42), f.get('blush', '#FF8FAA'), 0.3)
        if f.get('blush_lines', False):
            for k in range(3):
                bx = sx * (ex + s * (-0.15 + 0.32 * k))
                cv.over(
                    cv.stroke([(bx + sx * s * 0.06, ez - s * 1.22), (bx - sx * s * 0.08, ez - s * 1.48)], [s * 0.035, s * 0.02]),
                    mix_hex(f.get('blush', '#FF8FAA'), lash, 0.7),
                    0.5,
                )

    for sx in (-1, 1):
        cx = sx * ex

        def P(u, w):
            # eye-local (u outward, w up) -> head space; the outer corner lifts by tilt
            return (cx + sx * u * s, ez + (w + tilt * u) * s)

        # eye opening: white with a lavender top shadow
        ox, oz = P(0, -0.05)
        # almond: a wide, shallow opening (the newest Genshin cast), not a round moe eye
        opening = cv.ellipse(ox, oz, s * 0.98, s * 0.8 * open_k)
        top_cut = cv.Z < (ez + (0.68 * open_k) * s)
        opening = opening * top_cut
        cv.over(opening, '#FBF8FF')
        shade_top = cv.ellipse(ox, oz + s * 0.55 * open_k, s * 1.0, s * 0.5 * open_k)
        cv.over(opening * shade_top, '#C9C0E6', 0.65)
        # iris with a vertical gradient
        ix, iz = P(-0.06, -0.12 * open_k)
        irx, irz = s * 0.66, s * 0.95 * max(open_k, 0.7)
        ir = cv.ellipse(ix, iz, irx, irz) * opening
        g = np.clip((cv.Z - (iz - irz)) / (2 * irz), 0, 1)[..., None]
        grad = np.asarray(light_iris, np.float32)[None, None] * (1 - g) + np.asarray(dark_iris, np.float32)[None, None] * g
        grad = np.concatenate([grad, np.ones_like(g)], axis=-1)
        cv.over(ir, grad)
        ring = ir * (1 - cv.ellipse(ix, iz, irx * 0.84, irz * 0.88))
        cv.over(ring, mix_hex(f['iris'], lash, 0.35), 0.85)
        # pupil
        if style == 'devil':
            pup = cv.ellipse(ix, iz + s * 0.05, s * 0.09, s * 0.55) * opening
        else:
            pup = cv.ellipse(ix, iz + s * 0.08, s * 0.27, s * 0.42 * max(open_k, 0.7)) * opening
        cv.over(pup, _lerp3(dark_iris, hex_rgb(lash), 0.5))
        # lower glow and sparkle
        cv.over(cv.ellipse(ix, iz - irz * 0.55, irx * 0.62, irz * 0.3) * ir, _lerp3(light_iris, (1, 1, 1), 0.35), 0.75)
        # highlights sit on the same side in both eyes (light from the upper left)
        hx, hz = ix - s * 0.3, iz + irz * 0.42
        cv.over(cv.ellipse(hx, hz, s * 0.2, s * 0.26 * max(open_k, 0.6)) * opening, '#FFFFFF')
        hx, hz = ix + s * 0.28, iz - irz * 0.5
        cv.over(cv.ellipse(hx, hz, s * 0.09, s * 0.09) * opening, '#FFFFFF', 0.9)
        hx, hz = ix + s * 0.12, iz + irz * 0.55
        cv.over(cv.ellipse(hx, hz, s * 0.05, s * 0.05) * opening, '#FFFFFF', 0.8)
        # upper lash line: thick, with an outer flick
        top = 0.76 * open_k
        a, b, c = P(-1.02, top * 0.35), P(-0.1, top * 1.08 + 0.05), P(1.08, top * 0.58)
        cv.over(cv.curve(a, b, c, s * 0.07, s * 0.15, s * 0.12), lash)
        d, e = P(1.08, top * 0.58), P(1.28, top * 0.25 - 0.05)
        cv.over(cv.stroke([d, e], [s * 0.11, s * 0.02]), lash)
        if f.get('lashes', False):
            for u, w, du, dw in ((0.75, top * 0.85, 0.35, 0.18), (1.0, top * 0.65, 0.38, 0.05)):
                p0, p1 = P(u, w), P(u + du, w + dw)
                cv.over(cv.stroke([p0, p1], [s * 0.06, s * 0.01]), lash)
        # lower lash and lid crease
        a, b, c = P(0.2, -0.93 * open_k), P(0.62, -0.86 * open_k), P(0.9, -0.62 * open_k)
        cv.over(cv.curve(a, b, c, s * 0.012, s * 0.03, s * 0.012), mix_hex(lash, f['skin'], 0.75), 0.85)
        a, b, c = P(-0.55, top + 0.32), P(0.2, top + 0.42), P(0.85, top + 0.2)
        cv.over(cv.curve(a, b, c, s * 0.02, s * 0.03, s * 0.01), mix_hex(lash, f['skin'], 0.6), 0.55)
        # brow
        bt = {'bright': 0.0, 'sleepy': -0.1, 'sharp': -0.3, 'devil': -0.22}[style]
        a = P(-0.75, 1.62 + bt * -0.6)
        b = P(0.1, 1.82)
        c = P(0.95, 1.58 + bt)
        cv.over(cv.curve(a, b, c, s * 0.03, s * 0.04, s * 0.012), f.get('brow', lash), 0.85)

    # nose hint and mouth
    nz = ez - s * 1.3
    cv.over(cv.stroke([(s * 0.04, nz + s * 0.1), (s * 0.0, nz - s * 0.05)], [s * 0.03, s * 0.02]), mix_hex(f['skin'], '#B06070', 0.55), 0.6)
    mz = f.get('mouth_z', ez - s * 2.2)
    mw = f.get('mouth_w', s * 0.4)
    mouth = f.get('mouth', 'smile')
    mc = f.get('mouth_color', '#8A3A4A')
    if mouth == 'smile':
        cv.over(cv.curve((-mw, mz + s * 0.06), (0, mz - s * 0.16), (mw, mz + s * 0.06), s * 0.025, s * 0.05, s * 0.025), mc)
    elif mouth == 'grin':
        op = cv.ellipse(0, mz - s * 0.05, mw * 0.9, s * 0.28) * (cv.Z < mz + s * 0.04)
        cv.over(op, '#7A2A3A')
        cv.over(cv.ellipse(0, mz - s * 0.22, mw * 0.55, s * 0.12) * op, '#FF8FA8')
        if f.get('fang'):
            cv.over(cv.stroke([(mw * 0.45, mz + s * 0.03), (mw * 0.38, mz - s * 0.18)], [s * 0.09, s * 0.0]), '#FFFFFF')
        cv.over(cv.curve((-mw, mz + s * 0.04), (0, mz + s * 0.0), (mw, mz + s * 0.04), s * 0.025, s * 0.03, s * 0.025), mc)
    elif mouth == 'smirk':
        cv.over(cv.curve((-mw * 0.8, mz), (mw * 0.1, mz - s * 0.06), (mw, mz + s * 0.12), s * 0.02, s * 0.04, s * 0.025), mc)
    else:  # flat
        cv.over(cv.stroke([(-mw * 0.7, mz), (mw * 0.7, mz)], [s * 0.025, s * 0.025]), mc)
    for extra in f.get('extras', []):
        extra(cv)
    path = os.path.join(TEX_DIR, f'{asset}_face.png')
    return cv.to_image(f'{asset}_face', path)


def project_front(o, cx, cz, half, face_mat_index, skin_mat_index, front_limit=0.0, center_y=0.0):
    """Front-project UVs for the head: faces whose normals look forward get the face texture."""
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active.data
    for p in me.polygons:
        front = p.normal.y < -0.15 and p.center.y < center_y - front_limit
        p.material_index = face_mat_index if front else skin_mat_index
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if front:
                uv[li].uv = ((co.x - cx) / (2 * half) + 0.5, (co.z - cz) / (2 * half) + 0.5)
            else:
                uv[li].uv = (0.005, 0.005)
    me.update()


# ---------------------------------------------------------------------------------------------
# export


def descendants(o):
    out = [o]
    for c in o.children:
        out += descendants(c)
    return out


def export_glb(root, filename, *, draco=True, vcol=False):
    """vcol exports each mesh's active colour attribute as COLOR_0 (painted gradients)."""
    ensure_object_mode()
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.object.select_all(action='DESELECT')
    for o in descendants(root):
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    kw = dict(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials='EXPORT',
        export_animations=False,
        export_extras=True,
        export_vertex_color='ACTIVE' if vcol else 'NONE',
    )
    if draco:
        kw.update(
            export_draco_mesh_compression_enable=True,
            export_draco_mesh_compression_level=6,
            export_draco_position_quantization=14,
            export_draco_normal_quantization=10,
            export_draco_texcoord_quantization=12,
            export_draco_color_quantization=10,
        )
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        kw.pop('export_vertex_color', None)
        bpy.ops.export_scene.gltf(**kw)
    bpy.ops.object.select_all(action='DESELECT')
    return path, os.path.getsize(path)


def stats(root):
    tris = 0
    for o in descendants(root):
        if o.type == 'MESH':
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    return tris
