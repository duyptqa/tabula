// Diorama props for the floating isles of Scriptoria. Each is a Blender model (art/blender/props.py)
// when it loaded, retinted per instance; the primitive versions below remain as the fallback.
import { Entity, Mesh, MeshInstance, PRIMITIVE_TRIANGLES } from 'playcanvas';
import type { GraphicsDevice } from 'playcanvas';

import { findNode, hasModel, instantiate } from './assets';
import type { InstanceOpts } from './assets';
import { group, mat, part } from './models';
import type { V3 } from './models';

/** Put a Blender prop inside g; the scale goes on the instance, so g stays a plain parent. */
function model(g: Entity, asset: string, scale: number | V3 = 1, opts: InstanceOpts = {}): Entity {
    const inst = instantiate(asset, opts);
    const s: V3 = typeof scale === 'number' ? [scale, scale, scale] : scale;
    inst.setLocalScale(s[0], s[1], s[2]);
    g.addChild(inst);
    return inst;
}

/** A named node of a prop (pivots the game animates), or the prop itself. */
function node(inst: Entity, asset: string, key: string): Entity {
    return findNode(inst, asset, key) ?? inst;
}

const OL = 0.05;

export function island(
    parent: Entity,
    name: string,
    x: number,
    z: number,
    r: number,
    top: string,
    soil: string,
    rock: string
): Entity {
    const g = group(parent, name, [x, 0, z]);
    if (hasModel('island')) {
        model(g, 'island', r, { colors: { top, soil, rock }, shadows: false });
        return g;
    }
    part(g, 'cylinder', { color: top, pos: [0, -0.3, 0], scale: [2 * r, 0.6, 2 * r], outline: 0.12, shadow: false });
    part(g, 'cylinder', { color: soil, pos: [0, -1.0, 0], scale: [2 * r * 0.97, 0.9, 2 * r * 0.97], shadow: false });
    part(g, 'cone', {
        color: rock,
        pos: [0, -1.45 - r * 0.42, 0],
        rot: [180, 0, 0],
        scale: [2 * r * 0.95, r * 0.85, 2 * r * 0.95],
        shadow: false
    });
    part(g, 'cone', {
        color: soil,
        pos: [r * 0.3, -2 - r * 0.6, -r * 0.2],
        rot: [180, 0, 0],
        scale: [r * 0.6, r * 0.7, r * 0.6],
        shadow: false
    });
    // a couple of tiny floating rocks
    for (let i = 0; i < 3; i++) {
        const a = i * 2.3 + x * 0.1;
        part(g, 'sphere', {
            color: rock,
            pos: [Math.cos(a) * (r + 2.5), -3 - i * 1.4, Math.sin(a) * (r + 2.5)],
            scale: [1.2 - i * 0.2, 0.8, 1.1],
            shadow: false
        });
    }
    return g;
}

export function tree(
    parent: Entity,
    x: number,
    z: number,
    s = 1,
    leaf = '#4F9A5C',
    trunk = '#6B4632',
    kind: 'round' | 'pine' = 'round'
): Entity {
    const g = group(parent, 'tree', [x, 0, z]);
    const asset = kind === 'pine' ? 'tree_pine' : 'tree_round';
    if (hasModel(asset)) {
        const t = model(g, asset, s, { colors: { leaf, trunk } });
        // vary each tree a little so a grove does not look stamped
        t.setLocalEulerAngles(0, (x * 37 + z * 53) % 360, 0);
        return g;
    }
    g.setLocalScale(s, s, s);
    part(g, 'cylinder', { color: trunk, pos: [0, 0.6, 0], scale: [0.35, 1.2, 0.35], outline: OL });
    if (kind === 'pine') {
        part(g, 'cone', { color: leaf, pos: [0, 1.8, 0], scale: [1.9, 1.8, 1.9], outline: OL });
        part(g, 'cone', { color: leaf, pos: [0, 2.7, 0], scale: [1.4, 1.4, 1.4], outline: OL });
    } else {
        part(g, 'sphere', { color: leaf, pos: [0, 1.9, 0], scale: [1.9, 1.7, 1.9], outline: OL });
        part(g, 'sphere', { color: leaf, pos: [0.45, 2.4, 0.2], scale: 1.1, outline: OL });
    }
    return g;
}

export function house(
    parent: Entity,
    x: number,
    z: number,
    rotY: number,
    wall: string,
    roof: string,
    w = 3,
    d = 3,
    h = 2.2
): Entity {
    const g = group(parent, 'house', [x, 0, z], rotY);
    if (hasModel('house')) {
        model(g, 'house', [w / 3, h / 2.2, d / 3], { colors: { wall, roof } });
        return g;
    }
    part(g, 'box', { color: wall, pos: [0, h / 2, 0], scale: [w, h, d], outline: OL });
    const rs = Math.SQRT1_2 * w * 0.98;
    part(g, 'box', { color: roof, pos: [0, h, 0], rot: [0, 0, 45], scale: [rs, rs, d + 0.4], outline: OL });
    part(g, 'box', { color: '#6B4632', pos: [0, 0.65, d / 2 + 0.01], scale: [0.7, 1.3, 0.06], shadow: false });
    part(g, 'box', {
        color: '#FFD98A',
        pos: [w * 0.28, h * 0.62, d / 2 + 0.01],
        scale: [0.5, 0.5, 0.05],
        unlit: true,
        ei: 0.9
    });
    part(g, 'box', {
        color: '#FFD98A',
        pos: [-w * 0.28, h * 0.62, d / 2 + 0.01],
        scale: [0.5, 0.5, 0.05],
        unlit: true,
        ei: 0.9
    });
    return g;
}

export function windmill(parent: Entity, x: number, z: number, rotY: number, s = 1): { root: Entity; blades: Entity } {
    const g = group(parent, 'windmill', [x, 0, z], rotY);
    if (hasModel('windmill')) {
        const m = model(g, 'windmill', s);
        return { root: g, blades: node(m, 'windmill', 'blades') };
    }
    g.setLocalScale(s, s, s);
    part(g, 'cylinder', { color: '#F3EBDD', pos: [0, 2.2, 0], scale: [2.2, 4.4, 2.2], outline: OL });
    part(g, 'cone', { color: '#C46A4A', pos: [0, 5.0, 0], scale: [2.8, 1.6, 2.8], outline: OL });
    part(g, 'box', { color: '#6B4632', pos: [0, 0.7, 1.1], scale: [0.8, 1.4, 0.1], shadow: false });
    const blades = group(g, 'blades', [0, 3.9, 1.25]);
    part(blades, 'cylinder', { color: '#6B4632', rot: [90, 0, 0], scale: [0.35, 0.4, 0.35], outline: OL });
    for (let i = 0; i < 4; i++) {
        const arm = group(blades, 'arm');
        arm.setLocalEulerAngles(0, 0, i * 90);
        part(arm, 'box', { color: '#7A5236', pos: [0, 1.6, 0.1], scale: [0.15, 3.2, 0.1], shadow: false });
        part(arm, 'box', { color: '#F3EBDD', pos: [0.32, 1.9, 0.12], scale: [0.55, 2.3, 0.05], outline: 0.03 });
    }
    return { root: g, blades };
}

export function inkwell(parent: Entity, x: number, z: number): { root: Entity; glow: Entity } {
    const g = group(parent, 'inkwell', [x, 0, z]);
    if (hasModel('inkwell')) {
        const m = model(g, 'inkwell');
        return { root: g, glow: node(m, 'inkwell', 'glow') };
    }
    part(g, 'cylinder', { color: '#2A2342', pos: [0, 0.45, 0], scale: [1.1, 0.9, 1.1], outline: OL });
    part(g, 'cylinder', { color: '#3A3366', pos: [0, 0.95, 0], scale: [0.7, 0.2, 0.7], outline: OL });
    const glow = part(g, 'cylinder', { color: '#5ED6E8', pos: [0, 1.06, 0], scale: [0.55, 0.04, 0.55], unlit: true });
    part(g, 'box', { color: '#F3EBDD', pos: [0.2, 1.6, 0], rot: [0, 0, -25], scale: [0.08, 1.2, 0.2], outline: 0.02 });
    part(g, 'cone', { color: '#F3EBDD', pos: [0.45, 2.2, 0], rot: [0, 0, -25], scale: [0.3, 0.5, 0.1], shadow: false });
    return { root: g, glow };
}

export function slabStone(
    parent: Entity,
    x: number,
    z: number,
    rotY = 0,
    pink = false,
    s = 1
): { root: Entity; glow: Entity } {
    const g = group(parent, 'slab', [x, 0, z], rotY);
    if (hasModel('slab')) {
        const m = model(g, 'slab', s, pink ? { colors: { glyph: '#FFB3D1' } } : {});
        return { root: g, glow: node(m, 'slab', 'glyph') };
    }
    g.setLocalScale(s, s, s);
    part(g, 'box', { color: '#8E89AE', pos: [0, 0.85, 0], scale: [1.2, 1.7, 0.3], outline: 0.04 });
    part(g, 'cylinder', { color: '#8E89AE', pos: [0, 1.7, 0], rot: [90, 0, 0], scale: [1.2, 0.3, 1.2], outline: 0.04 });
    part(g, 'box', { color: '#6F6A93', pos: [0, 0.95, 0.12], scale: [0.95, 1.55, 0.1], shadow: false });
    const glow = group(g, 'glyph', [0, 1.1, 0.19]);
    const c = pink ? '#FFB3D1' : '#8FF3FF';
    for (let i = 0; i < 3; i++)
        part(glow, 'box', { color: c, pos: [0, 0.35 - i * 0.3, 0], scale: [0.6, 0.08, 0.02], unlit: true });
    return { root: g, glow };
}

export function pedestal(parent: Entity, x: number, z: number, color = '#6F6A93'): Entity {
    const g = group(parent, 'pedestal', [x, 0, z]);
    if (hasModel('pedestal')) {
        model(g, 'pedestal', 1, { colors: { base: color } });
        return g;
    }
    part(g, 'cylinder', { color, pos: [0, 0.25, 0], scale: [2.4, 0.5, 2.4], outline: OL });
    part(g, 'torus', { color: '#5ED6E8', pos: [0, 0.52, 0], scale: [2.3, 0.2, 2.3], unlit: true, ei: 0.8 });
    return g;
}

export function dock(parent: Entity, x: number, z: number, rotY: number): Entity {
    const g = group(parent, 'dock', [x, 0, z], rotY);
    if (hasModel('dock')) {
        model(g, 'dock');
        return g;
    }
    part(g, 'box', { color: '#C9A47A', pos: [0, 0.05, 1.8], scale: [2.2, 0.2, 4.2], outline: OL });
    for (const sx of [-1, 1]) {
        part(g, 'cylinder', { color: '#7A5236', pos: [1.05 * sx, 0.4, 3.6], scale: [0.25, 1.2, 0.25], outline: OL });
        part(g, 'sphere', { color: '#FFD98A', pos: [1.05 * sx, 1.1, 3.6], scale: 0.3, unlit: true });
    }
    return g;
}

export function paperBoat(parent: Entity): Entity {
    const g = group(parent, 'boat');
    if (hasModel('boat')) {
        model(g, 'boat');
        return g;
    }
    part(g, 'box', { color: '#F3EBDD', pos: [0, 0.25, 0], scale: [1.6, 0.4, 3.2], outline: 0.04 });
    for (const sx of [-1, 1])
        part(g, 'box', {
            color: '#E9DFC2',
            pos: [0.7 * sx, 0.55, 0],
            rot: [0, 0, 28 * sx],
            scale: [0.12, 0.8, 3.4],
            outline: 0.03
        });
    part(g, 'box', {
        color: '#E9DFC2',
        pos: [0, 0.45, 1.75],
        rot: [-35, 0, 0],
        scale: [1.3, 0.12, 0.9],
        outline: 0.03
    });
    part(g, 'box', {
        color: '#E9DFC2',
        pos: [0, 0.45, -1.75],
        rot: [35, 0, 0],
        scale: [1.3, 0.12, 0.9],
        outline: 0.03
    });
    part(g, 'cylinder', { color: '#7A5236', pos: [0, 1.6, 0.2], scale: [0.1, 2.4, 0.1], shadow: false });
    part(g, 'cone', { color: '#FFFFFF', pos: [0, 1.9, 0.6], rot: [90, 0, 0], scale: [0.08, 1.4, 1.6], outline: 0.02 });
    return g;
}

export function signpost(parent: Entity, x: number, z: number, rotY: number, color = '#E9DFC2'): Entity {
    const g = group(parent, 'sign', [x, 0, z], rotY);
    if (hasModel('signpost')) {
        model(g, 'signpost', 1, { colors: { board: color } });
        return g;
    }
    part(g, 'cylinder', { color: '#7A5236', pos: [0, 0.9, 0], scale: [0.2, 1.8, 0.2], outline: OL });
    part(g, 'box', { color, pos: [0, 1.55, 0.12], scale: [1.4, 0.55, 0.1], outline: 0.04 });
    part(g, 'box', { color: '#7A5236', pos: [0, 1.6, 0.18], scale: [0.9, 0.06, 0.02], shadow: false });
    part(g, 'box', { color: '#7A5236', pos: [-0.1, 1.45, 0.18], scale: [0.7, 0.06, 0.02], shadow: false });
    return g;
}

export function arch(parent: Entity, x: number, z: number, rotY: number, color = '#5ED6E8'): Entity {
    const g = group(parent, 'arch', [x, 0, z], rotY);
    if (hasModel('arch')) {
        model(g, 'arch', 1, { colors: { glow: color } });
        return g;
    }
    for (const sx of [-1, 1])
        part(g, 'box', { color: '#8E89AE', pos: [1.2 * sx, 1.4, 0], scale: [0.5, 2.8, 0.5], outline: OL });
    part(g, 'box', { color: '#8E89AE', pos: [0, 3.0, 0], scale: [3.0, 0.5, 0.6], outline: OL });
    part(g, 'box', { color, pos: [0, 3.0, 0.31], scale: [1.6, 0.12, 0.02], unlit: true });
    return g;
}

export function bellTower(parent: Entity, x: number, z: number): { root: Entity; bell: Entity } {
    const g = group(parent, 'belltower', [x, 0, z]);
    if (hasModel('bell_tower')) {
        const m = model(g, 'bell_tower');
        return { root: g, bell: node(m, 'bell_tower', 'bell') };
    }
    for (const [px, pz] of [
        [-0.8, -0.8],
        [0.8, -0.8],
        [-0.8, 0.8],
        [0.8, 0.8]
    ]) {
        part(g, 'cylinder', { color: '#F3EBDD', pos: [px, 1.8, pz], scale: [0.3, 3.6, 0.3], outline: OL });
    }
    part(g, 'cone', { color: '#3A8AA6', pos: [0, 4.3, 0], scale: [2.8, 1.4, 2.8], outline: OL });
    const bell = group(g, 'bell', [0, 3.3, 0]);
    part(bell, 'cone', { color: '#E8C46A', pos: [0, -0.4, 0], scale: [1.1, 1.0, 1.1], outline: OL });
    part(bell, 'sphere', { color: '#E8C46A', pos: [0, 0.05, 0], scale: [0.6, 0.5, 0.6] });
    return { root: g, bell };
}

export function lantern(parent: Entity, x: number, z: number, color = '#FFD98A'): Entity {
    const g = group(parent, 'lantern', [x, 0, z]);
    if (hasModel('lantern')) {
        model(g, 'lantern', 1, { colors: { glow: color } });
        return g;
    }
    part(g, 'cylinder', { color: '#3A3150', pos: [0, 1.0, 0], scale: [0.12, 2.0, 0.12], shadow: false });
    part(g, 'sphere', { color, pos: [0, 2.1, 0], scale: 0.4, unlit: true });
    return g;
}

export function bench(parent: Entity, x: number, z: number, rotY: number): Entity {
    const g = group(parent, 'bench', [x, 0, z], rotY);
    if (hasModel('bench')) {
        model(g, 'bench');
        return g;
    }
    part(g, 'box', { color: '#9A6B45', pos: [0, 0.45, 0], scale: [1.8, 0.12, 0.6], outline: 0.03 });
    part(g, 'box', { color: '#9A6B45', pos: [0, 0.8, -0.28], scale: [1.8, 0.5, 0.08], outline: 0.03 });
    for (const sx of [-1, 1])
        part(g, 'box', { color: '#6B4632', pos: [0.75 * sx, 0.22, 0], scale: [0.12, 0.45, 0.5], shadow: false });
    return g;
}

export function heartMarker(parent: Entity, x: number, z: number, y = 1.2): Entity {
    const g = group(parent, 'heart', [x, y, z]);
    if (hasModel('heart')) {
        model(g, 'heart', 1.1);
        return g;
    }
    part(g, 'sphere', { color: '#FF7AB6', pos: [-0.13, 0.08, 0], scale: 0.3, unlit: true });
    part(g, 'sphere', { color: '#FF7AB6', pos: [0.13, 0.08, 0], scale: 0.3, unlit: true });
    part(g, 'cone', { color: '#FF7AB6', pos: [0, -0.14, 0], rot: [180, 0, 0], scale: [0.48, 0.36, 0.3], unlit: true });
    return g;
}

export function rock(parent: Entity, x: number, z: number, s = 1, color = '#8E89AE'): Entity {
    if (hasModel('rock')) {
        const g = group(parent, 'rock', [x, 0, z], (x * 41 + z * 23) % 360);
        model(g, 'rock', s, { colors: { rock: color } });
        return g;
    }
    return part(parent, 'sphere', { color, pos: [x, 0.25 * s, z], scale: [1.4 * s, 0.9 * s, 1.2 * s], outline: OL });
}

export function dune(parent: Entity, x: number, z: number, s = 1): Entity {
    if (hasModel('dune')) {
        const g = group(parent, 'dune', [x, 0, z]);
        model(g, 'dune', s, { shadows: false });
        return g;
    }
    return part(parent, 'sphere', {
        color: '#E2B867',
        pos: [x, -0.2, z],
        scale: [5 * s, 1.6 * s, 3.6 * s],
        shadow: false
    });
}

export function dome(parent: Entity, x: number, z: number, s = 1): Entity {
    const g = group(parent, 'dome', [x, 0, z]);
    if (hasModel('dome')) {
        model(g, 'dome', s);
        return g;
    }
    part(g, 'sphere', {
        color: '#5ED6E8',
        pos: [0, 0, 0],
        scale: [3 * s, 3 * s, 3 * s],
        outline: OL,
        emissive: '#1E6E7C',
        ei: 0.6
    });
    part(g, 'cylinder', { color: '#F3EBDD', pos: [0, 0.1, 0], scale: [3.2 * s, 0.3, 3.2 * s], outline: OL });
    return g;
}

export function volcano(parent: Entity, x: number, z: number, s = 1): { root: Entity; smoke: Entity[] } {
    const g = group(parent, 'volcano', [x, 0, z]);
    g.setLocalScale(s, s, s);
    if (hasModel('volcano')) model(g, 'volcano');
    else volcanoPrims(g);
    const smoke: Entity[] = [];
    for (let i = 0; i < 3; i++)
        smoke.push(
            part(g, 'sphere', {
                color: '#8E89AE',
                pos: [0.3 * i, 5.6 + i * 1.1, 0],
                scale: 0.9 + i * 0.4,
                opacity: 0.55,
                shadow: false
            })
        );
    return { root: g, smoke };
}

function volcanoPrims(g: Entity) {
    part(g, 'cone', { color: '#4A2826', pos: [0, 2.5, 0], scale: [9, 5, 9], outline: OL });
    part(g, 'cylinder', { color: '#FF9A4A', pos: [0, 4.95, 0], scale: [2.0, 0.12, 2.0], unlit: true });
    for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        part(g, 'box', {
            color: '#FF9A4A',
            pos: [Math.sin(a) * 2.4, 2.4, Math.cos(a) * 2.4],
            rot: [Math.cos(a) * 30, (a * 180) / Math.PI, 0],
            scale: [0.18, 3.2, 0.05],
            unlit: true
        });
    }
}

export function forge(parent: Entity, x: number, z: number, rotY: number): Entity {
    const g = group(parent, 'forge', [x, 0, z], rotY);
    if (hasModel('forge')) {
        model(g, 'forge');
        return g;
    }
    part(g, 'box', { color: '#C9A08A', pos: [0, 1.3, 0], scale: [4, 2.6, 3], outline: OL });
    part(g, 'box', { color: '#6B3B37', pos: [0, 2.8, 0], rot: [0, 0, 45], scale: [2.6, 2.6, 3.3], outline: OL });
    part(g, 'cylinder', { color: '#6B3B37', pos: [1.2, 3.6, -0.6], scale: [0.7, 2.4, 0.7], outline: OL });
    part(g, 'box', { color: '#FF9A4A', pos: [0, 0.9, 1.51], scale: [1.4, 1.2, 0.04], unlit: true });
    return g;
}

export function spire(parent: Entity, x: number, z: number): { root: Entity; orb: Entity } {
    const g = group(parent, 'spire', [x, 0, z]);
    if (hasModel('spire')) {
        const m = model(g, 'spire');
        part(g, 'sphere', { color: '#FF7AB6', pos: [0, 17.6, 0], scale: 2.6, unlit: true, opacity: 0.25 });
        return { root: g, orb: node(m, 'spire', 'orb') };
    }
    part(g, 'cylinder', { color: '#2A2147', pos: [0, 0.4, 0], scale: [7, 0.8, 7], outline: OL });
    part(g, 'cylinder', { color: '#3A2E63', pos: [0, 5, 0], scale: [2.4, 10, 2.4], outline: OL });
    part(g, 'cone', { color: '#3A2E63', pos: [0, 13.5, 0], scale: [2.6, 7, 2.6], outline: OL });
    for (let i = 0; i < 3; i++)
        part(g, 'box', {
            color: '#5A4A8E',
            pos: [0, 3 + i * 3, 0],
            rot: [0, i * 40, 18],
            scale: [2.8, 0.3, 0.6],
            shadow: false
        });
    const orb = part(g, 'sphere', { color: '#FF7AB6', pos: [0, 17.6, 0], scale: 1.2, unlit: true });
    part(g, 'sphere', { color: '#FF7AB6', pos: [0, 17.6, 0], scale: 2.6, unlit: true, opacity: 0.25 });
    return { root: g, orb };
}

export function water(parent: Entity, x: number, z: number, r: number): Entity {
    return part(parent, 'cylinder', {
        color: '#3A8AA6',
        pos: [x, 0.02, z],
        scale: [2 * r, 0.04, 2 * r],
        opacity: 0.85,
        shadow: false,
        gloss: 0.8
    });
}

export function musicBox(parent: Entity, x: number, z: number): Entity {
    const g = group(parent, 'musicbox', [x, 0, z]);
    if (hasModel('music_box')) {
        model(g, 'music_box');
        return g;
    }
    part(g, 'cylinder', { color: '#9A6B45', pos: [0, 0.45, 0], scale: [0.9, 0.9, 0.9], outline: OL });
    part(g, 'box', { color: '#C46A4A', pos: [0, 1.05, 0], scale: [0.8, 0.4, 0.6], outline: 0.03 });
    part(g, 'box', {
        color: '#E8C46A',
        pos: [0, 1.32, -0.05],
        rot: [-25, 0, 0],
        scale: [0.82, 0.08, 0.62],
        outline: 0.03
    });
    part(g, 'cylinder', {
        color: '#E8C46A',
        pos: [0.42, 1.05, 0],
        rot: [0, 0, 90],
        scale: [0.12, 0.2, 0.12],
        shadow: false
    });
    return g;
}

export function counter(parent: Entity, x: number, z: number, rotY: number): Entity {
    const g = group(parent, 'stall', [x, 0, z], rotY);
    if (hasModel('stall')) {
        model(g, 'stall');
        return g;
    }
    part(g, 'box', { color: '#C9A47A', pos: [0, 0.55, 0], scale: [2.4, 1.1, 0.9], outline: OL });
    for (const sx of [-1, 1])
        part(g, 'cylinder', { color: '#7A5236', pos: [1.1 * sx, 1.4, -0.3], scale: [0.12, 2.8, 0.12], shadow: false });
    part(g, 'box', { color: '#C46A4A', pos: [0, 2.75, 0], rot: [-12, 0, 0], scale: [2.8, 0.12, 1.6], outline: 0.03 });
    for (let i = 0; i < 3; i++)
        part(g, 'sphere', {
            color: '#E8C46A',
            pos: [-0.6 + i * 0.6, 1.2, 0.1],
            scale: [0.4, 0.25, 0.4],
            shadow: false
        });
    return g;
}

/** Hearthpage's raised stargazing deck (its floor is 0.3 m up). */
export function lookoutDeck(parent: Entity, x: number, z: number): Entity {
    const g = group(parent, 'deck', [x, 0, z]);
    if (hasModel('deck')) model(g, 'deck');
    else part(g, 'box', { color: '#9A6B45', pos: [0, 0.15, 0], scale: [4, 0.3, 3], outline: 0.04 });
    return g;
}

/** A fallen mossy log lying along X. */
export function log(parent: Entity, x: number, z: number): Entity {
    const g = group(parent, 'log', [x, 0, z]);
    if (hasModel('log')) model(g, 'log');
    else
        part(g, 'cylinder', {
            color: '#6B4632',
            pos: [0, 0.4, 0],
            rot: [0, 0, 90],
            scale: [0.8, 2.6, 0.8],
            outline: 0.04
        });
    return g;
}

/** A sandstone obelisk with glowing glyphs. */
export function obelisk(parent: Entity, x: number, z: number): Entity {
    const g = group(parent, 'obelisk', [x, 0, z]);
    if (hasModel('obelisk')) model(g, 'obelisk');
    else part(g, 'cylinder', { color: '#C99A45', pos: [0, 1.2, 0], scale: [0.6, 2.4, 0.6], outline: 0.04 });
    return g;
}

/** A dome of stars as one mesh (one draw call). */
export function stars(parent: Entity, device: GraphicsDevice, count = 500): Entity {
    const pos: number[] = [];
    const idx: number[] = [];
    let seed = 7;
    const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    for (let i = 0; i < count; i++) {
        const u = rnd() * Math.PI * 2;
        const v = 0.06 + rnd() * 0.9;
        const R = 260;
        const cx = Math.cos(u) * Math.cos(v) * R;
        const cy = Math.sin(v) * R * 0.8 + 10;
        const cz = Math.sin(u) * Math.cos(v) * R;
        const s = 0.4 + rnd() * 0.9;
        const b = pos.length / 3;
        pos.push(cx - s, cy, cz, cx + s, cy, cz, cx, cy - s, cz, cx, cy + s, cz, cx, cy, cz - s, cx, cy, cz + s);
        // octahedron
        const t = [
            [0, 3, 4],
            [3, 1, 4],
            [1, 2, 4],
            [2, 0, 4],
            [3, 0, 5],
            [1, 3, 5],
            [2, 1, 5],
            [0, 2, 5]
        ];
        for (const tri of t) idx.push(b + tri[0], b + tri[1], b + tri[2]);
    }
    const mesh = new Mesh(device);
    mesh.setPositions(pos);
    mesh.setIndices(idx);
    mesh.update(PRIMITIVE_TRIANGLES);
    const m = mat('#EFEAFF', { unlit: true, ei: 1 }).clone();
    m.useFog = false;
    m.cull = 0;
    m.update();
    const e = new Entity('stars');
    e.addComponent('render', { meshInstances: [new MeshInstance(mesh, m)], castShadows: false });
    parent.addChild(e);
    return e;
}

/** The Blank: a white void at the centre of the ring, where forgotten things go. */
export function theBlank(parent: Entity): Entity {
    const g = group(parent, 'the-blank', [0, -18, -6]);
    part(g, 'cylinder', {
        color: '#F7F5FF',
        pos: [0, 0, 0],
        scale: [70, 0.2, 70],
        unlit: true,
        ei: 0.55,
        shadow: false
    });
    part(g, 'cylinder', {
        color: '#F7F5FF',
        pos: [0, 2, 0],
        scale: [52, 0.2, 52],
        unlit: true,
        ei: 0.8,
        opacity: 0.5,
        shadow: false
    });
    part(g, 'cylinder', {
        color: '#FFFFFF',
        pos: [0, 4, 0],
        scale: [30, 0.2, 30],
        unlit: true,
        ei: 1,
        opacity: 0.4,
        shadow: false
    });
    return g;
}
