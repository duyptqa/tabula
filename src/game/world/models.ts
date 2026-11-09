// Toy-like primitive models: matte clay materials with inverted-hull outlines tinted to the local
// colour (never pure black), per the TABULA art direction.
import { BLEND_NORMAL, CULLFACE_FRONT, Color, Entity, StandardMaterial } from 'playcanvas';
import type { MeshInstance } from 'playcanvas';

import type { ChibiSpec } from '../ui/portraits';

export type V3 = [number, number, number];
export type Prim = 'box' | 'sphere' | 'cylinder' | 'cone' | 'capsule' | 'torus' | 'plane';

const matCache = new Map<string, StandardMaterial>();

export function hex(c: string): Color {
    return new Color().fromString(c);
}

function shade(c: string, k: number, toward = '#2A1F4A'): string {
    const a = hex(c);
    const b = hex(toward);
    const mix = (x: number, y: number) => Math.round((x * k + y * (1 - k)) * 255);
    const h = (n: number) => n.toString(16).padStart(2, '0');
    return `#${h(mix(a.r, b.r))}${h(mix(a.g, b.g))}${h(mix(a.b, b.b))}`;
}

export interface MatOpts {
    emissive?: string;
    ei?: number;
    unlit?: boolean;
    opacity?: number;
    gloss?: number;
}

export function mat(color: string, o: MatOpts = {}): StandardMaterial {
    const key = `${color}|${o.emissive ?? ''}|${o.ei ?? 1}|${o.unlit ? 1 : 0}|${o.opacity ?? 1}|${o.gloss ?? 0.22}`;
    const hit = matCache.get(key);
    if (hit) return hit;
    const m = new StandardMaterial();
    if (o.unlit) {
        m.useLighting = false;
        m.useSkybox = false;
        m.diffuse = new Color(0, 0, 0);
        m.emissive = hex(color);
        m.emissiveIntensity = o.ei ?? 1;
    } else {
        m.diffuse = hex(color);
        m.useMetalness = true;
        m.metalness = 0;
        m.gloss = o.gloss ?? 0.22;
        if (o.emissive) {
            m.emissive = hex(o.emissive);
            m.emissiveIntensity = o.ei ?? 1;
        }
    }
    if (o.opacity !== undefined && o.opacity < 1) {
        m.opacity = o.opacity;
        m.blendType = BLEND_NORMAL;
        m.depthWrite = false;
    }
    m.update();
    matCache.set(key, m);
    return m;
}

function outlineMat(color: string): StandardMaterial {
    const key = `outline|${color}`;
    const hit = matCache.get(key);
    if (hit) return hit;
    const m = new StandardMaterial();
    m.useLighting = false;
    m.useSkybox = false;
    m.diffuse = new Color(0, 0, 0);
    m.emissive = hex(shade(color, 0.42));
    m.cull = CULLFACE_FRONT;
    m.update();
    matCache.set(key, m);
    return m;
}

export interface PartOpts extends MatOpts {
    pos?: V3;
    rot?: V3;
    scale?: V3 | number;
    color: string;
    outline?: number | false;
    shadow?: boolean;
    name?: string;
}

export function part(parent: Entity, type: Prim, o: PartOpts): Entity {
    const e = new Entity(o.name ?? type);
    const s: V3 = typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : (o.scale ?? [1, 1, 1]);
    e.addComponent('render', {
        type,
        material: mat(o.color, o),
        castShadows: o.shadow ?? !o.unlit,
        receiveShadows: !o.unlit
    });
    if (o.pos) e.setLocalPosition(o.pos[0], o.pos[1], o.pos[2]);
    if (o.rot) e.setLocalEulerAngles(o.rot[0], o.rot[1], o.rot[2]);
    e.setLocalScale(s[0], s[1], s[2]);
    parent.addChild(e);
    const w = o.outline === undefined ? 0 : o.outline;
    if (w && !o.unlit && (o.opacity ?? 1) >= 1 && type !== 'plane') {
        const ol = new Entity('outline');
        ol.addComponent('render', { type, material: outlineMat(o.color), castShadows: false, receiveShadows: false });
        ol.setLocalScale(
            1 + (2 * w) / Math.max(s[0], 0.01),
            1 + (2 * w) / Math.max(s[1], 0.01),
            1 + (2 * w) / Math.max(s[2], 0.01)
        );
        e.addChild(ol);
    }
    return e;
}

export function group(parent: Entity, name: string, pos: V3 = [0, 0, 0], rotY = 0): Entity {
    const g = new Entity(name);
    g.setLocalPosition(pos[0], pos[1], pos[2]);
    if (rotY) g.setLocalEulerAngles(0, rotY, 0);
    parent.addChild(g);
    return g;
}

// ---------------------------------------------------------------------------------------------
// Forgetting: anything Itsuki forgets turns paper-white and loses its colour.

const originals = new WeakMap<MeshInstance, StandardMaterial>();
const PAPER = '#F4F1FF';

export function setPaper(root: Entity, on: boolean) {
    const renders = root.findComponents('render') as unknown as { entity: Entity; meshInstances: MeshInstance[] }[];
    for (const rc of renders) {
        const isOutline = rc.entity.name === 'outline';
        for (const mi of rc.meshInstances) {
            const cur = mi.material as StandardMaterial;
            if (on) {
                if (!originals.has(mi)) originals.set(mi, cur);
                const orig = originals.get(mi)!;
                if (isOutline) mi.material = outlineMat('#B9B2D9');
                else if (orig.useLighting === false) mi.material = mat('#FFFFFF', { unlit: true, ei: 0.9 });
                else mi.material = mat(PAPER);
            } else if (originals.has(mi)) {
                mi.material = originals.get(mi)!;
            }
        }
    }
}

/** Put every render component under root, except skipped subtrees, into a batch group. */
export function setBatchGroup(root: Entity, id: number, skip = new Set<Entity>()) {
    const visit = (e: Entity) => {
        if (skip.has(e)) return;
        if (e.render) e.render.batchGroupId = id;
        for (const c of e.children) visit(c as Entity);
    };
    visit(root);
}

// ---------------------------------------------------------------------------------------------
// Characters

export interface Rig {
    root: Entity;
    body: Entity;
    head: Entity;
    armL: Entity;
    armR: Entity;
    legL: Entity | null;
    legR: Entity | null;
    streak: Entity[];
    floating: boolean;
    phase: number;
    bodyY: number;
}

const OL = 0.022;

function face(head: Entity, eye: string, opts: { devil?: boolean; mouth?: string } = {}) {
    for (const sx of [-1, 1]) {
        const x = 0.16 * sx;
        const ry = 21 * sx;
        part(head, 'sphere', {
            color: '#22183A',
            pos: [x, -0.05, 0.395],
            rot: [0, ry, 0],
            scale: [0.14, 0.18, 0.07],
            shadow: false
        });
        part(head, 'sphere', {
            color: eye,
            pos: [x * 1.02, -0.07, 0.418],
            rot: [0, ry, 0],
            scale: [0.1, 0.12, 0.05],
            unlit: true,
            ei: 0.85
        });
        if (opts.devil)
            part(head, 'sphere', {
                color: '#3A1840',
                pos: [x * 1.03, -0.06, 0.44],
                rot: [0, ry, 0],
                scale: [0.025, 0.1, 0.02],
                unlit: true
            });
        part(head, 'sphere', {
            color: '#FFFFFF',
            pos: [x * 0.86, -0.0, 0.437],
            scale: [0.05, 0.05, 0.03],
            unlit: true
        });
        part(head, 'sphere', {
            color: '#FF9DB0',
            pos: [0.26 * sx, -0.16, 0.345],
            rot: [0, 36 * sx, 0],
            scale: [0.11, 0.045, 0.03],
            shadow: false
        });
        // brow
        part(head, 'box', {
            color: '#22183A',
            pos: [x, 0.09, 0.405],
            rot: [0, ry, -8 * sx],
            scale: [0.12, 0.018, 0.02],
            shadow: false
        });
    }
    part(head, 'sphere', {
        color: opts.mouth ?? '#7A3A3A',
        pos: [0, -0.19, 0.41],
        scale: [0.07, 0.022, 0.03],
        shadow: false
    });
}

function limbs(rig: Rig, outfit: string, skin: string, shoe: string, legColor: string, withLegs = true) {
    const { body } = rig;
    if (withLegs) {
        for (const sx of [-1, 1]) {
            const leg = new Entity(sx < 0 ? 'legL' : 'legR');
            leg.setLocalPosition(0.11 * sx, 0.32, 0);
            rig.root.addChild(leg);
            part(leg, 'capsule', { color: legColor, pos: [0, -0.15, 0], scale: [0.16, 0.16, 0.16], outline: OL });
            part(leg, 'sphere', { color: shoe, pos: [0, -0.28, 0.04], scale: [0.19, 0.12, 0.26], outline: OL });
            if (sx < 0) rig.legL = leg;
            else rig.legR = leg;
        }
    }
    for (const sx of [-1, 1]) {
        const arm = new Entity(sx < 0 ? 'armL' : 'armR');
        arm.setLocalPosition(0.27 * sx, 0.74 - 0.55, 0);
        body.addChild(arm);
        part(arm, 'capsule', {
            color: outfit,
            pos: [0.04 * sx, -0.13, 0],
            rot: [0, 0, 14 * sx],
            scale: [0.14, 0.15, 0.14],
            outline: OL
        });
        part(arm, 'sphere', { color: skin, pos: [0.08 * sx, -0.29, 0.02], scale: 0.13, outline: OL });
        if (sx < 0) rig.armL = arm;
        else rig.armR = arm;
    }
}

function newRig(name: string, floating = false): Rig {
    const root = new Entity(name);
    const body = new Entity('body');
    body.setLocalPosition(0, 0.55, 0);
    root.addChild(body);
    const head = new Entity('head');
    head.setLocalPosition(0, 0.6, 0);
    body.addChild(head);
    return {
        root,
        body,
        head,
        armL: body,
        armR: body,
        legL: null,
        legR: null,
        streak: [],
        floating,
        phase: Math.random() * 10,
        bodyY: 0.55
    };
}

function torso(rig: Rig, outfit: string, trim: string) {
    part(rig.body, 'capsule', { color: outfit, pos: [0, 0.0, 0], scale: [0.5, 0.25, 0.4], outline: OL });
    part(rig.body, 'cone', { color: outfit, pos: [0, -0.12, 0], scale: [0.6, 0.3, 0.5], outline: OL });
    part(rig.body, 'cylinder', { color: trim, pos: [0, -0.27, 0], scale: [0.6, 0.04, 0.5], shadow: false });
}

export function buildChibi(spec: ChibiSpec, name = 'chibi'): Rig {
    const rig = newRig(name);
    torso(rig, spec.outfit, spec.trim);
    limbs(rig, spec.outfit, spec.skin, '#3A3150', '#231E3A');
    const { head } = rig;
    part(head, 'sphere', { color: spec.skin, scale: 0.9, outline: OL });
    face(head, spec.eye, { devil: spec.horns });
    if (spec.look === 'hood') {
        part(head, 'sphere', { color: spec.outfit, pos: [0, 0.1, -0.1], scale: [1.04, 1.02, 0.98], outline: OL });
        part(head, 'torus', {
            color: spec.trim,
            pos: [0, 0.06, 0.2],
            rot: [78, 0, 0],
            scale: [0.98, 0.6, 0.98],
            shadow: false
        });
        part(head, 'sphere', { color: spec.hair, pos: [0, 0.25, 0.24], scale: [0.6, 0.18, 0.3], shadow: false });
    } else {
        part(head, 'sphere', { color: spec.hair, pos: [0, 0.13, -0.08], scale: [0.95, 0.9, 0.92], outline: OL });
        if (spec.look === 'spiky') {
            for (let i = -2; i <= 2; i++) {
                part(head, 'cone', {
                    color: spec.hair,
                    pos: [i * 0.11, 0.28, 0.26 - Math.abs(i) * 0.04],
                    rot: [150, i * 8, -i * 12],
                    scale: [0.16, 0.26, 0.12],
                    outline: OL
                });
            }
            part(head, 'cone', {
                color: spec.hair,
                pos: [0.05, 0.5, -0.05],
                rot: [-20, 0, -15],
                scale: [0.16, 0.3, 0.16],
                outline: OL
            });
        } else {
            part(head, 'sphere', { color: spec.hair, pos: [0, 0.27, 0.2], scale: [0.86, 0.3, 0.5], outline: OL });
        }
        if (spec.look === 'long' || spec.look === 'bob') {
            const len = spec.look === 'long' ? 0.7 : 0.38;
            for (const sx of [-1, 1])
                part(head, 'capsule', {
                    color: spec.hair,
                    pos: [0.36 * sx, -0.1 - len * 0.25, 0.02],
                    scale: [0.2, len * 0.5, 0.24],
                    outline: OL
                });
            if (spec.look === 'long')
                part(head, 'capsule', {
                    color: spec.hair,
                    pos: [0, -0.32, -0.25],
                    scale: [0.7, 0.45, 0.32],
                    outline: OL
                });
        }
    }
    if (spec.glasses) {
        for (const sx of [-1, 1])
            part(head, 'torus', {
                color: spec.trim,
                pos: [0.16 * sx, -0.05, 0.43],
                rot: [90, 0, 0],
                scale: [0.36, 0.3, 0.36],
                shadow: false
            });
    }
    if (spec.mask) {
        part(head, 'sphere', { color: '#EDE6D6', pos: [0, -0.02, 0.24], scale: [0.86, 0.34, 0.48], outline: OL });
        for (const sx of [-1, 1])
            part(head, 'box', {
                color: '#22183A',
                pos: [0.16 * sx, -0.02, 0.475],
                rot: [0, 20 * sx, 0],
                scale: [0.14, 0.03, 0.02],
                shadow: false
            });
    }
    if (spec.horns) {
        for (const sx of [-1, 1])
            part(head, 'cone', {
                color: '#2A1430',
                pos: [0.24 * sx, 0.5, 0.04],
                rot: [0, 0, -28 * sx],
                scale: [0.11, 0.3, 0.11],
                outline: OL
            });
    }
    if (spec.crown) {
        part(head, 'cylinder', { color: '#E8C46A', pos: [0, 0.52, 0], scale: [0.42, 0.1, 0.42], outline: OL });
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            part(head, 'cone', {
                color: '#E8C46A',
                pos: [Math.sin(a) * 0.17, 0.63, Math.cos(a) * 0.17],
                scale: [0.08, 0.16, 0.08],
                shadow: false
            });
        }
        part(head, 'sphere', { color: '#FF7AB6', pos: [0, 0.56, 0.21], scale: 0.07, unlit: true });
    }
    if (spec.cape) {
        part(rig.body, 'box', {
            color: spec.trim,
            pos: [0, -0.08, -0.26],
            rot: [8, 0, 0],
            scale: [0.72, 0.85, 0.05],
            outline: OL
        });
        part(rig.body, 'box', { color: spec.outfit, pos: [0, -0.08, -0.29], rot: [8, 0, 0], scale: [0.66, 0.8, 0.04] });
    }
    return rig;
}

export function buildItsuki(mirror = false): Rig {
    const rig = newRig(mirror ? 'mirror-itsuki' : 'itsuki');
    const hair = mirror ? '#CFC8EA' : '#3F4E9E';
    const coat = mirror ? '#4A4370' : '#EADFC8';
    const scarf = mirror ? '#FF7AB6' : '#4FC9DD';
    const eye = mirror ? '#FF3D8B' : '#E8A33D';
    torso(rig, coat, '#C9B994');
    part(rig.body, 'box', { color: '#2E2A55', pos: [0, 0.0, 0.2], scale: [0.12, 0.42, 0.02], shadow: false });
    part(rig.body, 'cylinder', { color: '#7A5236', pos: [0, -0.1, 0], scale: [0.55, 0.05, 0.45], shadow: false });
    // scarf (records every spell he learns)
    part(rig.body, 'torus', { color: scarf, pos: [0, 0.2, 0], scale: [0.62, 0.5, 0.56], outline: OL });
    part(rig.body, 'box', {
        color: scarf,
        pos: [0.13, 0.02, 0.24],
        rot: [10, 0, 12],
        scale: [0.11, 0.32, 0.05],
        outline: OL
    });
    part(rig.body, 'box', {
        color: '#1E6E7C',
        pos: [0.13, 0.04, 0.27],
        rot: [10, 0, 12],
        scale: [0.08, 0.02, 0.01],
        shadow: false
    });
    // satchel with a little slab
    part(rig.body, 'box', { color: '#8A5E3F', pos: [-0.33, -0.18, 0.06], scale: [0.2, 0.17, 0.12], outline: OL });
    part(rig.body, 'box', { color: '#8E89AE', pos: [-0.33, -0.06, 0.06], scale: [0.09, 0.08, 0.05], shadow: false });
    limbs(rig, mirror ? '#3A3366' : '#DDD0B2', '#FBE3D3', '#6B4632', '#2B2547');
    // Lethe's sigil on his right hand
    part(rig.armR, 'torus', {
        color: '#FF7AB6',
        pos: [0.09, -0.29, 0.02],
        rot: [90, 0, 0],
        scale: [0.2, 0.2, 0.2],
        unlit: true
    });
    const { head } = rig;
    part(head, 'sphere', { color: '#FBE3D3', scale: 0.9, outline: OL });
    face(head, eye);
    part(head, 'sphere', { color: '#F6D2BE', pos: [-0.44, -0.04, 0], scale: [0.1, 0.16, 0.12] });
    part(head, 'sphere', { color: '#F6D2BE', pos: [0.44, -0.04, 0], scale: [0.1, 0.16, 0.12] });
    part(head, 'sphere', { color: hair, pos: [0, 0.13, -0.08], scale: [0.95, 0.9, 0.92], outline: OL });
    for (let i = -2; i <= 2; i++) {
        part(head, 'cone', {
            color: hair,
            pos: [i * 0.11, 0.28, 0.26 - Math.abs(i) * 0.04],
            rot: [150, i * 8, -i * 12],
            scale: [0.16, 0.26, 0.12],
            outline: OL
        });
    }
    for (const sx of [-1, 1])
        part(head, 'cone', {
            color: hair,
            pos: [0.38 * sx, -0.12, 0.08],
            rot: [180, 0, -8 * sx],
            scale: [0.14, 0.32, 0.14],
            outline: OL
        });
    part(head, 'cone', {
        color: hair,
        pos: [0.05, 0.5, -0.05],
        rot: [-25, 0, -18],
        scale: [0.15, 0.32, 0.15],
        outline: OL
    });
    // memory streak: whitens as he forgets
    rig.streak.push(
        part(head, 'cone', {
            color: '#F4F1FF',
            pos: [0.11, 0.3, 0.27],
            rot: [152, 8, -10],
            scale: [0.17, 0.28, 0.13],
            outline: OL
        })
    );
    rig.streak.push(
        part(head, 'sphere', { color: '#F4F1FF', pos: [0.18, 0.25, 0.04], scale: [0.5, 0.62, 0.78], outline: OL })
    );
    rig.streak.push(
        part(head, 'sphere', { color: '#F4F1FF', pos: [-0.17, 0.2, -0.06], scale: [0.6, 0.72, 0.82], outline: OL })
    );
    return rig;
}

export function setStreak(rig: Rig, level: number) {
    rig.streak.forEach((e, i) => (e.enabled = i < level));
}

export function buildLethe(): Rig {
    const rig = newRig('lethe', true);
    const { body, head } = rig;
    part(body, 'cone', { color: '#6B2F7A', pos: [0, -0.1, 0], scale: [0.62, 0.55, 0.52], outline: OL });
    part(body, 'cylinder', { color: '#FF9CC8', pos: [0, -0.37, 0], scale: [0.62, 0.04, 0.52], shadow: false });
    part(body, 'sphere', { color: '#F7EEF8', pos: [0, 0.08, 0.15], scale: [0.26, 0.16, 0.12], shadow: false });
    part(body, 'sphere', { color: '#FF7AB6', pos: [0, 0.04, 0.22], scale: 0.08, unlit: true });
    limbs(rig, '#7E3A8E', '#FFE7DC', '#FF7AB6', '#2A1430', true);
    if (rig.legL) rig.legL.setLocalScale(0.7, 0.7, 0.7);
    if (rig.legR) rig.legR.setLocalScale(0.7, 0.7, 0.7);
    // wings
    for (const sx of [-1, 1]) {
        const wing = group(body, 'wing', [0.18 * sx, 0.05, -0.2]);
        wing.setLocalEulerAngles(10, -25 * sx, 0);
        part(wing, 'sphere', {
            color: '#3A1840',
            pos: [0.32 * sx, 0.06, 0],
            rot: [0, 0, 18 * sx],
            scale: [0.6, 0.32, 0.05],
            outline: OL
        });
        part(wing, 'sphere', {
            color: '#B44C8C',
            pos: [0.32 * sx, 0.05, 0.02],
            rot: [0, 0, 18 * sx],
            scale: [0.48, 0.22, 0.03],
            shadow: false
        });
    }
    // tail with a heart tip
    part(body, 'capsule', {
        color: '#3A1840',
        pos: [0.12, -0.33, -0.3],
        rot: [55, 0, -30],
        scale: [0.05, 0.25, 0.05],
        shadow: false
    });
    part(body, 'sphere', { color: '#FF7AB6', pos: [0.28, -0.42, -0.5], scale: [0.14, 0.12, 0.06], unlit: true });
    part(head, 'sphere', { color: '#FFE7DC', scale: 0.88, outline: OL });
    face(head, '#E0408A', { devil: true, mouth: '#7A2A4A' });
    part(head, 'sphere', { color: '#FFB3D1', pos: [0, 0.13, -0.08], scale: [0.93, 0.88, 0.9], outline: OL });
    part(head, 'sphere', { color: '#FFB3D1', pos: [0, 0.27, 0.2], scale: [0.84, 0.3, 0.48], outline: OL });
    for (const sx of [-1, 1]) {
        part(head, 'sphere', { color: '#FFB3D1', pos: [0.38 * sx, 0.42, -0.04], scale: 0.32, outline: OL });
        part(head, 'capsule', {
            color: '#F28DBA',
            pos: [0.4 * sx, -0.22, -0.02],
            scale: [0.2, 0.32, 0.22],
            outline: OL
        });
        part(head, 'cone', {
            color: '#3A1840',
            pos: [0.17 * sx, 0.52, 0.12],
            rot: [0, 0, -22 * sx],
            scale: [0.09, 0.24, 0.09],
            outline: OL
        });
    }
    return rig;
}

export function buildGolem(body: string, glow: string, scale = 1): Rig {
    const rig = newRig('golem');
    rig.root.setLocalScale(scale, scale, scale);
    part(rig.body, 'box', { color: body, pos: [0, 0.05, 0], scale: [0.85, 0.7, 0.6], outline: OL });
    part(rig.body, 'torus', {
        color: glow,
        pos: [0, 0.08, 0.31],
        rot: [90, 0, 0],
        scale: [0.35, 0.3, 0.35],
        unlit: true
    });
    for (const sx of [-1, 1]) {
        const leg = new Entity('leg');
        leg.setLocalPosition(0.22 * sx, 0.3, 0);
        rig.root.addChild(leg);
        part(leg, 'box', { color: body, pos: [0, -0.12, 0], scale: [0.26, 0.4, 0.3], outline: OL });
        if (sx < 0) rig.legL = leg;
        else rig.legR = leg;
        const arm = new Entity('arm');
        arm.setLocalPosition(0.52 * sx, 0.25, 0);
        rig.body.addChild(arm);
        part(arm, 'box', { color: body, pos: [0, -0.25, 0], scale: [0.24, 0.55, 0.26], outline: OL });
        if (sx < 0) rig.armL = arm;
        else rig.armR = arm;
    }
    part(rig.head, 'box', { color: body, pos: [0, 0.0, 0], scale: [0.62, 0.52, 0.52], outline: OL });
    for (const sx of [-1, 1])
        part(rig.head, 'box', { color: glow, pos: [0.14 * sx, 0.02, 0.265], scale: [0.14, 0.08, 0.02], unlit: true });
    return rig;
}

export function buildStag(): Rig {
    const rig = newRig('stag');
    rig.body.setLocalPosition(0, 0.95, 0);
    rig.bodyY = 0.95;
    part(rig.body, 'capsule', { color: '#9A6B45', rot: [90, 0, 0], scale: [0.55, 0.55, 0.5], outline: OL });
    part(rig.body, 'sphere', { color: '#F3EBDD', pos: [0, -0.05, 0.3], scale: [0.36, 0.36, 0.3], shadow: false });
    for (const [x, z] of [
        [-0.17, 0.4],
        [0.17, 0.4],
        [-0.17, -0.4],
        [0.17, -0.4]
    ]) {
        part(rig.root, 'cylinder', { color: '#7A5236', pos: [x, 0.38, z], scale: [0.1, 0.76, 0.1], outline: OL });
    }
    rig.head.setLocalPosition(0, 0.55, 0.55);
    part(rig.head, 'sphere', { color: '#9A6B45', scale: [0.42, 0.45, 0.5], outline: OL });
    part(rig.head, 'sphere', { color: '#F3EBDD', pos: [0, -0.1, 0.22], scale: [0.24, 0.2, 0.2], shadow: false });
    for (const sx of [-1, 1]) {
        part(rig.head, 'sphere', { color: '#22183A', pos: [0.12 * sx, 0.04, 0.2], scale: 0.07, shadow: false });
        part(rig.head, 'cylinder', {
            color: '#8FF3FF',
            pos: [0.18 * sx, 0.42, 0],
            rot: [0, 0, -25 * sx],
            scale: [0.05, 0.6, 0.05],
            unlit: true
        });
        part(rig.head, 'cylinder', {
            color: '#8FF3FF',
            pos: [0.3 * sx, 0.6, 0.06],
            rot: [30, 0, -60 * sx],
            scale: [0.04, 0.3, 0.04],
            unlit: true
        });
        part(rig.head, 'cylinder', {
            color: '#8FF3FF',
            pos: [0.24 * sx, 0.72, -0.04],
            rot: [-20, 0, 10 * sx],
            scale: [0.04, 0.25, 0.04],
            unlit: true
        });
    }
    return rig;
}

export function buildSphinx(): Rig {
    const rig = newRig('sphinx');
    rig.root.setLocalScale(1.5, 1.5, 1.5);
    rig.body.setLocalPosition(0, 0.4, 0);
    rig.bodyY = 0.4;
    part(rig.body, 'capsule', { color: '#C99A45', rot: [90, 0, 0], scale: [0.6, 0.6, 0.5], outline: OL });
    for (const sx of [-1, 1])
        part(rig.body, 'capsule', {
            color: '#C99A45',
            pos: [0.2 * sx, -0.22, 0.45],
            rot: [90, 0, 0],
            scale: [0.16, 0.25, 0.16],
            outline: OL
        });
    rig.head.setLocalPosition(0, 0.55, 0.3);
    part(rig.head, 'cone', { color: '#2B6C86', pos: [0, 0.05, -0.05], scale: [0.75, 0.9, 0.6], outline: OL });
    part(rig.head, 'sphere', { color: '#E3B888', pos: [0, 0, 0.12], scale: [0.48, 0.55, 0.44], outline: OL });
    for (const sx of [-1, 1])
        part(rig.head, 'sphere', {
            color: '#22183A',
            pos: [0.1 * sx, 0.04, 0.32],
            scale: [0.07, 0.09, 0.04],
            shadow: false
        });
    part(rig.head, 'box', { color: '#E8C46A', pos: [0, 0.2, 0.17], scale: [0.5, 0.04, 0.3], shadow: false });
    return rig;
}

/** Walk / idle animation. speed is 0..1. */
export function animateRig(rig: Rig, dt: number, speed: number) {
    rig.phase += dt * (speed > 0.05 ? 9 + speed * 4 : 2.2);
    const p = rig.phase;
    if (rig.floating) {
        rig.body.setLocalPosition(0, 0.62 + Math.sin(p * 0.9) * 0.06, 0);
        rig.armL.setLocalEulerAngles(0, 0, -10 + Math.sin(p) * 8);
        rig.armR.setLocalEulerAngles(0, 0, 10 - Math.sin(p) * 8);
        return;
    }
    const swing = speed > 0.05 ? Math.sin(p) * 32 * Math.min(1, speed) : 0;
    rig.legL?.setLocalEulerAngles(swing, 0, 0);
    rig.legR?.setLocalEulerAngles(-swing, 0, 0);
    rig.armL.setLocalEulerAngles(-swing * 0.8, 0, 0);
    rig.armR.setLocalEulerAngles(swing * 0.8, 0, 0);
    const bob = speed > 0.05 ? Math.abs(Math.sin(p)) * 0.05 : Math.sin(p) * 0.012;
    rig.body.setLocalPosition(0, rig.bodyY + bob, 0);
}
