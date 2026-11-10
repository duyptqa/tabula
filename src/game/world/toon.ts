// Anime cel shading for TABULA, after the look of modern anime open-world games: a stepped light
// ramp whose shadow side is a cooler, more saturated tone of the surface (never grey), a rim of
// light on the sun side of silhouettes, a jagged highlight band on hair, and inverted-hull
// outlines in a darker shade of each surface. The device is WebGL2 (see main.ts), so the chunk
// overrides are GLSL only.
//
// The sun is a white directional light of intensity 1 and the scene ambient is black, so the
// engine's accumulated diffuse light is exactly the sun's visibility (ramp x cast shadow); the
// combine chunk below turns that into a mix between the lit and the shadow colour. Those colours
// are global uniforms set by setToonLighting().
import {
    BLEND_NORMAL,
    CULLFACE_FRONT,
    CULLFACE_NONE,
    Color,
    Entity,
    MeshInstance,
    SHADERLANGUAGE_GLSL,
    StandardMaterial
} from 'playcanvas';
import type { GraphicsDevice, Texture, Vec3 } from 'playcanvas';

const VERSION = '2.23';

/** Stepped diffuse: lit side and shadow side, with a per-material soft band between them. */
const TOON_DIFFUSE = /* glsl */ `
uniform float uToonEdge;
uniform float uToonSoft;
float getLightDiffuse(vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm) {
    float d = dot(worldNormal, -lightDirNorm);
    return smoothstep(uToonEdge - uToonSoft, uToonEdge + uToonSoft, d);
}
`;

/** Lit colour vs shadow colour from the sun's visibility; shadows lean toward the surface hue. */
const TOON_COMBINE = /* glsl */ `
uniform vec3 uToonLight;
uniform vec3 uToonShadow;
uniform vec3 uShadeTint;
uniform float uShadeSat;
uniform float uShadeLift;
uniform float uGround;
float tgHash(vec2 p) {
    return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453);
}
float tgNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(tgHash(i), tgHash(i + vec2(1.0, 0.0)), u.x), mix(tgHash(i + vec2(0.0, 1.0)), tgHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// painted ground: broad patches of sun-warmed and deeper tone, with soft brush streaks inside
vec3 paintGround(vec3 albedo) {
    vec2 p = vPositionW.xz;
    float n = tgNoise(p * 0.07) * 0.65 + tgNoise(p * 0.19 + 7.3) * 0.35;
    float warm = smoothstep(0.42, 0.62, n);
    vec3 c = mix(albedo * vec3(0.84, 0.92, 0.96), albedo * vec3(1.1, 1.08, 0.84), warm);
    float stroke = tgNoise(vec2(p.x * 1.3 + p.y * 0.5, p.y * 0.22 - p.x * 0.1));
    c *= 1.0 + (stroke - 0.5) * 0.14;
    return mix(albedo, c, uGround);
}
vec3 combineColor(vec3 albedo, vec3 sheenSpecularity, float clearcoatSpecularity) {
    if (uGround > 0.0) albedo = paintGround(albedo);
    float lit = clamp(dDiffuseLight.g, 0.0, 1.0);
    float mx = max(max(albedo.r, albedo.g), max(albedo.b, 0.0001));
    vec3 hue = albedo / mx;
    vec3 shade = albedo * mix(uToonShadow * uShadeTint, vec3(1.0), uShadeLift) * mix(vec3(1.0), hue, uShadeSat);
    vec3 ret = mix(shade, albedo * uToonLight, lit);
#ifdef LIT_SPECULAR
    ret += dSpecularLight;
#endif
#ifdef LIT_REFLECTIONS
    ret += dReflection.rgb * dReflection.a;
#endif
    return ret;
}
`;

/** Rim light on the sun side of silhouettes, and the jagged hair highlight band. */
const TOON_END_DECL = /* glsl */ `
uniform vec4 uRim;
uniform float uHairRing;
uniform vec3 uToonSunDir;
`;
const TOON_END = /* glsl */ `
#ifdef LIT_NEEDS_NORMAL
    {
        vec3 N = dVertexNormalW;
        float ndv = max(dot(N, dViewDirW), 0.0);
        float fr = 1.0 - ndv;
        float toward = clamp(dot(N, uToonSunDir) * 0.6 + 0.5, 0.0, 1.0);
        float rim = smoothstep(0.62, 0.7, fr) * toward;
        pcFragColor0.rgb += uRim.rgb * rim * uRim.a;
        if (uHairRing > 0.0) {
            float a = atan(N.z, N.x);
            float jag = 0.5 + 0.5 * sin(a * 23.0);
            float lo = 0.36 + 0.07 * jag;
            float band = smoothstep(lo, lo + 0.03, N.y) * (1.0 - smoothstep(0.6, 0.64, N.y));
            band *= smoothstep(0.15, 0.35, ndv);
            pcFragColor0.rgb = mix(pcFragColor0.rgb, pcFragColor0.rgb * 1.3 + vec3(0.07, 0.07, 0.09), band * uHairRing);
        }
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
    soft?: number; // half-width of the soft band between light and shadow
    rim?: number; // rim strength
    shade?: string; // shadow tint for this surface (skin is warm), on top of the scene's shadow colour
    lift?: number; // 0-1: how far this surface's shadow is lifted toward its lit colour (characters)
    ground?: number; // 0-1: painted ground patches and brush streaks in world space (isle tops)
    sat?: number; // how far shadows lean toward the surface hue
    hair?: number; // hair highlight band strength
    map?: Texture | null;
    emissive?: string;
    ei?: number;
    opacity?: number;
    vc?: boolean; // multiply by vertex colours (painted gradients from Blender)
    twoSided?: boolean; // grass blades and leaf cards are seen from both sides
}

const rimColor = new Color(1, 0.95, 0.88);

/** Linear-space colour from a hex string. */
function linearOf(hexStr: string): [number, number, number] {
    const c = new Color().fromString(hexStr);
    const f = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return [f(c.r), f(c.g), f(c.b)];
}

/** Set the scene-wide lit and shadow colours and the sun direction every toon material reads. */
export function setToonLighting(device: GraphicsDevice, light: string, shadow: string, sunDir: Vec3) {
    device.scope.resolve('uToonLight').setValue(linearOf(light));
    device.scope.resolve('uToonShadow').setValue(linearOf(shadow));
    device.scope.resolve('uToonSunDir').setValue([sunDir.x, sunDir.y, sunDir.z]);
}

/** Turn a StandardMaterial into a cel-shaded one (in place). */
export function toonify(m: StandardMaterial, o: ToonOpts = {}): StandardMaterial {
    m.shaderChunksVersion = VERSION;
    const chunks = m.getShaderChunks(SHADERLANGUAGE_GLSL);
    chunks.set('lightDiffuseLambertPS', TOON_DIFFUSE);
    chunks.set('combinePS', TOON_COMBINE);
    chunks.set('litUserDeclarationPS', TOON_END_DECL);
    chunks.set('litUserMainEndPS', TOON_END);
    m.setParameter('uToonEdge', o.edge ?? 0.06);
    m.setParameter('uToonSoft', o.soft ?? 0.035);
    m.setParameter('uShadeTint', o.shade ? linearOf(o.shade) : [1, 1, 1]);
    m.setParameter('uShadeSat', o.sat ?? 0.35);
    m.setParameter('uShadeLift', o.lift ?? 0);
    m.setParameter('uGround', o.ground ?? 0);
    m.setParameter('uHairRing', o.hair ?? 0);
    const rim = o.rim ?? 0.16;
    m.setParameter('uRim', [rimColor.r, rimColor.g, rimColor.b, rim]);
    if (o.vc) m.diffuseVertexColor = true;
    if (o.twoSided) m.cull = CULLFACE_NONE;
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
    const key = `${color.toString(false)}|${o.map?.name ?? ''}|${o.edge ?? ''}|${o.soft ?? ''}|${o.rim ?? ''}|${o.shade ?? ''}|${o.lift ?? ''}|${o.ground ?? ''}|${o.sat ?? ''}|${o.hair ?? ''}|${o.vc ? 1 : 0}|${o.twoSided ? 1 : 0}|${o.emissive ?? ''}|${o.ei ?? ''}|${o.opacity ?? 1}`;
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

/** Outline colour: the surface colour pulled toward a deep warm-violet ink, never pure black. */
export function inkOf(c: Color, k = 0.45): Color {
    const ink = new Color(0.2, 0.13, 0.2);
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
