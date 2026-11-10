// Anime water for the lagoon: a cel-lit turquoise surface whose emission paints the rest. Deeper
// teal in the middle and pale aqua shallows toward the shore, a white foam rim that breathes
// against the sand, and drifting sparkle streaks where the sun catches the ripples. It is a toon
// StandardMaterial with the emissive chunk replaced, so lighting, fog and the post stack all apply.
import { Color, SHADERLANGUAGE_GLSL, StandardMaterial } from 'playcanvas';

import { toonify } from './toon';

const WATER_EMISSIVE = /* glsl */ `
uniform vec3 uWater;       // centre x, centre z, radius (world)
uniform float uWaterTime;
uniform vec3 uShallow;
uniform vec3 uFoam;
float wHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float wNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void getEmission() {
    vec2 p = vPositionW.xz;
    vec2 rel = (p - uWater.xy) / uWater.z;
    float d = length(rel);
    float t = uWaterTime;
    // shallows: the outer third brightens toward pale aqua
    vec3 e = uShallow * smoothstep(0.45, 1.0, d) * 0.55;
    // foam rim: a wobbling white band hugging the shore, with a second, fainter line inside it
    float wob = wNoise(vec2(atan(rel.y, rel.x) * 6.0, t * 0.5)) * 0.05 + 0.02 * sin(t * 1.3);
    float rim = smoothstep(0.88 + wob, 0.92 + wob, d);
    float line2 = smoothstep(0.79 + wob, 0.81 + wob, d) * (1.0 - smoothstep(0.83 + wob, 0.85 + wob, d));
    e = mix(e, uFoam, rim * 0.95);
    e += uFoam * line2 * 0.45;
    // sun glints: thin, stepped ripple crests drifting across the surface
    float r = wNoise(p * 0.9 + vec2(t * 0.35, t * 0.2)) * 0.6 + wNoise(p * 2.3 - vec2(t * 0.25, -t * 0.4)) * 0.4;
    float crest = smoothstep(0.7, 0.72, r) * (1.0 - smoothstep(0.75, 0.77, r));
    e += uFoam * crest * 0.6 * (1.0 - rim);
    dEmission = e;
}
`;

function lin(hex: string): number[] {
    const c = new Color().fromString(hex);
    const f = (x: number) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return [f(c.r), f(c.g), f(c.b)];
}

/** A water material for a round body of water centred at (x, z) with radius r. */
export function waterMaterial(x: number, z: number, r: number): StandardMaterial {
    const m = new StandardMaterial();
    m.name = 'anime-water';
    m.diffuse = new Color().fromString('#2FA7C4');
    // an emissive colour switches the emissive chunk on; the chunk computes the real value
    m.emissive = new Color(1, 1, 1);
    toonify(m, { edge: -0.2, soft: 0.2, sat: 0.2, rim: 0 });
    m.getShaderChunks(SHADERLANGUAGE_GLSL).set('emissivePS', WATER_EMISSIVE);
    m.setParameter('uWater', [x, z, r]);
    m.setParameter('uWaterTime', 0);
    m.setParameter('uShallow', lin('#9CF2E8'));
    m.setParameter('uFoam', lin('#F4FFFF'));
    m.update();
    return m;
}
