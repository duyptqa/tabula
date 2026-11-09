// The Blender-built anime models (art/blender -> public/models): preload, then instantiate with
// cel-shaded materials and outlines. Material names are '<asset>.<role>' from the Blender scripts.
import { Asset, AssetListLoader } from 'playcanvas';
import type {
    AppBase,
    Color,
    ContainerResource,
    Entity,
    MeshInstance,
    RenderComponent,
    StandardMaterial
} from 'playcanvas';

import { addOutline, glowMaterial, inkOf, toonMaterial } from './toon';

/** Every model the game knows; missing files fall back to the primitive builders. */
export const MODEL_NAMES = [
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

const converted = new WeakMap<StandardMaterial, Converted>();

function roleOf(m: StandardMaterial): string {
    const i = m.name.lastIndexOf('.');
    return i >= 0 ? m.name.slice(i + 1) : m.name;
}

function convert(src: StandardMaterial, skinInk: Color | null): Converted {
    const hit = converted.get(src);
    if (hit) return hit;
    const role = roleOf(src);
    const e = src.emissive;
    let out: Converted;
    if (e.r + e.g + e.b > 0.02) {
        out = { mat: glowMaterial(e, 1.25), ink: null };
    } else {
        // anime faces avoid harsh shadow shapes: the face is always lit, skin mostly so
        const face = role === 'face';
        const soft = face || role === 'skin';
        const mat = toonMaterial(src.diffuse, {
            map: src.diffuseMap,
            edge: face ? -1.5 : soft ? -0.42 : 0.05,
            rim: soft ? 0.1 : 0.16
        });
        const ink = role === 'face' && skinInk ? skinInk : inkOf(src.diffuse);
        out = { mat, ink };
    }
    converted.set(src, out);
    return out;
}

/** A fresh, cel-shaded, outlined copy of a loaded model. */
export function instantiate(name: string, outlineWidth = 0.0013): Entity {
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
            const c = convert(src, skinInk);
            mi.material = c.mat;
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
