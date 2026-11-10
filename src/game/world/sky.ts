// The daytime anime sky: a dome that follows the camera, painted in its shader. A deep cerulean
// zenith fades to a pale, sunlit haze at the horizon; the sun is a soft-edged disc in a warm glow;
// cumulus are puffy cel shapes (layered cellular noise) with a lit side, a cool shadow side and a
// bright rim, drifting slowly. Colours are linear, so CameraFrame's tone mapping treats the sky
// like the rest of the frame.
import { CULLFACE_FRONT, Entity, SEMANTIC_POSITION, ShaderMaterial } from 'playcanvas';
import type { Vec3 } from 'playcanvas';

const VS = /* glsl */ `
attribute vec3 vertex_position;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec3 vDir;
void main(void) {
    vDir = vertex_position;
    vec4 p = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
    // pin the dome to the far plane so it never clips anything
    gl_Position = vec4(p.xy, p.w * 0.99999, p.w);
}
`;

const FS = /* glsl */ `
#include "gammaPS"
#include "tonemappingPS"
varying vec3 vDir;
uniform vec3 uSunDir;
uniform float uTime;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uBelow;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uSunGlow;

vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash2(i).x;
    float b = hash2(i + vec2(1.0, 0.0)).x;
    float c = hash2(i + vec2(0.0, 1.0)).x;
    float d = hash2(i + vec2(1.0, 1.0)).x;
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
// rounded puffs: 1 - distance to the nearest feature point
float puffs(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float md = 1.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 o = hash2(i + g) * 0.8 + 0.1;
            md = min(md, length(g + o - f));
        }
    }
    return 1.0 - md;
}
float cloudField(vec2 p) {
    // big, sparse banks: low-frequency coverage decides where clouds are, puffs shape their edges
    float cover = vnoise(p * 0.11) * 0.7 + vnoise(p * 0.27) * 0.3;
    float c = puffs(p * 0.8) * 0.6 + puffs(p * 1.9 + 3.7) * 0.28 + puffs(p * 4.1 + 9.1) * 0.12;
    return c * 0.7 + smoothstep(0.35, 0.8, cover) * 0.95 - 0.88;
}

void main(void) {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
    col = mix(col, uZenith, smoothstep(0.2, 0.8, h));
    col = mix(col, uBelow, smoothstep(0.0, -0.2, h));

    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunGlow * (pow(sd, 5.0) * 0.3 + pow(sd, 48.0) * 0.6);

    // cumulus: a plane of clouds seen from below, squashed toward the horizon
    if (h > -0.04) {
        vec2 uv = d.xz / (h + 0.2) * 1.5 + vec2(uTime * 0.01, uTime * 0.003);
        float n = cloudField(uv);
        float fade = smoothstep(-0.04, 0.05, h) * (1.0 - smoothstep(0.3, 0.62, h));
        float mask = smoothstep(0.0, 0.025, n) * fade;
        // self-shadow: denser toward the sun means this side faces away from it
        vec2 toSun = normalize(uSunDir.xz + 0.0001) * 0.22;
        float n2 = cloudField(uv + toSun);
        float lit = 1.0 - smoothstep(0.0, 0.08, n2 - n + 0.02);
        lit = max(lit, smoothstep(0.25, 0.0, n)); // thin edges glow
        vec3 cc = mix(uCloudShade, uCloudLit, lit);
        // a bright rim where the cloud thins out, warmer toward the sun
        float rim = 1.0 - smoothstep(0.0, 0.07, n);
        cc += rim * (0.18 + 0.5 * pow(sd, 6.0)) * uSunGlow;
        // distance haze: low clouds melt into the horizon
        cc = mix(uHorizon, cc, smoothstep(-0.02, 0.18, h) * 0.75 + 0.25);
        col = mix(col, cc, mask);
    }

    // the sun disc, in front of the clouds
    col = mix(col, uSunGlow * 4.0, smoothstep(0.99935, 0.9996, sd));

    gl_FragColor = vec4(gammaCorrectOutput(toneMap(col)), 1.0);
}
`;

function lin(hex: string): number[] {
    const n = parseInt(hex.slice(1), 16);
    const f = (x: number) => {
        const c = x / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}

export interface SkyPalette {
    zenith: string;
    mid: string;
    horizon: string;
    below: string;
    cloudLit: string;
    cloudShade: string;
    sunGlow: string;
}

export const DAY_SKY: SkyPalette = {
    zenith: '#2F6FD6',
    mid: '#5FA6EE',
    horizon: '#CDEBFA',
    below: '#E6F4FC',
    cloudLit: '#FFFFFF',
    cloudShade: '#B9C8EA',
    sunGlow: '#FFE7B8'
};

export class Sky {
    entity: Entity;
    private mat: ShaderMaterial;
    private time = 0;

    constructor(parent: Entity, sunDir: Vec3, palette: SkyPalette = DAY_SKY) {
        this.mat = new ShaderMaterial({
            uniqueName: 'tabula-sky',
            vertexGLSL: VS,
            fragmentGLSL: FS,
            attributes: { vertex_position: SEMANTIC_POSITION }
        });
        this.mat.cull = CULLFACE_FRONT;
        this.mat.depthWrite = false;
        this.setPalette(palette);
        this.mat.setParameter('uSunDir', [sunDir.x, sunDir.y, sunDir.z]);
        this.mat.setParameter('uTime', 0);
        this.mat.update();
        this.entity = new Entity('sky');
        this.entity.addComponent('render', {
            type: 'sphere',
            material: this.mat,
            castShadows: false,
            receiveShadows: false
        });
        this.entity.setLocalScale(400, 400, 400);
        parent.addChild(this.entity);
        // it sits on the far plane, so depth testing alone keeps it behind everything
        this.entity.render!.meshInstances[0].cull = false;
    }

    setPalette(p: SkyPalette) {
        this.mat.setParameter('uZenith', lin(p.zenith));
        this.mat.setParameter('uMid', lin(p.mid));
        this.mat.setParameter('uHorizon', lin(p.horizon));
        this.mat.setParameter('uBelow', lin(p.below));
        this.mat.setParameter('uCloudLit', lin(p.cloudLit));
        this.mat.setParameter('uCloudShade', lin(p.cloudShade));
        this.mat.setParameter('uSunGlow', lin(p.sunGlow));
    }

    /** Follow the camera so the dome is always around it; drift the clouds. */
    update(dt: number, camPos: Vec3) {
        this.time += dt;
        this.mat.setParameter('uTime', this.time);
        this.entity.setPosition(camPos);
    }
}
