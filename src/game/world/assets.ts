// The Blender-built anime models (art/blender -> public/models): preload, then instantiate with
// cel-shaded materials and outlines. Material names are '<asset>.<role>' from the Blender scripts.
import { Asset, AssetListLoader, Color } from 'playcanvas';
import type { AppBase, ContainerResource, Entity, MeshInstance, RenderComponent, StandardMaterial } from 'playcanvas';

import { addOutline, glowMaterial, inkOf, toonMaterial } from './toon';

/** The characters (art/blender/characters.py). */
export const CHARACTER_NAMES = [
    'itsuki',
    'itsuki_mirror',
    'lethe',
    'mom',
    'tomo',
    'pix',
    'wade',
    'vesper',
    'brakk',
    'sable',
    'overflow',
    'deadlock',
    'segfault',
    'null',
    'golem',
    'golem_forge',
    'stag',
    'sphinx'
];

/** The world props (art/blender/props.py). */
export const PROP_NAMES = [
    'island',
    'tree_round',
    'tree_pine',
    'house',
    'windmill',
    'forge',
    'spire',
    'bell_tower',
    'inkwell',
    'slab',
    'pedestal',
    'dock',
    'boat',
    'signpost',
    'arch',
    'lantern',
    'bench',
    'heart',
    'rock',
    'dune',
    'dome',
    'volcano',
    'music_box',
    'stall',
    'deck',
    'log',
    'obelisk',
    'glider'
];

/** Every model the game knows; missing files fall back to the primitive builders. */
export const MODEL_NAMES = [...CHARACTER_NAMES, ...PROP_NAMES];

const loaded = new Map<string, ContainerResource>();

export async function loadModels(app: AppBase, names = MODEL_NAMES, onProgress?: (k: number) => void) {
    const assets = names.map((n) => new Asset(n, 'container', { url: `./models/${n}.glb` }));
    for (const a of assets) app.assets.add(a);
    let done = 0;
    for (const a of assets) {
        a.once('load', () => onProgress?.(++done / assets.length));
        a.once('error', () => onProgress?.(++done / assets.length));
    }
    await new Promise<void>((resolve) => {
        const loader = new AssetListLoader(assets, app.assets);
        loader.load(() => resolve());
    });
    for (const a of assets) {
        if (a.loaded && a.resource) loaded.set(a.name, a.resource as ContainerResource);
        else console.warn(`TABULA: model ${a.name} did not load; using the primitive fallback`);
    }
}

export function hasModel(name: string): boolean {
    return loaded.has(name);
}

interface Converted {
    mat: StandardMaterial;
    ink: Color | null;
}

const converted = new Map<string, Converted>();

function roleOf(m: StandardMaterial): string {
    const i = m.name.lastIndexOf('.');
    return i >= 0 ? m.name.slice(i + 1) : m.name;
}

/** Shade suffixes: '<role>_d' is a darker tone of '<role>', '<role>_l' a lighter one. */
const DARK = new Color(0.165, 0.12, 0.29);

function tint(base: string, suffix: string): Color {
    const c = new Color().fromString(base);
    if (suffix === '_d') return new Color().lerp(DARK, c, 0.72);
    if (suffix === '_l') return new Color().lerp(new Color(1, 1, 1), c, 0.7);
    return c;
}

/** The colour a role is retinted to, if the instance asks for it. */
function recolor(role: string, colors?: Record<string, string>): Color | null {
    if (!colors) return null;
    if (colors[role]) return tint(colors[role], '');
    const m = /^(.*)(_d|_l)$/.exec(role);
    if (m && colors[m[1]]) return tint(colors[m[1]], m[2]);
    return null;
}

function convert(src: StandardMaterial, skinInk: Color | null, colors?: Record<string, string>): Converted {
    const role = roleOf(src);
    const tinted = recolor(role, colors);
    const key = `${src.name}|${tinted ? tinted.toString(false) : ''}`;
    const hit = converted.get(key);
    if (hit) return hit;
    const e = src.emissive;
    let out: Converted;
    if (e.r + e.g + e.b > 0.02) {
        out = { mat: glowMaterial(tinted ?? e, 1.25), ink: null };
    } else {
        // anime faces avoid harsh shadow shapes: the face is always lit, skin mostly so
        const face = role === 'face';
        const soft = face || role === 'skin';
        const mat = toonMaterial(tinted ?? src.diffuse, {
            map: src.diffuseMap,
            edge: face ? -1.5 : soft ? -0.42 : 0.05,
            rim: soft ? 0.1 : 0.16
        });
        const ink = role === 'face' && skinInk ? skinInk : inkOf(tinted ?? src.diffuse);
        out = { mat, ink };
    }
    converted.set(key, out);
    return out;
}

export interface InstanceOpts {
    /** outline width (fraction of the camera distance) */
    outline?: number;
    /** retint material roles: { leaf: '#2C6346' } also retints 'leaf_d' */
    colors?: Record<string, string>;
    /** cast shadows (glowing parts never do) */
    shadows?: boolean;
}

/** A fresh, cel-shaded, outlined copy of a loaded model. */
export function instantiate(name: string, opts: InstanceOpts = {}): Entity {
    const outlineWidth = opts.outline ?? 0.0013;
    const res = loaded.get(name);
    if (!res) throw new Error(`model ${name} is not loaded`);
    const root = res.instantiateRenderEntity();
    const renders = root.findComponents('render') as RenderComponent[];
    let skinInk: Color | null = null;
    for (const rc of renders) {
        for (const mi of rc.meshInstances) {
            const m = mi.material as StandardMaterial;
            if (roleOf(m) === 'skin') skinInk = inkOf(m.diffuse);
        }
    }
    for (const rc of renders) {
        const outline: MeshInstance[] = [];
        const inks: Color[] = [];
        for (const mi of rc.meshInstances) {
            const src = mi.material as StandardMaterial;
            const c = convert(src, skinInk, opts.colors);
            mi.material = c.mat;
            if (!c.ink || opts.shadows === false) mi.castShadow = false;
            // anime faces never take cast shadows (no hair shadow blotches across the eyes)
            if (roleOf(src) === 'face') mi.receiveShadow = false;
            if (c.ink) {
                outline.push(mi);
                inks.push(c.ink);
            }
        }
        addOutline(rc.entity, outline, inks, outlineWidth);
    }
    return root;
}

export function findNode(root: Entity, asset: string, node: string): Entity | null {
    return root.findByName(`${asset}:${node}`) as Entity | null;
}
