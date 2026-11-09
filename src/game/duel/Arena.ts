// The 3D code-duel arena: a 5 × 3 grid floating high above Scriptoria.
import { Entity, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { sfx } from '../audio';
import { CAST } from '../cast';
import type { SpeakerId } from '../cast';
import { Tweens, ease } from '../tween';
import {
    animateRig,
    buildChibi,
    buildGolem,
    buildItsuki,
    buildLethe,
    group,
    mat,
    part,
    setStreak
} from '../world/models';
import type { Rig } from '../world/models';
import * as P from '../world/props';

import { COLS, ROWS } from './engine';
import type { Cell, SideOut, TickResult } from './engine';

export const ARENA = new Vec3(0, 150, -4);
const CW = 2.0;
const CD = 1.65;

export class Arena {
    root: Entity;
    tiles: Entity[][] = [];
    me: Rig;
    lethe: Rig;
    foe: Rig | null = null;
    foeScale = 1;
    platform: Entity | null = null;
    tw = new Tweens();
    speed = 1;
    onHit: ((who: 'me' | 'foe', dmg: number, pos: Vec3) => void) | null = null;

    constructor(app: AppBase) {
        this.root = new Entity('arena');
        this.root.setPosition(ARENA);
        app.root.addChild(this.root);
        for (let r = 0; r < ROWS; r++) {
            const row: Entity[] = [];
            for (let c = 0; c < COLS; c++) {
                const cell = group(this.root, `cell-${c}-${r}`, [this.cx(c), 0, this.cz(r)]);
                const fill = part(cell, 'box', {
                    color: '#1F3A52',
                    pos: [0, 0.03, 0],
                    scale: [CW - 0.18, 0.04, CD - 0.18],
                    unlit: true,
                    ei: 1
                });
                fill.name = 'fill';
                for (const [x, z, sx, sz] of [
                    [0, -(CD - 0.18) / 2, CW - 0.18, 0.05],
                    [0, (CD - 0.18) / 2, CW - 0.18, 0.05],
                    [-(CW - 0.18) / 2, 0, 0.05, CD - 0.18],
                    [(CW - 0.18) / 2, 0, 0.05, CD - 0.18]
                ]) {
                    part(cell, 'box', {
                        color: '#5ED6E8',
                        pos: [x, 0.06, z],
                        scale: [sx, 0.03, sz],
                        unlit: true,
                        ei: 0.7
                    });
                }
                row.push(cell);
            }
            this.tiles.push(row);
        }
        // floating stone ring under the grid
        part(this.root, 'cylinder', { color: '#2E2858', pos: [0, -0.35, 0], scale: [12.5, 0.6, 7.2], outline: 0.08 });
        part(this.root, 'cone', { color: '#211C3F', pos: [0, -2.6, 0], rot: [180, 0, 0], scale: [11, 4, 6.4] });
        part(this.root, 'torus', {
            color: '#5ED6E8',
            pos: [0, -0.02, 0],
            scale: [13.2, 0.3, 7.8],
            unlit: true,
            ei: 0.35
        });
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            part(this.root, 'sphere', {
                color: '#2B2452',
                pos: [Math.cos(a) * 11, -1 - (i % 3), Math.sin(a) * 7 - 3],
                scale: [1.4, 0.9, 1.2]
            });
        }
        P.slabStone(this.root, -7.4, -3.6, 25, false, 0.9);
        P.slabStone(this.root, 7.4, -3.6, -25, false, 0.9);
        this.me = buildItsuki();
        this.root.addChild(this.me.root);
        this.lethe = buildLethe();
        this.lethe.root.setLocalScale(0.7, 0.7, 0.7);
        this.root.addChild(this.lethe.root);
        this.root.enabled = false;
    }

    cx(c: number) {
        return (c - 2) * CW;
    }

    cz(r: number) {
        return (r - 1) * CD;
    }

    cellPos(c: Cell, y = 0.08): Vec3 {
        return new Vec3(this.cx(c.c), y, this.cz(c.r));
    }

    setup(foe: SpeakerId, streak: number, platformColor: string) {
        if (this.foe) this.foe.root.destroy();
        const s = CAST[foe];
        let rig: Rig;
        if (s.model === 'golem') rig = buildGolem(s.golem!.body, s.golem!.glow, 1.0);
        else if (s.model === 'mirror') {
            rig = buildItsuki(true);
            setStreak(rig, 3);
        } else rig = buildChibi(s.chibi!, foe);
        this.foeScale = foe === 'null' ? 1.3 : 1;
        rig.root.setLocalScale(this.foeScale, this.foeScale, this.foeScale);
        this.foe = rig;
        this.root.addChild(rig.root);
        setStreak(this.me, streak);
        if (this.platform) this.platform.destroy();
        this.platform = part(this.root, 'cylinder', {
            color: platformColor,
            pos: [0, -0.06, 0],
            scale: [11.6, 0.1, 6.4],
            shadow: false
        });
        this.tw.clear();
    }

    place(me: Cell, foe: Cell) {
        this.me.root.setLocalPosition(this.cellPos(me));
        this.me.root.setLocalEulerAngles(0, 90, 0);
        if (this.foe) {
            this.foe.root.setLocalPosition(this.cellPos(foe));
            this.foe.root.setLocalEulerAngles(0, -90, 0);
            this.foe.root.setLocalScale(this.foeScale, this.foeScale, this.foeScale);
        }
        this.lethe.root.setLocalPosition(this.cx(0) - 1.3, 1.5, this.cz(0) - 0.6);
        this.lethe.root.setLocalEulerAngles(0, 40, 0);
    }

    setTiles(me: Cell, foe: Cell, forbidden: Cell[]) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const fill = this.tiles[r][c].findByName('fill') as Entity;
                let color = '#1F3A52';
                if (forbidden.some((f) => f.c === c && f.r === r)) color = '#3E5A2A';
                if (me.c === c && me.r === r) color = '#2C8CA0';
                if (foe.c === c && foe.r === r) color = '#59607A';
                const mi = fill.render!.meshInstances[0];
                mi.material = matFor(color);
            }
        }
    }

    setOverflow(n: number) {
        if (!this.foe) return;
        const s = this.foeScale * (1 + n * 0.09);
        this.tw.add(0.25, (k) => {
            const cur = this.foe!.root.getLocalScale().x;
            const v = cur + (s - cur) * k;
            this.foe!.root.setLocalScale(v, v, v);
        });
    }

    cameraPose(): { pos: Vec3; target: Vec3 } {
        const pos = new Vec3(ARENA.x, ARENA.y + 8.2, ARENA.z + 11.2);
        const target = new Vec3(ARENA.x, ARENA.y - 2.5, ARENA.z + 0.2);
        return { pos, target };
    }

    update(dt: number) {
        this.tw.update(dt * this.speed);
        animateRig(this.me, dt, 0);
        animateRig(this.lethe, dt, 0);
        if (this.foe) animateRig(this.foe, dt, 0);
    }

    // -----------------------------------------------------------------------------------------
    // tick playback

    play(res: TickResult, forbidden: Cell[], done: () => void) {
        const me = this.me;
        const foe = this.foe!;
        const T = 0.32;
        this.slide(me, res.me, T);
        this.slide(foe, res.foe, T);
        if (res.me.act.startsWith('move') || res.foe.act.startsWith('move')) sfx.move();
        if (res.foe.act === 'blink') {
            sfx.glitch();
            this.tw.add(T, (k) => {
                const s = this.foeScale * Math.abs(1 - 2 * k);
                foe.root.setLocalScale(s, s, s);
            });
        }
        this.tw.wait(T * 0.9, () => {
            this.setTiles(res.me.to, res.foe.to, forbidden);
            this.action(me, res.me, res.foe, 'me');
            this.action(foe, res.foe, res.me, 'foe');
        });
        this.tw.wait(T + 0.38, () => {
            if (res.foe.dmg > 0) this.hurt(foe, res.foe.dmg, 'foe');
            if (res.me.dmg > 0) this.hurt(me, res.me.dmg, 'me');
            if (res.burst) this.burst();
        });
        this.tw.wait(T + 0.62, done);
    }

    private slide(rig: Rig, s: SideOut, dur: number) {
        if (s.from.c === s.to.c && s.from.r === s.to.r) {
            if (s.bumped) {
                const p0 = rig.root.getLocalPosition().clone();
                this.tw.add(dur, (k) => rig.root.setLocalPosition(p0.x, p0.y + Math.sin(k * Math.PI) * 0.25, p0.z));
            }
            return;
        }
        const a = this.cellPos(s.from);
        const b = this.cellPos(s.to);
        const fast = s.act === 'charge';
        this.tw.add(
            fast ? dur * 0.7 : dur,
            (k) => {
                const p = new Vec3().lerp(a, b, k);
                p.y += Math.sin(k * Math.PI) * (fast ? 0.1 : 0.35);
                rig.root.setLocalPosition(p);
            },
            { ease: fast ? ease.out : ease.inOut }
        );
    }

    private fx(name: string): Entity {
        const e = new Entity(name);
        this.root.addChild(e);
        return e;
    }

    private action(rig: Rig, s: SideOut, other: SideOut, who: 'me' | 'foe') {
        const at = this.cellPos(s.to);
        const tgt = this.cellPos(other.to);
        const dir = who === 'me' ? 1 : -1;
        switch (s.act) {
            case 'strike':
            case 'charge': {
                if (s.act === 'strike') sfx.strike();
                else sfx.charge();
                const p0 = rig.root.getLocalPosition().clone();
                this.tw.add(
                    0.3,
                    (k) => rig.root.setLocalPosition(p0.x + dir * Math.sin(k * Math.PI) * 0.5, p0.y, p0.z),
                    { ease: ease.linear }
                );
                if (!s.whiff) {
                    const e = this.fx('slash');
                    e.setLocalPosition(tgt.x - dir * 0.3, 1.0, tgt.z + 0.2);
                    part(e, 'box', {
                        color: s.crash ? '#A7F07A' : '#FFFFFF',
                        rot: [0, 0, 45],
                        scale: [0.08, 1.4, 0.08],
                        unlit: true
                    });
                    part(e, 'box', {
                        color: s.act === 'charge' ? '#FF9A4A' : '#8FF3FF',
                        rot: [0, 0, -45],
                        scale: [0.08, 1.2, 0.08],
                        unlit: true
                    });
                    this.tw.add(0.35, (k) => e.setLocalScale(1 + k, 1 + k, 1 + k), { done: () => e.destroy() });
                }
                break;
            }
            case 'bolt': {
                sfx.bolt();
                const e = this.fx('bolt');
                part(e, 'sphere', { color: '#8FF3FF', scale: 0.4 + (s.power - 1) * 0.15, unlit: true });
                part(e, 'sphere', { color: '#5ED6E8', scale: 0.8 + (s.power - 1) * 0.2, unlit: true, opacity: 0.35 });
                const from = new Vec3(at.x + dir * 0.5, 1.0, at.z);
                const endX =
                    s.hit || (other.act === 'guard' && other.to.r === s.from.r)
                        ? tgt.x - dir * 0.4
                        : this.cx(who === 'me' ? COLS - 1 : 0) + dir * 1.2;
                const to = new Vec3(endX, 1.0, this.cz(s.from.r));
                this.tw.add(0.32, (k) => e.setLocalPosition(new Vec3().lerp(from, to, k)), {
                    ease: ease.linear,
                    done: () => e.destroy()
                });
                break;
            }
            case 'guard': {
                sfx.guard();
                const e = this.fx('shield');
                e.setLocalPosition(at.x, 0.9, at.z);
                part(e, 'sphere', { color: '#5ED6E8', scale: 1.9, unlit: true, opacity: 0.28 });
                part(e, 'torus', { color: '#8FF3FF', rot: [0, 0, 90], scale: [1.6, 0.4, 1.6], unlit: true });
                this.tw.add(
                    0.5,
                    (k) =>
                        e.setLocalScale(
                            Math.sin(k * Math.PI) + 0.01,
                            Math.sin(k * Math.PI) + 0.01,
                            Math.sin(k * Math.PI) + 0.01
                        ),
                    {
                        ease: ease.linear,
                        done: () => e.destroy()
                    }
                );
                break;
            }
            case 'hellflare': {
                sfx.hellflare();
                const e = this.fx('flare');
                e.setLocalPosition(tgt.x, 0, tgt.z);
                for (let i = 0; i < 5; i++) {
                    const a = (i / 5) * Math.PI * 2;
                    part(e, 'cone', {
                        color: i % 2 ? '#FF7AB6' : '#FFB3D1',
                        pos: [Math.cos(a) * 0.4, 0.8, Math.sin(a) * 0.4],
                        scale: [0.5, 1.8, 0.5],
                        unlit: true
                    });
                }
                part(e, 'cone', { color: '#FFFFFF', pos: [0, 1.0, 0], scale: [0.5, 2.4, 0.5], unlit: true });
                this.tw.add(0.55, (k) => e.setLocalScale(0.3 + k, Math.sin(k * Math.PI) * 1.4 + 0.01, 0.3 + k), {
                    ease: ease.linear,
                    done: () => e.destroy()
                });
                break;
            }
            case 'focus': {
                sfx.focus();
                this.sparkles(at, '#8FF3FF');
                break;
            }
            case 'glitch':
            case 'blink':
            case 'chained': {
                if (s.act !== 'blink') sfx.glitch();
                const e = this.fx('glitch');
                e.setLocalPosition(at.x, 1.0, at.z);
                const col = s.act === 'chained' ? '#9AE6FF' : '#FF7AB6';
                for (let i = 0; i < 6; i++)
                    part(e, 'box', {
                        color: i % 2 ? col : '#A7F07A',
                        pos: [(Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.6, 0.4],
                        scale: [0.5, 0.1, 0.05],
                        unlit: true
                    });
                this.tw.add(0.5, (k) => e.setLocalPosition(at.x + Math.sin(k * 40) * 0.08, 1.0, at.z), {
                    ease: ease.linear,
                    done: () => e.destroy()
                });
                break;
            }
            case 'dizzy': {
                sfx.error();
                const e = this.fx('dizzy');
                e.setLocalPosition(at.x, 1.9, at.z);
                for (let i = 0; i < 3; i++)
                    part(e, 'sphere', {
                        color: '#FFD98A',
                        pos: [Math.cos(i * 2.1) * 0.5, 0, Math.sin(i * 2.1) * 0.5],
                        scale: 0.18,
                        unlit: true
                    });
                this.tw.add(0.6, (k) => e.setLocalEulerAngles(0, k * 360, 0), {
                    ease: ease.linear,
                    done: () => e.destroy()
                });
                break;
            }
            case 'sneeze':
            case 'fizzle': {
                if (s.act === 'sneeze') sfx.sneeze();
                else sfx.error();
                this.sparkles(new Vec3(at.x + dir * 0.6, at.y, at.z), '#F7F5FF');
                break;
            }
            case 'key':
                sfx.success();
                this.sparkles(at, '#9AE6FF');
                break;
            default:
                break;
        }
    }

    private sparkles(at: Vec3, color: string) {
        const e = this.fx('sparkle');
        e.setLocalPosition(at.x, 0.4, at.z);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            part(e, 'sphere', {
                color,
                pos: [Math.cos(a) * 0.5, i * 0.12, Math.sin(a) * 0.5],
                scale: 0.14,
                unlit: true
            });
        }
        this.tw.add(
            0.6,
            (k) => {
                e.setLocalPosition(at.x, 0.4 + k * 1.4, at.z);
                e.setLocalEulerAngles(0, k * 200, 0);
            },
            { ease: ease.out, done: () => e.destroy() }
        );
    }

    private hurt(rig: Rig, dmg: number, who: 'me' | 'foe') {
        sfx.hit();
        const p0 = rig.root.getLocalPosition().clone();
        this.tw.add(
            0.3,
            (k) =>
                rig.root.setLocalPosition(
                    p0.x + Math.sin(k * 30) * 0.08 * (1 - k),
                    p0.y + Math.sin(k * Math.PI) * 0.2,
                    p0.z
                ),
            { ease: ease.linear }
        );
        const wp = rig.root.getPosition().clone();
        wp.y += 2.2;
        this.onHit?.(who, dmg, wp);
    }

    private burst() {
        const e = this.fx('burst');
        const at = this.foe!.root.getLocalPosition();
        e.setLocalPosition(at.x, 1, at.z);
        part(e, 'sphere', { color: '#FF9D5C', scale: 1, unlit: true, opacity: 0.5 });
        this.tw.add(0.5, (k) => e.setLocalScale(1 + k * 6, 1 + k * 6, 1 + k * 6), {
            ease: ease.out,
            done: () => e.destroy()
        });
        this.setOverflow(0);
    }

    show(on: boolean) {
        this.root.enabled = on;
    }
}

const tileMats = new Map<string, ReturnType<typeof mat>>();
function matFor(color: string) {
    let m = tileMats.get(color);
    if (!m) {
        m = mat(color, { unlit: true, ei: 1 });
        tileMats.set(color, m);
    }
    return m;
}
