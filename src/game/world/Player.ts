// Itsuki in the overworld: camera-relative movement, jump, glide on Lethe's wings, swimming.
// A small kinematic controller: the isles are flat discs, so no physics engine is needed.
import { Vec3 } from 'playcanvas';
import type { Entity } from 'playcanvas';

import { sfx } from '../audio';
import type { Input } from '../input';

import { hasModel, instantiate } from './assets';
import { animateRig, buildItsuki, buildLethe, part, setStreak } from './models';
import type { Rig } from './models';
import type { World } from './World';

const WALK = 6.2;
const SPRINT = 9.6;
const SWIM = 3.4;
const JUMP = 7.6;
const GRAVITY = 21;
const RADIUS = 0.45;

export interface MoveRules {
    canSwim: boolean;
    glideBonus: number; // 1 or 1.3
    spireOpen: boolean;
}

export class Player {
    rig: Rig;
    lethe: Rig;
    wings: Entity;
    pos = new Vec3();
    vy = 0;
    yaw = 0;
    grounded = true;
    gliding = false;
    swimming = false;
    speed = 0;
    lastSafe = new Vec3();
    camYaw = 180;
    camPitch = 26;
    camDist = 11;
    private camPos = new Vec3();
    private letheP = new Vec3();
    onFall: (() => void) | null = null;
    onSwimBlocked: (() => void) | null = null;
    private blockedCooldown = 0;

    constructor(parent: Entity) {
        this.rig = buildItsuki();
        parent.addChild(this.rig.root);
        this.lethe = buildLethe();
        this.lethe.root.setLocalScale(0.62, 0.62, 0.62);
        parent.addChild(this.lethe.root);
        // glide wings on Itsuki's back, shown only while gliding: folded paper inked by Lethe
        if (hasModel('glider')) {
            this.wings = instantiate('glider');
            this.wings.setLocalPosition(0, 1.12 - this.rig.bodyY, -0.1);
            this.rig.body.addChild(this.wings);
        } else {
            this.wings = part(this.rig.body, 'sphere', {
                color: '#FF7AB6',
                pos: [0, 0.15, -0.3],
                scale: [1.9, 0.5, 0.14],
                unlit: true,
                opacity: 0.75
            });
        }
        this.wings.enabled = false;
    }

    setStreak(level: number) {
        setStreak(this.rig, level);
    }

    place(x: number, z: number, yaw = 180) {
        this.pos.set(x, 0, z);
        this.vy = 0;
        this.grounded = true;
        this.gliding = false;
        this.yaw = yaw;
        this.camYaw = yaw + 180;
        this.lastSafe.copy(this.pos);
        this.letheP.set(x + 1, 1.6, z + 1);
        this.sync();
        this.snapCamera();
    }

    private snapCamera() {
        this.camPos.copy(this.desiredCam());
    }

    private desiredCam(): Vec3 {
        const yr = (this.camYaw * Math.PI) / 180;
        const pr = (this.camPitch * Math.PI) / 180;
        const target = this.camTarget();
        return new Vec3(
            target.x + Math.sin(yr) * Math.cos(pr) * this.camDist,
            target.y + Math.sin(pr) * this.camDist,
            target.z + Math.cos(yr) * Math.cos(pr) * this.camDist
        );
    }

    camTarget(): Vec3 {
        return new Vec3(this.pos.x, Math.max(-6, this.pos.y) + 1.3, this.pos.z);
    }

    cameraPose(): { pos: Vec3; target: Vec3 } {
        return { pos: this.camPos.clone(), target: this.camTarget() };
    }

    update(dt: number, input: Input, world: World, rules: MoveRules, allowMove: boolean) {
        // camera orbit
        this.camYaw -= input.dragX * 0.3;
        this.camPitch = Math.min(62, Math.max(8, this.camPitch + input.dragY * 0.2));
        this.camDist = Math.min(20, Math.max(5, this.camDist + input.wheel * 0.9));
        if (allowMove) {
            if (input.down('KeyQ')) this.camYaw += 90 * dt;
            if (input.down('KeyR')) this.camYaw -= 90 * dt;
        }

        // desired direction, relative to the camera
        let ix = 0;
        let iz = 0;
        if (allowMove) {
            if (input.down('KeyW', 'ArrowUp')) iz -= 1;
            if (input.down('KeyS', 'ArrowDown')) iz += 1;
            if (input.down('KeyA', 'ArrowLeft')) ix -= 1;
            if (input.down('KeyD', 'ArrowRight')) ix += 1;
        }
        const len = Math.hypot(ix, iz);
        const yr = (this.camYaw * Math.PI) / 180;
        let mx = 0;
        let mz = 0;
        if (len > 0) {
            ix /= len;
            iz /= len;
            // camera forward is (-sin, -cos); right is (cos, -sin)
            mx = ix * Math.cos(yr) + iz * Math.sin(yr);
            mz = -ix * Math.sin(yr) + iz * Math.cos(yr);
        }
        let spd = input.down('ShiftLeft', 'ShiftRight') ? SPRINT : WALK;
        if (this.swimming) spd = SWIM;
        if (this.gliding) spd = WALK * 1.25 * rules.glideBonus;
        const vx = mx * spd;
        const vz = mz * spd;
        this.speed = len > 0 ? spd / SPRINT : 0;
        if (len > 0) {
            const target = (Math.atan2(mx, mz) * 180) / Math.PI;
            const delta = ((((target - this.yaw) % 360) + 540) % 360) - 180;
            this.yaw += delta * Math.min(1, dt * 12);
        }

        // jump
        if (allowMove && input.hit('Space') && (this.grounded || this.swimming)) {
            this.vy = this.swimming ? JUMP * 0.7 : JUMP;
            this.grounded = false;
            this.swimming = false;
            sfx.click();
        }

        // horizontal move with edge / water / prop checks
        const ox = this.pos.x;
        const oz = this.pos.z;
        let nx = ox + vx * dt;
        let nz = oz + vz * dt;
        if (this.pos.y > -0.6 && this.pos.y < 2.6) [nx, nz] = world.collide(nx, nz, RADIUS);
        const here = world.ground(ox, oz, rules.spireOpen);
        let there = world.ground(nx, nz, rules.spireOpen);
        if (this.grounded || this.swimming) {
            // isle edges are walls while you're on the ground: jump to leave them
            if (there === 'void') {
                // slide along the edge: try each axis
                if (world.ground(nx, oz, rules.spireOpen) !== 'void') nz = oz;
                else if (world.ground(ox, nz, rules.spireOpen) !== 'void') nx = ox;
                else {
                    nx = ox;
                    nz = oz;
                }
                there = world.ground(nx, nz, rules.spireOpen);
            }
            if (there === 'water' && here !== 'water' && !rules.canSwim) {
                nx = ox;
                nz = oz;
                there = here;
                if (this.blockedCooldown <= 0) {
                    this.onSwimBlocked?.();
                    this.blockedCooldown = 4;
                }
            }
        } else if (this.pos.y < -0.4 && there !== 'void' && here === 'void') {
            // below the rim: the isle's rock is a wall
            nx = ox;
            nz = oz;
            there = here;
        }
        this.blockedCooldown -= dt;
        this.pos.x = nx;
        this.pos.z = nz;

        // vertical
        const floor = there === 'ground' ? 0 : there === 'water' ? -0.55 : -Infinity;
        if (this.grounded || this.swimming) {
            if (floor === -Infinity || floor < this.pos.y - 0.01) {
                this.grounded = false;
                this.swimming = false;
                this.vy = 0;
            } else {
                this.pos.y = floor;
                this.grounded = there === 'ground';
                this.swimming = there === 'water';
            }
        }
        this.gliding = false;
        if (!this.grounded && !this.swimming) {
            this.vy -= GRAVITY * dt;
            this.gliding = allowMove && input.down('Space') && this.vy < 0 && this.pos.y > -12;
            if (this.gliding) this.vy = Math.max(this.vy, -2.4 / rules.glideBonus);
            this.pos.y += this.vy * dt;
            if (this.vy <= 0 && this.pos.y <= floor && this.pos.y > floor - 1.2) {
                if (there === 'water') {
                    sfx.splash();
                    if (!rules.canSwim) {
                        this.respawn();
                        this.onSwimBlocked?.();
                        return;
                    }
                }
                this.pos.y = floor;
                this.vy = 0;
                this.grounded = there === 'ground';
                this.swimming = there === 'water';
            }
        }
        this.wings.enabled = this.gliding;
        if (this.grounded && there === 'ground') this.lastSafe.set(this.pos.x, 0, this.pos.z);
        if (this.pos.y < -26) {
            this.respawn();
            this.onFall?.();
        }
        this.sync();
        animateRig(this.rig, dt, this.grounded ? this.speed : 0);

        this.follow(dt);
    }

    /** Lethe at Itsuki's shoulder, and the smoothed follow camera. */
    private follow(dt: number) {
        const side = ((this.yaw + 125) * Math.PI) / 180;
        const tx = this.pos.x + Math.sin(side) * 1.3;
        const tz = this.pos.z + Math.cos(side) * 1.3;
        const ty = this.pos.y + 1.55 + Math.sin(performance.now() / 600) * 0.12;
        const k = Math.min(1, dt * 4);
        this.letheP.set(
            this.letheP.x + (tx - this.letheP.x) * k,
            this.letheP.y + (ty - this.letheP.y) * k,
            this.letheP.z + (tz - this.letheP.z) * k
        );
        this.lethe.root.setPosition(this.letheP);
        this.lethe.root.setEulerAngles(0, this.yaw, 0);
        animateRig(this.lethe, dt, 0);
        const want = this.desiredCam();
        this.camPos.lerp(this.camPos, want, Math.min(1, dt * 6));
    }

    /** Ride along on something (the paper boat): no physics, the camera swings behind. */
    ride(x: number, y: number, z: number, yaw: number, dt: number) {
        this.pos.set(x, y, z);
        this.yaw = yaw;
        this.wings.enabled = false;
        const want = yaw + 180;
        const delta = ((((want - this.camYaw) % 360) + 540) % 360) - 180;
        this.camYaw += delta * Math.min(1, dt * 1.5);
        this.sync();
        animateRig(this.rig, dt, 0);
        this.follow(dt);
    }

    respawn() {
        this.pos.copy(this.lastSafe);
        this.vy = 0;
        this.grounded = true;
        this.swimming = false;
        this.gliding = false;
        this.sync();
        this.snapCamera();
    }

    sync() {
        this.rig.root.setPosition(this.pos.x, this.pos.y, this.pos.z);
        this.rig.root.setEulerAngles(0, this.yaw, 0);
    }

    setVisible(on: boolean) {
        this.rig.root.enabled = on;
        this.lethe.root.enabled = on;
    }

    /** Face a point (for conversations). */
    face(x: number, z: number) {
        this.yaw = (Math.atan2(x - this.pos.x, z - this.pos.z) * 180) / Math.PI;
        this.sync();
    }
}
