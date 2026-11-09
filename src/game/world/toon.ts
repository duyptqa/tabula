// Anime cel shading for TABULA: a hard two-tone light ramp with a thin fresnel rim, and
// inverted-hull outlines extruded in the vertex shader so they stay a steady width on screen.
// The device is WebGL2 (see main.ts), so the chunk overrides are GLSL only.
import {
    BLEND_NORMAL,
    CULLFACE_FRONT,
    Color,
    Entity,
    MeshInstance,
    SHADERLANGUAGE_GLSL,
    StandardMaterial
} from 'playcanvas';
import type { Texture } from 'playcanvas';

const VERSION = '2.23';

/** Stepped diffuse: a lit side and a shadow side, softened over a couple of pixels. */
const TOON_DIFFUSE = /* glsl */ `
uniform float uToonEdge;
float getLightDiffuse(vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm) {
    float d = dot(worldNormal, -lightDirNorm);
    return smoothstep(uToonEdge - 0.035, uToonEdge + 0.035, d);
}
`;

/** A thin bright rim on silhouettes, added after tone mapping. */
const TOON_RIM_DECL = /* glsl */ `
uniform vec4 uRim;
`;
const TOON_RIM = /* glsl */ `
#ifdef LIT_NEEDS_NORMAL
    {
        float fr = 1.0 - max(dot(dVertexNormalW, dViewDirW), 0.0);
        pcFragColor0.rgb += uRim.rgb * smoothstep(0.66, 0.74, fr) * uRim.a;
    }
#endif
`;

/** Push every vertex out along its normal, further with distance, then re-project. */
const OUTLINE_DECL_VS = /* glsl */ `
#ifndef NORMALS
attribute vec3 vertex_normal;
#endif
uniform vec3 view_position;
uniform float uOutlineWidth;
`;
const OUTLINE_MAIN_VS = /* glsl */ `
    {
        vec3 nW = normalize(mat3(dModelMatrix) * vertex_normal);
        float dist = length(view_position - dPositionW);
        float w = uOutlineWidth * clamp(dist, 1.2, 45.0);
        gl_Position = matrix_viewProjection * vec4(dPositionW + nW * w, 1.0);
    }
`;

export interface ToonOpts {
    edge?: number; // light ramp threshold (lower = more of the surface lit)
    rim?: number; // rim strength
    map?: Texture | null;
    emissive?: string;
    ei?: number;
    opacity?: number;
}

const rimColor = new Color(1, 0.94, 0.98);

/** Turn a StandardMaterial into a cel-shaded one (in place). */
export function toonify(m: StandardMaterial, o: ToonOpts = {}): StandardMaterial {
    m.shaderChunksVersion = VERSION;
    const chunks = m.getShaderChunks(SHADERLANGUAGE_GLSL);
    chunks.set('lightDiffuseLambertPS', TOON_DIFFUSE);
    chunks.set('litUserDeclarationPS', TOON_RIM_DECL);
    chunks.set('litUserMainEndPS', TOON_RIM);
    m.setParameter('uToonEdge', o.edge ?? 0.06);
    const rim = o.rim ?? 0.16;
    m.setParameter('uRim', [rimColor.r, rimColor.g, rimColor.b, rim]);
    // anime surfaces are matte: no specular glints, no environment reflections
    m.useMetalness = true;
    m.metalness = 0;
    m.gloss = 0.15;
    m.specularityFactor = 0;
    m.useSkybox = false;
    m.update();
    return m;
}

const cache = new Map<string, StandardMaterial>();

export function toonMaterial(color: Color, o: ToonOpts = {}): StandardMaterial {
    const key = `${color.toString(false)}|${o.map?.name ?? ''}|${o.edge ?? ''}|${o.rim ?? ''}|${o.emissive ?? ''}|${o.ei ?? ''}|${o.opacity ?? 1}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const m = new StandardMaterial();
    m.name = `toon:${key}`;
    m.diffuse.copy(color);
    if (o.map) m.diffuseMap = o.map;
    if (o.emissive) {
        m.emissive = new Color().fromString(o.emissive);
        m.emissiveIntensity = o.ei ?? 1;
    }
    if (o.opacity !== undefined && o.opacity < 1) {
        m.opacity = o.opacity;
        m.blendType = BLEND_NORMAL;
        m.depthWrite = false;
    }
    toonify(m, o);
    cache.set(key, m);
    return m;
}

export function glowMaterial(color: Color, intensity = 1.2): StandardMaterial {
    const key = `glow|${color.toString(false)}|${intensity}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const m = new StandardMaterial();
    m.name = key;
    m.useLighting = false;
    m.useSkybox = false;
    m.diffuse = new Color(0, 0, 0);
    m.emissive = color.clone();
    m.emissiveIntensity = intensity;
    m.update();
    cache.set(key, m);
    return m;
}

/** Outline colour: the surface colour pulled toward deep ink violet, never pure black. */
export function inkOf(c: Color, k = 0.38): Color {
    const ink = new Color(0.165, 0.12, 0.29);
    return new Color(c.r * k + ink.r * (1 - k), c.g * k + ink.g * (1 - k), c.b * k + ink.b * (1 - k));
}

export function outlineMaterial(color: Color, width = 0.0011): StandardMaterial {
    const key = `outline|${color.toString(false)}|${width}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const m = new StandardMaterial();
    m.name = key;
    m.useLighting = false;
    m.useSkybox = false;
    m.diffuse = new Color(0, 0, 0);
    m.emissive = color.clone();
    m.cull = CULLFACE_FRONT;
    m.shaderChunksVersion = VERSION;
    const chunks = m.getShaderChunks(SHADERLANGUAGE_GLSL);
    chunks.set('litUserDeclarationVS', OUTLINE_DECL_VS);
    chunks.set('litUserMainEndVS', OUTLINE_MAIN_VS);
    m.setParameter('uOutlineWidth', width);
    m.update();
    cache.set(key, m);
    return m;
}

/** Mesh instances that are outline hulls (so effects like paper-white can tell them apart). */
export const outlineInstances = new WeakSet<MeshInstance>();
const outlineColor = new WeakMap<MeshInstance, Color>();

export function outlineColorOf(mi: MeshInstance): Color | undefined {
    return outlineColor.get(mi);
}

/**
 * Give an entity an outline hull: a child entity named 'outline' that redraws the listed meshes
 * with the extruding outline material (the render component's own instances are left alone).
 */
export function addOutline(e: Entity, mis: MeshInstance[], colors: Color[], width: number): Entity | null {
    const list: MeshInstance[] = [];
    mis.forEach((mi, i) => {
        if (!mi.mesh) return;
        const ol = new MeshInstance(mi.mesh, outlineMaterial(colors[i], width));
        outlineInstances.add(ol);
        outlineColor.set(ol, colors[i]);
        list.push(ol);
    });
    if (!list.length) return null;
    const child = new Entity('outline');
    child.addComponent('render', { meshInstances: list, castShadows: false, receiveShadows: false });
    e.addChild(child);
    return child;
}
