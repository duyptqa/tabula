// Scriptoria: the ring of floating isles around the Blank, built from primitives.
import type { AppBase, Entity } from 'playcanvas';
import { Entity as PcEntity } from 'playcanvas';

import { CAST } from '../cast';
import type { SpeakerId } from '../cast';
import { ISLES, ROUTES } from '../data';
import type { IsleId } from '../data';
import { hasFlag, isForgotten } from '../state';
import type { GameState } from '../state';

import {
    animateRig,
    buildChibi,
    buildGolem,
    buildItsuki,
    buildLethe,
    buildSphinx,
    buildStag,
    group,
    part,
    setBatchGroup,
    setPaper,
    setStreak
} from './models';
import type { Rig } from './models';
import * as P from './props';

export interface Collider {
    x: number;
    z: number;
    r: number;
}

export interface Anchor {
    x: number;
    z: number;
    isle: IsleId;
}

export interface Npc {
    id: string;
    speaker: SpeakerId;
    rig: Rig;
    x: number;
    z: number;
    yaw: number;
    isle: IsleId;
    visible: boolean;
}

export interface DockRec {
    isle: IsleId;
    to: IsleId;
    x: number;
    z: number;
    yaw: number;
    entity: Entity;
}

export interface Trigger {
    id: string;
    x: number;
    z: number;
    r: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

export class World {
    root: Entity;
    colliders: Collider[] = [];
    anchors = new Map<string, Anchor>();
    npcs = new Map<string, Npc>();
    docks: DockRec[] = [];
    triggers: Trigger[] = [];
    slabStones = new Map<IsleId, Entity>();
    inkwells = new Map<IsleId, { root: Entity; glow: Entity }>();
    hearts = new Map<string, Entity>();
    forgettables = new Map<string, Entity[]>();
    spinners: { e: Entity; speed: number }[] = [];
    smoke: Entity[] = [];
    lagoon = { x: 0, z: 0, r: 0 };
    islet = { x: 0, z: 0, r: 0 };
    spireOrb!: Entity;
    tideBell!: Entity;
    rift!: Entity;
    time = 0;
    private isleGroups = new Map<IsleId, Entity>();
    private statues: Entity[] = [];
    private batchIds: number[] = [];
    private paperKey = '';

    private app: AppBase;

    constructor(app: AppBase) {
        this.app = app;
        this.root = new PcEntity('world');
        app.root.addChild(this.root);
        P.stars(this.root, app.graphicsDevice, 520);
        P.theBlank(this.root);
        this.buildHearthpage();
        this.buildForkwood();
        this.buildLoopwater();
        this.buildLexicon();
        this.buildForgehollow();
        this.buildSpire();
        this.buildDocks();
        this.batch(app);
    }

    /**
     * Cut draw calls: each isle's props become one static batch group, minus anything that moves;
     * every character rig gets a dynamic group, since its limbs animate.
     */
    private batch(app: AppBase) {
        const b = app.batcher;
        if (!b) return;
        const skip = new Set<Entity>([
            ...this.spinners.map((sp) => sp.e),
            ...this.hearts.values(),
            ...this.slabStones.values(),
            ...this.smoke,
            this.rift,
            this.spireOrb
        ]);
        for (const [id, g] of this.isleGroups) {
            const grp = b.addGroup(`isle-${id}`, false, ISLES[id].r * 2 + 12);
            setBatchGroup(g, grp.id, skip);
            if (id === 'forgehollow') for (const st of this.statues) setBatchGroup(st, grp.id);
            this.batchIds.push(grp.id);
        }
        const docks = b.addGroup('docks', false, 400);
        for (const d of this.docks) setBatchGroup(d.entity, docks.id);
        this.batchIds.push(docks.id);
        for (const n of this.npcs.values()) {
            const grp = b.addGroup(`npc-${n.id}`, true, 10);
            setBatchGroup(n.rig.root, grp.id);
            this.batchIds.push(grp.id);
        }
    }

    // -----------------------------------------------------------------------------------------
    // helpers

    private w(isle: IsleId, x: number, z: number): [number, number] {
        const c = ISLES[isle];
        return [c.x + x, c.z + z];
    }

    private anchor(id: string, isle: IsleId, x: number, z: number) {
        const [wx, wz] = this.w(isle, x, z);
        this.anchors.set(id, { x: wx, z: wz, isle });
    }

    private col(isle: IsleId, x: number, z: number, r: number) {
        const [wx, wz] = this.w(isle, x, z);
        this.colliders.push({ x: wx, z: wz, r });
    }

    private forget(memory: string, e: Entity) {
        const list = this.forgettables.get(memory) ?? [];
        list.push(e);
        this.forgettables.set(memory, list);
    }

    private npc(id: string, speaker: SpeakerId, isle: IsleId, x: number, z: number, yaw = 0, scale = 1): Npc {
        const s = CAST[speaker];
        let rig: Rig;
        switch (s.model) {
            case 'golem':
                rig = buildGolem(s.golem!.body, s.golem!.glow, 1.3);
                break;
            case 'stag':
                rig = buildStag();
                break;
            case 'sphinx':
                rig = buildSphinx();
                break;
            case 'mirror':
                rig = buildItsuki(true);
                setStreak(rig, 3);
                break;
            case 'lethe':
                rig = buildLethe();
                break;
            default:
                rig = buildChibi(s.chibi!, id);
        }
        if (scale !== 1) rig.root.setLocalScale(scale, scale, scale);
        const [wx, wz] = this.w(isle, x, z);
        rig.root.setPosition(wx, 0, wz);
        rig.root.setEulerAngles(0, yaw, 0);
        this.root.addChild(rig.root);
        const n: Npc = { id, speaker, rig, x: wx, z: wz, yaw, isle, visible: true };
        this.npcs.set(id, n);
        this.colliders.push({ x: wx, z: wz, r: 0.7 * scale });
        return n;
    }

    private isleGroup(id: IsleId, top: string, soil: string, rock: string): Entity {
        const d = ISLES[id];
        const g = P.island(this.root, id, d.x, d.z, d.r, top, soil, rock);
        this.isleGroups.set(id, g);
        return g;
    }

    private trees(
        g: Entity,
        isle: IsleId,
        list: [number, number, number?][],
        leaf: string,
        kind: 'round' | 'pine' = 'round'
    ) {
        for (const [x, z, s = 1] of list) {
            P.tree(g, x, z, s, leaf, '#6B4632', kind);
            this.col(isle, x, z, 0.6 * s);
        }
    }

    private inkwell(g: Entity, isle: IsleId, x: number, z: number) {
        this.inkwells.set(isle, P.inkwell(g, x, z));
        this.col(isle, x, z, 0.7);
        this.anchor(`inkwell:${isle}`, isle, x, z);
    }

    private pedestalSlab(g: Entity, isle: IsleId, x: number, z: number, pink = false) {
        P.pedestal(g, x, z, pink ? '#4A2D5C' : '#6F6A93');
        const s = P.slabStone(g, x, z, 0, pink, 0.9);
        s.root.setLocalPosition(x, 0.5, z);
        this.slabStones.set(isle, s.root);
        this.col(isle, x, z, 1.2);
        this.anchor(`slab:${isle}`, isle, x, z);
    }

    private heart(g: Entity, isle: IsleId, id: string, x: number, z: number) {
        this.hearts.set(id, P.heartMarker(g, x, z, 1.6));
        this.anchor(`heart:${id}`, isle, x, z);
    }

    // -----------------------------------------------------------------------------------------
    // isles

    private buildHearthpage() {
        const id: IsleId = 'hearthpage';
        const g = this.isleGroup(id, '#7DBE7A', '#5B4636', '#4A3A5E');
        const mill = P.windmill(g, -2, -10, 0, 1.4);
        this.spinners.push({ e: mill.blades, speed: 0 });
        this.anchor('mill', id, -2, -10);
        this.col(id, -2, -10, 1.9);
        this.npc('warden', 'warden', id, 2.8, -6.2, -20);
        this.pedestalSlab(g, id, -2, -5.6);
        const m2 = P.windmill(g, -15, -5, 40, 0.7);
        this.spinners.push({ e: m2.blades, speed: 40 });
        this.col(id, -15, -5, 0.9);
        const m3 = P.windmill(g, 15, 8, -50, 0.6);
        this.spinners.push({ e: m3.blades, speed: 55 });
        this.col(id, 15, 8, 0.8);
        // Mom's house and the music box
        P.house(g, -11, 2.5, 70, '#F3EBDD', '#C46A4A', 3.4, 3, 2.4);
        this.col(id, -11, 2.5, 2.2);
        this.npc('mom', 'mom', id, -7.8, 4.6, 110);
        const box = P.musicBox(g, -8.6, 0.8);
        this.col(id, -8.6, 0.8, 0.6);
        this.anchor('musicbox', id, -8.6, 0.8);
        this.forget('lullaby', box);
        // Tomo's bakery
        P.house(g, 10.5, 1.5, -70, '#F3EBDD', '#E8C46A', 3.4, 3, 2.4);
        this.col(id, 10.5, 1.5, 2.2);
        const stall = P.counter(g, 7.6, 4.4, -70);
        this.col(id, 7.6, 4.4, 1.2);
        const tomo = this.npc('tomo', 'tomo', id, 6.6, 6.4, -150);
        this.forget('tomo', tomo.rig.root);
        this.forget('bun', stall);
        this.anchor('bakery', id, 7.6, 4.4);
        // rooftop lookout (a raised deck)
        const deck = group(g, 'deck', [12.5, 0, -10]);
        part(deck, 'box', { color: '#9A6B45', pos: [0, 0.15, 0], scale: [4, 0.3, 3], outline: 0.04 });
        P.bench(deck, 0, -0.6, 30);
        this.forget('stars', deck);
        this.heart(g, id, 'hearthpage', 12.5, -10);
        // houses, trees, lanterns
        P.house(g, -6, 11, 20, '#E9DFC2', '#3A8AA6', 3, 2.6, 2);
        this.col(id, -6, 11, 1.9);
        P.house(g, 14, -2.5, -90, '#E9DFC2', '#C46A4A', 2.6, 2.6, 2);
        this.col(id, 14, -2.5, 1.7);
        this.trees(
            g,
            id,
            [
                [-16, 6],
                [-13, 11, 1.2],
                [-17, -12, 0.9],
                [8, -16],
                [-9, -16, 1.1],
                [17, -9, 0.8],
                [3, 16, 0.9],
                [-12, 14]
            ],
            '#4F9A5C'
        );
        for (const [x, z] of [
            [2, 3],
            [-3, 3],
            [4, -2]
        ])
            P.lantern(g, x, z);
        this.inkwell(g, id, 3.5, 9.5);
        this.npc('pix', 'pix', id, -3.5, 13.5, 160);
        this.forget('home', this.inkwells.get(id)!.root);
        this.anchor('spawn', id, 0, 6);
    }

    private buildForkwood() {
        const id: IsleId = 'forkwood';
        const g = this.isleGroup(id, '#3E7D5A', '#3A2E2A', '#3A3366');
        // the tree wall dividing the fork from the clearing, with three arches (left, middle, right
        // as seen walking west from the fork). Trees overlap so the only ways through are the arches.
        const gaps = [7, 1.5, -4];
        let lastZ = -99;
        for (let z = -19.6; z <= 19.6; z += 0.1) {
            if (gaps.some((gz) => Math.abs(z - gz) < 2.0)) continue;
            if (z - lastZ < 1.45) continue;
            lastZ = z;
            const x = -1.5;
            P.tree(g, x + Math.sin(z * 0.7) * 0.25, z, 0.95, '#2C6346', '#5B4636', 'pine');
            this.col(id, x, z, 0.85);
        }
        const names = ['left', 'middle', 'right'];
        gaps.forEach((gz, i) => {
            P.arch(g, -1.5, gz, 90, i === 2 ? '#5ED6E8' : '#5ED6E8');
            this.col(id, -1.5, gz - 1.25, 0.45);
            this.col(id, -1.5, gz + 1.25, 0.45);
            this.anchor(`arch:${names[i]}`, id, -1.5, gz);
            const [tx, tz] = this.w(id, -3.6, gz);
            this.triggers.push({ id: `arch:${names[i]}`, x: tx, z: tz, r: 1.4 });
            // signposts, east of each arch, facing the fork
            P.signpost(g, 1.6, gz + (i === 1 ? 2.2 : i === 0 ? -2.2 : 2.2), 90);
            this.anchor(`sign:${names[i]}`, id, 1.6, gz + (i === 1 ? 2.2 : i === 0 ? -2.2 : 2.2));
            this.col(id, 1.6, gz + (i === 1 ? 2.2 : i === 0 ? -2.2 : 2.2), 0.4);
        });
        this.anchor('fork', id, 6, 2);
        this.npc('stag', 'stag', id, 7, -2.5, -70);
        // the clearing (west)
        this.pedestalSlab(g, id, -11, -6);
        this.npc('vesper', 'vesper', id, -8.5, -3.5, 120);
        this.anchor('clearing', id, -8, -5);
        this.trees(
            g,
            id,
            [
                [-14, 6, 1.1],
                [-10, 11],
                [-6, 15, 0.9],
                [-16, -1],
                [-15, -11],
                [-9, -15],
                [-5, -12, 0.8]
            ],
            '#2C6346',
            'pine'
        );
        // east side
        this.trees(
            g,
            id,
            [
                [10, 11],
                [13, -8, 1.1],
                [5, -14],
                [14, 3, 0.8],
                [3, 15, 0.9]
            ],
            '#4F9A5C'
        );
        this.inkwell(g, id, 11, 5);
        // a mossy log for Lethe
        part(g, 'cylinder', {
            color: '#6B4632',
            pos: [7.5, 0.4, 12.5],
            rot: [0, 0, 90],
            scale: [0.8, 2.6, 0.8],
            outline: 0.04
        });
        this.col(id, 7.5, 12.5, 1.2);
        this.heart(g, id, 'forkwood', 7.5, 12.5);
        // a Blank rift where Segfault lurks
        const rift = group(g, 'rift', [8, 0, -12.5]);
        for (let i = 0; i < 5; i++)
            part(rift, 'box', {
                color: i % 2 ? '#A7F07A' : '#F7F5FF',
                pos: [0, 0.6 + i * 0.5, 0],
                rot: [0, i * 30, 12 * (i - 2)],
                scale: [1.6 - i * 0.2, 0.12, 0.12],
                unlit: true
            });
        this.rift = rift;
        this.npc('segfault', 'segfault', id, 10, -11, -120);
    }

    private buildLoopwater() {
        const id: IsleId = 'loopwater';
        const g = this.isleGroup(id, '#E3D1A4', '#6B5A4A', '#3A3366');
        const lx = -3;
        const lz = -3;
        P.water(g, lx, lz, 7.5);
        const [wx, wz] = this.w(id, lx, lz);
        this.lagoon = { x: wx, z: wz, r: 7.5 };
        part(g, 'cylinder', { color: '#E3D1A4', pos: [lx, 0.0, lz], scale: [5, 0.1, 5], outline: 0.04, shadow: false });
        this.islet = { x: wx, z: wz, r: 2.5 };
        const bt = P.bellTower(g, lx, lz);
        this.tideBell = bt.bell;
        this.anchor('tidebell', id, lx, lz);
        for (const [x, z] of [
            [-0.8, -0.8],
            [0.8, -0.8],
            [-0.8, 0.8],
            [0.8, 0.8]
        ])
            this.col(id, lx + x, lz + z, 0.3);
        this.npc('wade', 'wade', id, 5.8, 2.5, -110);
        this.npc('overflow', 'overflow', id, 5.5, -7.5, -60);
        this.pedestalSlab(g, id, 7.5, -9.5);
        for (const [x, z, r] of [
            [9, 7, -40],
            [11, -3, -95],
            [2, 12.5, 10],
            [-11, 9, 60]
        ] as [number, number, number][]) {
            P.house(g, x, z, r, '#F3EBDD', '#3A8AA6', 2.8, 2.6, 2);
            this.col(id, x, z, 1.8);
        }
        this.trees(
            g,
            id,
            [
                [-15, -7, 0.9],
                [-12, -13],
                [14, 10, 0.8],
                [-6, 15, 0.9]
            ],
            '#4F9A5C'
        );
        this.inkwell(g, id, 12.5, 4);
        P.bench(g, -14, 2, 90);
        this.col(id, -14, 2, 0.9);
        this.heart(g, id, 'loopwater', -14, 2);
        for (const [x, z] of [
            [4, 0],
            [3, -6],
            [-9, 4]
        ])
            P.lantern(g, x, z, '#8FF3FF');
    }

    private buildLexicon() {
        const id: IsleId = 'lexicon';
        const g = this.isleGroup(id, '#E2B867', '#8A5E3F', '#4A3A5E');
        for (const [x, z, s] of [
            [-12, -8, 1],
            [10, 9, 0.8],
            [-6, 13, 0.9],
            [13, -5, 0.7],
            [-14, 4, 0.6]
        ])
            P.dune(g, x, z, s);
        P.dome(g, -6, -5, 1.2);
        this.col(id, -6, -5, 3.4);
        P.dome(g, 9, -9, 0.8);
        this.col(id, 9, -9, 2.3);
        P.dome(g, -10, 8, 0.9);
        this.col(id, -10, 8, 2.6);
        this.anchor('archive', id, -10, 8);
        this.npc('deadlock', 'deadlock', id, -6.5, 9.5, 120);
        this.npc('sphinx', 'sphinx', id, 2, -2, 10);
        this.pedestalSlab(g, id, 2, -12);
        this.npc('sable', 'sable', id, 5, -11, -60);
        for (const [x, z] of [
            [-1, 6],
            [6, 3],
            [-2, -14]
        ]) {
            part(g, 'cylinder', { color: '#C99A45', pos: [x, 1.2, z], scale: [0.6, 2.4, 0.6], outline: 0.04 });
            this.col(id, x, z, 0.4);
        }
        this.inkwell(g, id, 9, 4);
        P.bench(g, -13, -1, 90);
        this.col(id, -13, -1, 0.9);
        this.heart(g, id, 'lexicon', -13, -1);
        this.trees(
            g,
            id,
            [
                [-15, -3, 0.7],
                [14, 4, 0.8]
            ],
            '#7BD389'
        );
    }

    private buildForgehollow() {
        const id: IsleId = 'forgehollow';
        const g = this.isleGroup(id, '#8E5A4A', '#4A2826', '#2A1F3A');
        const v = P.volcano(g, 6, -6, 1);
        this.smoke.push(...v.smoke);
        this.col(id, 6, -6, 4.4);
        P.forge(g, -8, -4, 30);
        this.col(id, -8, -4, 2.6);
        this.npc('smith', 'smith', id, -4, 1, 40);
        this.pedestalSlab(g, id, -9, 7);
        this.npc('brakk', 'brakk', id, -5.5, 8.5, 140);
        for (const [x, z, yaw] of [
            [9, 7, -40],
            [12, 3, -80]
        ]) {
            const gr = buildGolem('#6B3B37', '#FF9A4A', 0.8);
            const [wx, wz] = this.w(id, x, z);
            gr.root.setPosition(wx, 0, wz);
            gr.root.setEulerAngles(0, yaw, 0);
            this.root.addChild(gr.root);
            this.statues.push(gr.root);
            this.col(id, x, z, 0.6);
        }
        for (const [x, z] of [
            [-12, -10],
            [1, 12],
            [14, -2]
        ])
            P.rock(g, x, z, 1.2, '#4A2826');
        this.col(id, -12, -10, 1.2);
        this.col(id, 1, 12, 1.2);
        this.col(id, 14, -2, 1.2);
        this.inkwell(g, id, 4, 7);
        P.bench(g, 14, -10, -60);
        this.col(id, 14, -10, 0.9);
        this.heart(g, id, 'forgehollow', 14, -10);
        for (const [x, z] of [
            [-2, -3],
            [3, 3]
        ])
            P.lantern(g, x, z, '#FF9A4A');
    }

    private buildSpire() {
        const id: IsleId = 'spire';
        const g = this.isleGroup(id, '#2A2147', '#1E1838', '#15122B');
        const sp = P.spire(g, 0, 0);
        this.spireOrb = sp.orb;
        this.col(id, 0, 0, 3.7);
        this.npc('mirror', 'mirror', id, 0, 5.4, 0);
        this.npc('null', 'null', id, -3.2, 5.2, 20, 1.35);
        this.pedestalSlab(g, id, 4.2, 5.2, true);
        this.anchor('spire-door', id, 0, 5);
    }

    private buildDocks() {
        for (const r of ROUTES) {
            for (const [from, to] of [
                [r.a, r.b],
                [r.b, r.a]
            ] as [IsleId, IsleId][]) {
                const a = ISLES[from];
                const b = ISLES[to];
                const dx = b.x - a.x;
                const dz = b.z - a.z;
                const len = Math.hypot(dx, dz);
                const ux = dx / len;
                const uz = dz / len;
                const x = a.x + ux * (a.r - 1.8);
                const z = a.z + uz * (a.r - 1.8);
                const yaw = (Math.atan2(ux, uz) * 180) / Math.PI;
                const e = P.dock(this.root, x, z, yaw);
                this.docks.push({ isle: from, to, x: x + ux * 1.2, z: z + uz * 1.2, yaw, entity: e });
            }
        }
    }

    // -----------------------------------------------------------------------------------------
    // queries

    isleAt(x: number, z: number): IsleId | null {
        for (const d of Object.values(ISLES)) {
            if (Math.hypot(x - d.x, z - d.z) <= d.r + 2) return d.id;
        }
        return null;
    }

    /** What is underfoot: solid ground, the lagoon, a dock, or the void. */
    ground(x: number, z: number, spireOpen: boolean): 'ground' | 'water' | 'void' {
        for (const d of this.docks) {
            if (d.to === 'spire' && !spireOpen) continue;
            if (d.isle === 'spire' && !spireOpen) continue;
            const lx = x - (d.x - Math.sin(rad(d.yaw)) * 1.2);
            const lz = z - (d.z - Math.cos(rad(d.yaw)) * 1.2);
            const s = Math.sin(rad(d.yaw));
            const c = Math.cos(rad(d.yaw));
            const along = lx * s + lz * c;
            const across = lx * c - lz * s;
            if (along > -0.5 && along < 3.9 && Math.abs(across) < 1.05) return 'ground';
        }
        for (const d of Object.values(ISLES)) {
            if (Math.hypot(x - d.x, z - d.z) <= d.r - 0.4) {
                if (d.id === 'loopwater' && Math.hypot(x - this.lagoon.x, z - this.lagoon.z) < this.lagoon.r - 0.2) {
                    if (Math.hypot(x - this.islet.x, z - this.islet.z) < this.islet.r) return 'ground';
                    return 'water';
                }
                return 'ground';
            }
        }
        return 'void';
    }

    collide(x: number, z: number, r: number): [number, number] {
        for (const c of this.colliders) {
            const dx = x - c.x;
            const dz = z - c.z;
            const d = Math.hypot(dx, dz);
            const min = c.r + r;
            if (d < min && d > 0.0001) {
                x = c.x + (dx / d) * min;
                z = c.z + (dz / d) * min;
            }
        }
        return [x, z];
    }

    dockAt(x: number, z: number, radius = 2.6): DockRec | null {
        let best: DockRec | null = null;
        let bd = radius;
        for (const d of this.docks) {
            const dd = Math.hypot(x - d.x, z - d.z);
            if (dd < bd) {
                bd = dd;
                best = d;
            }
        }
        return best;
    }

    dock(from: IsleId, to: IsleId): DockRec | undefined {
        return this.docks.find((d) => d.isle === from && d.to === to);
    }

    // -----------------------------------------------------------------------------------------
    // per-frame + state sync

    update(dt: number, px: number, pz: number) {
        this.time += dt;
        for (const s of this.spinners) s.e.rotateLocal(0, 0, (s.speed || 0) * dt);
        for (const h of this.hearts.values()) {
            if (!h.enabled) continue;
            h.rotateLocal(0, 90 * dt, 0);
            const p = h.getLocalPosition();
            h.setLocalPosition(p.x, 1.6 + Math.sin(this.time * 2) * 0.15, p.z);
        }
        for (const [i, s] of this.smoke.entries()) {
            const p = s.getLocalPosition();
            const y = 5.6 + ((this.time * 0.6 + i * 1.1) % 3.3);
            s.setLocalPosition(p.x, y, p.z);
        }
        if (this.spireOrb)
            this.spireOrb.setLocalScale(
                1.2 + Math.sin(this.time * 2) * 0.12,
                1.2 + Math.sin(this.time * 2) * 0.12,
                1.2 + Math.sin(this.time * 2) * 0.12
            );
        for (const st of this.slabStones.values()) {
            if (st.enabled) st.rotateLocal(0, 30 * dt, 0);
        }
        if (this.rift?.enabled) this.rift.rotateLocal(0, 50 * dt, 0);
        for (const n of this.npcs.values()) {
            if (!n.visible) continue;
            animateRig(n.rig, dt, 0);
            const d = Math.hypot(px - n.x, pz - n.z);
            const target = d < 7 ? (Math.atan2(px - n.x, pz - n.z) * 180) / Math.PI : n.yaw;
            const cur = n.rig.root.getEulerAngles().y;
            const delta = ((((target - cur) % 360) + 540) % 360) - 180;
            n.rig.root.setEulerAngles(0, cur + delta * Math.min(1, dt * 4), 0);
        }
    }

    setNpcVisible(id: string, on: boolean) {
        const n = this.npcs.get(id);
        if (!n) return;
        n.visible = on;
        n.rig.root.enabled = on;
        const c = this.colliders.find((cc) => cc.x === n.x && cc.z === n.z);
        if (c) c.r = on ? 0.7 : 0;
    }

    refresh(s: GameState) {
        // paper-white forgotten things
        let paperKey = '';
        for (const [mem, list] of this.forgettables) {
            const off = mem === 'home' ? isForgotten(s, 'home') && !hasFlag(s, 'walked-home') : isForgotten(s, mem);
            for (const e of list) setPaper(e, off);
            paperKey += off ? '1' : '0';
        }
        // batched copies keep the old materials until their group is rebuilt
        if (paperKey !== this.paperKey) {
            this.paperKey = paperKey;
            for (const id of this.batchIds) this.app.batcher?.markGroupDirty(id);
        }
        // windmills turn once the Slab of Order is back
        this.spinners[0].speed = s.slabs.includes('order') ? 35 : 0;
        // slab stones show when the duel is won but the slab is unclaimed
        const duelFor: Record<IsleId, string> = {
            hearthpage: 'warden',
            forkwood: 'vesper',
            loopwater: 'overflow',
            lexicon: 'sable',
            forgehollow: 'brakk',
            spire: 'mirror'
        };
        for (const [isle, st] of this.slabStones) {
            const slab = ISLES[isle].slab;
            st.enabled = (s.duels.includes(duelFor[isle]) || hasFlag(s, `pact:${isle}`)) && !s.slabs.includes(slab);
        }
        for (const [isle, w] of this.inkwells) {
            const on =
                s.inkwells.includes(isle) &&
                !(isle === 'hearthpage' && isForgotten(s, 'home') && !hasFlag(s, 'walked-home'));
            w.glow.enabled = on;
        }
        for (const [id, h] of this.hearts) {
            const used = s.bondFlags.includes(`moment:${id}`);
            const blocked = id === 'hearthpage' && isForgotten(s, 'stars');
            h.enabled = !used && !blocked && s.prologueDone;
        }
        // who is where
        const race = (rival: string) => s.rivalHeld.includes(rival);
        this.setNpcVisible('warden', true);
        this.setNpcVisible('pix', s.prologueDone);
        this.setNpcVisible(
            'vesper',
            race('vesper') ||
                s.puzzles.includes('forkwood') ||
                s.duels.includes('vesper') ||
                hasFlag(s, 'pact:forkwood')
        );
        this.setNpcVisible(
            'brakk',
            race('brakk') ||
                s.puzzles.includes('forgehollow') ||
                s.duels.includes('brakk') ||
                hasFlag(s, 'pact:forgehollow')
        );
        this.setNpcVisible('overflow', s.puzzles.includes('loopwater') && !s.duels.includes('overflow'));
        this.setNpcVisible('sable', !(s.duels.includes('sable') && hasFlag(s, 'sable-left')));
        this.setNpcVisible('deadlock', !s.duels.includes('deadlock'));
        this.setNpcVisible('segfault', !s.duels.includes('segfault'));
        this.rift.enabled = !s.duels.includes('segfault');
        this.setNpcVisible('mirror', !s.duels.includes('mirror'));
        this.setNpcVisible('null', s.duels.includes('mirror') && !s.duels.includes('null'));
        const spireOpen = spireRouteOpen(s);
        for (const d of this.docks) {
            if (d.to === 'spire' || d.isle === 'spire') d.entity.enabled = spireOpen;
        }
    }
}

export function spireRouteOpen(s: GameState): boolean {
    return (['order', 'choice', 'echo', 'name', 'craft'] as const).every((x) => s.slabs.includes(x));
}
