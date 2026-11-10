// TABULA: the single owner of game state, modes, camera and the story flow.
import { CameraFrame, Color, Entity, FOG_LINEAR, SHADOW_PCF5_32F, TONEMAP_NEUTRAL, Vec3 } from 'playcanvas';
import type { AppBase } from 'playcanvas';

import { playMelody, setSound, sfx } from './audio';
import { CAST } from './cast';
import type { SpeakerId } from './cast';
import { ISLES, MEMORIES, RACES, ROUTES, SLABS } from './data';
import type { IsleId, SlabId } from './data';
import { Arena } from './duel/Arena';
import { DuelScreen } from './duel/DuelScreen';
import { OPPONENTS } from './duel/opponents';
import type { OppId } from './duel/opponents';
import { Input } from './input';
import {
    addBond,
    canSwim,
    clearSave,
    forgottenCount,
    hasFlag,
    hasSave,
    isForgotten,
    keptCount,
    loadGame,
    newState,
    payable,
    saveGame,
    setFlag,
    streakLevel
} from './state';
import type { GameState } from './state';
import { Dialog } from './ui/Dialog';
import type { ChoiceOpt, DLine } from './ui/Dialog';
import { Stage } from './ui/dom';
import { Hud } from './ui/Hud';
import { Ledger } from './ui/Ledger';
import type { LedgerMode } from './ui/Ledger';
import { MapScreen } from './ui/MapScreen';
import { Puzzles } from './ui/Puzzles';
import { Screens } from './ui/Screens';
import { setBatchGroup } from './world/models';
import { Player } from './world/Player';
import type { MoveRules } from './world/Player';
import * as P from './world/props';
import { Sky } from './world/sky';
import { setToonLighting } from './world/toon';
import { World, spireRouteOpen } from './world/World';

type Mode = 'title' | 'explore' | 'busy' | 'duel' | 'sail';

interface Inter {
    id: string;
    x: number;
    z: number;
    r: number;
    label: () => string | null;
    run: () => Promise<void>;
}

const PLATFORM: Record<IsleId, string> = {
    hearthpage: '#86B957',
    forkwood: '#5E9F55',
    loopwater: '#5BBCD2',
    lexicon: '#E6BE72',
    forgehollow: '#B86C50',
    spire: '#A699DC'
};

const DUEL_ISLE: Record<OppId, IsleId> = {
    warden: 'hearthpage',
    vesper: 'forkwood',
    segfault: 'forkwood',
    overflow: 'loopwater',
    sable: 'lexicon',
    deadlock: 'lexicon',
    brakk: 'forgehollow',
    mirror: 'spire',
    null: 'spire'
};

const GENERALS: OppId[] = ['overflow', 'deadlock', 'segfault'];

export class Game {
    private camera: Entity;
    private sky: Sky;
    private stage: Stage;
    private hud: Hud;
    private dialog: Dialog;
    private ledger: Ledger;
    private map: MapScreen;
    private screens: Screens;
    private puzzles: Puzzles;
    private world: World;
    private player: Player;
    private arena: Arena;
    private boat: Entity;
    private input: Input;
    private s: GameState = newState();
    private mode: Mode = 'title';
    private duel: DuelScreen | null = null;
    private inters: Inter[] = [];
    private current: Inter | null = null;
    private saveTimer = 0;
    private hudTimer = 0;
    private titleT = 0;
    private skyDt = 0;
    /** conversation camera: the shot on the current speaker, and how far we have eased into it */
    private talkCam: { pos: Vec3; target: Vec3 } | null = null;
    private talkPartner: Vec3 | null = null;
    private talkBlend = 0;
    private isle: IsleId = 'hearthpage';
    private sail: { t: number; dur: number; p0: Vec3; p1: Vec3; p2: Vec3; done: () => void } | null = null;
    private wrongArches = 0;
    private fade: HTMLDivElement;

    constructor(app: AppBase, canvas: HTMLCanvasElement) {
        const scene = app.scene;
        // A bright anime afternoon: the sun is white at intensity 1 and the ambient black, because
        // the toon combine chunk (world/toon.ts) paints the lit and shadow colours itself.
        scene.ambientLight = new Color(0, 0, 0);
        // aerial perspective: distant isles melt into the horizon haze
        scene.fog.type = FOG_LINEAR;
        scene.fog.color = new Color().fromString('#CDE6F6');
        scene.fog.start = 55;
        scene.fog.end = 330;

        this.camera = new Entity('camera');
        this.camera.addComponent('camera', {
            clearColor: new Color().fromString('#CDEBFA'),
            fov: 50,
            nearClip: 0.1,
            farClip: 900
        });
        app.root.addChild(this.camera);

        const sun = new Entity('sun');
        sun.addComponent('light', {
            type: 'directional',
            color: new Color(1, 1, 1),
            intensity: 1,
            castShadows: true,
            shadowType: SHADOW_PCF5_32F,
            shadowDistance: 70,
            shadowResolution: 2048,
            shadowBias: 0.3,
            normalOffsetBias: 0.06
        });
        sun.setEulerAngles(48, 35, 0);
        app.root.addChild(sun);
        // the light shines along its local -Y; the shaders want the direction toward the sun
        const toSun = sun.up.clone();
        setToonLighting(app.graphicsDevice, '#FFF8EE', '#9AA0D8', toSun);
        this.sky = new Sky(app.root, toSun);

        // post: HDR with MSAA for crisp outlines, a soft bloom on glows and the sun, a gentle grade
        const frame = new CameraFrame(app, this.camera.camera!);
        frame.rendering.samples = 4;
        frame.rendering.toneMapping = TONEMAP_NEUTRAL;
        frame.rendering.sharpness = 0.25;
        frame.bloom.intensity = 0.022;
        frame.bloom.blurLevel = 7;
        frame.bloom.threshold = 0.85;
        frame.grading.enabled = true;
        frame.grading.saturation = 1.04;
        frame.grading.contrast = 1.04;
        frame.grading.brightness = 1.03;
        frame.vignette.intensity = 0.22;
        frame.vignette.inner = 0.55;
        frame.vignette.outer = 1.25;
        frame.vignette.curvature = 0.6;
        frame.update();
        app.on('destroy', () => frame.destroy());

        this.world = new World(app);
        this.player = new Player(app.root);
        if (app.batcher) {
            setBatchGroup(this.player.rig.root, app.batcher.addGroup('itsuki', true, 10).id);
            setBatchGroup(this.player.lethe.root, app.batcher.addGroup('lethe', true, 10).id);
        }
        this.arena = new Arena(app);
        this.boat = P.paperBoat(app.root);
        this.boat.enabled = false;

        this.stage = new Stage();
        this.hud = new Hud(this.stage);
        this.dialog = new Dialog(this.stage);
        this.dialog.onSpeak = (who) => this.talkFocus(who);
        this.puzzles = new Puzzles(this.stage);
        this.map = new MapScreen(this.stage);
        this.ledger = new Ledger(this.stage);
        this.screens = new Screens(this.stage);
        this.fade = document.createElement('div');
        this.fade.className = 'fade';
        document.body.append(this.fade);
        this.hud.show(false);

        this.input = new Input(canvas);
        this.input.onKey = (e) => this.onKey(e);
        this.player.onFall = () =>
            this.hud.toast('Lethe catches you by the collar — “Careful! The Blank is right down there!”', 'pink');
        this.player.onSwimBlocked = () =>
            this.hud.toast("The water's too deep… you don't remember how to swim. Old Wade could teach you.", 'cyan');

        this.buildInteractables();
        const saved = loadGame();
        if (saved) setSound(saved.sound);
        this.world.refresh(this.s);
        const sp = this.world.anchors.get('spawn')!;
        this.player.place(sp.x, sp.z);
        this.showTitle();

        app.on('update', (dt: number) => this.update(dt));
    }

    // =========================================================================================
    // core loop

    private rules(): MoveRules {
        return {
            canSwim: canSwim(this.s),
            glideBonus: isForgotten(this.s, 'heights') ? 1.3 : 1,
            spireOpen: spireRouteOpen(this.s)
        };
    }

    private update(dt: number) {
        const s = this.s;
        this.skyDt += dt;
        switch (this.mode) {
            case 'title': {
                this.titleT += dt;
                const a = this.titleT * 0.05;
                this.setCamera(new Vec3(Math.sin(a) * 92, 42, 12 + Math.cos(a) * 92), new Vec3(0, -4, 10));
                this.world.update(dt, 9999, 9999);
                break;
            }
            case 'explore':
            case 'busy': {
                const exploring = this.mode === 'explore';
                this.player.update(dt, this.input, this.world, this.rules(), exploring);
                this.world.update(dt, this.player.pos.x, this.player.pos.z);
                this.followCamera(dt);
                if (exploring) this.exploreTick(dt);
                break;
            }
            case 'sail': {
                this.sailTick(dt);
                this.world.update(dt, this.player.pos.x, this.player.pos.z);
                const cam = this.player.cameraPose();
                this.setCamera(cam.pos, cam.target);
                break;
            }
            case 'duel': {
                this.arena.update(dt);
                const p = this.arena.cameraPose();
                this.setCamera(p.pos, p.target);
                break;
            }
        }
        this.hudTimer -= dt;
        if (
            this.hudTimer <= 0 &&
            s.prologueDone &&
            (this.mode === 'explore' || this.mode === 'busy' || this.mode === 'sail')
        ) {
            this.hudTimer = 0.25;
            this.hud.render(s, this.isle, this.objective());
        }
        this.input.endFrame();
    }

    /** The follow camera, eased into a close shot of whoever is speaking during conversations. */
    private followCamera(dt: number) {
        const cam = this.player.cameraPose();
        this.talkBlend = Math.min(1, Math.max(0, this.talkBlend + (this.talkCam ? dt * 2.2 : -dt * 2.2)));
        if (this.talkBlend <= 0 || !this.lastTalk) {
            this.setCamera(cam.pos, cam.target);
            return;
        }
        const k = this.talkBlend * this.talkBlend * (3 - 2 * this.talkBlend);
        const t = this.lastTalk;
        this.setCamera(new Vec3().lerp(cam.pos, t.pos, k), new Vec3().lerp(cam.target, t.target, k));
    }

    private lastTalk: { pos: Vec3; target: Vec3 } | null = null;

    /** Where a rig's face is, and how big the rig is. */
    private headOf(rig: { head: Entity; root: Entity }): { head: Vec3; scale: number } {
        const scale = rig.root.getLocalScale().x;
        return {
            head: rig.head
                .getPosition()
                .clone()
                .add(new Vec3(0, 0.1 * scale, 0)),
            scale
        };
    }

    private speakerHead(who: SpeakerId): { head: Vec3; scale: number } | null {
        if (who === 'itsuki') return this.headOf(this.player.rig);
        if (who === 'lethe') return this.headOf(this.player.lethe);
        let best: { head: Vec3; scale: number } | null = null;
        let bd = 14;
        for (const n of this.world.npcs.values()) {
            if (!n.visible || n.speaker !== who) continue;
            const d = Math.hypot(n.x - this.player.pos.x, n.z - this.player.pos.z);
            if (d < bd) {
                bd = d;
                best = this.headOf(n.rig);
            }
        }
        return best;
    }

    /** Frame the speaker over the listener's shoulder, chest up, as anime RPGs stage dialogue. */
    private talkFocus(who: SpeakerId | null) {
        if (!who || who === 'narrator' || who === 'sign' || (this.mode !== 'busy' && this.mode !== 'explore')) {
            this.talkCam = null;
            if (!who) this.talkPartner = null;
            return;
        }
        const sp = this.speakerHead(who);
        if (!sp) {
            this.talkCam = null;
            return;
        }
        const me = this.headOf(this.player.rig).head;
        let other: Vec3;
        if (who === 'itsuki') other = this.talkPartner ?? this.headOf(this.player.lethe).head;
        else {
            other = me;
            if (who !== 'lethe') {
                this.talkPartner = sp.head.clone();
                this.player.face(sp.head.x, sp.head.z);
            }
        }
        const d = new Vec3(other.x - sp.head.x, 0, other.z - sp.head.z);
        if (d.length() < 0.3)
            d.set(Math.sin((this.player.yaw * Math.PI) / 180), 0, Math.cos((this.player.yaw * Math.PI) / 180));
        d.normalize();
        const side = new Vec3(d.z, 0, -d.x);
        const s = Math.max(0.62, sp.scale);
        // chest-up: about a metre of the speaker fills the frame, eyes in the upper third
        const pos = sp.head
            .clone()
            .add(d.clone().mulScalar(1.05 * s + 0.2))
            .add(side.clone().mulScalar(0.3 * s))
            .add(new Vec3(0, 0.02 * s, 0));
        const target = sp.head
            .clone()
            .add(new Vec3(0, -0.16 * s, 0))
            .add(side.clone().mulScalar(0.1 * s));
        this.talkCam = { pos, target };
        this.lastTalk = this.talkCam;
    }

    private setCamera(pos: Vec3, target: Vec3) {
        this.camera.setPosition(pos);
        this.camera.lookAt(target);
        this.sky.update(this.skyDt, pos);
        this.skyDt = 0;
    }

    private exploreTick(dt: number) {
        const s = this.s;
        const px = this.player.pos.x;
        const pz = this.player.pos.z;
        // which isle are we on?
        const isle = this.world.isleAt(px, pz);
        if (isle && isle !== this.isle && this.player.grounded) {
            this.isle = isle;
            s.isle = isle;
            this.onArrive(isle);
        }
        // the race clock
        if (hasFlag(s, 'race-started')) {
            s.worldTime += dt;
            this.checkRace();
        }
        // Forkwood: walking through an arch
        if (this.isle === 'forkwood' && !s.puzzles.includes('forkwood') && this.player.grounded) {
            const lx = px - ISLES.forkwood.x;
            if (lx < -2.9) {
                void this.busy(() => this.archChosen(pz - ISLES.forkwood.z));
                return;
            }
        }
        // interaction
        this.current = this.nearest();
        this.hud.setPrompt(this.current ? this.current.label() : null);
        if (this.current && this.input.hit('KeyE')) {
            const it = this.current;
            void this.busy(() => it.run());
        }
        this.saveTimer -= dt;
        if (this.saveTimer <= 0) {
            this.saveTimer = 8;
            this.save();
        }
    }

    private nearest(): Inter | null {
        let best: Inter | null = null;
        let bd = Infinity;
        const px = this.player.pos.x;
        const pz = this.player.pos.z;
        for (const it of this.inters) {
            const d = Math.hypot(px - it.x, pz - it.z);
            if (d > it.r || d >= bd) continue;
            if (!it.label()) continue;
            best = it;
            bd = d;
        }
        // docks
        const dock = this.world.dockAt(px, pz, 2.4);
        if (dock && (!best || Math.hypot(px - dock.x, pz - dock.z) < bd)) {
            const open = dock.to !== 'spire' || spireRouteOpen(this.s);
            if (open) {
                const to = dock.to;
                const label = `Sail the paper boat to ${to === 'hearthpage' && !this.homeKnown() ? '…somewhere familiar' : ISLES[to].name}`;
                return {
                    id: `dock:${dock.isle}:${to}`,
                    x: dock.x,
                    z: dock.z,
                    r: 2.4,
                    label: () => label,
                    run: () => this.sailTo(dock.isle, to)
                };
            }
        }
        return best;
    }

    private homeKnown() {
        return !isForgotten(this.s, 'home') || hasFlag(this.s, 'walked-home');
    }

    private onKey(e: KeyboardEvent) {
        if (this.screens.handleKey(e)) return;
        if (this.ledger.handleKey(e)) return;
        if (this.map.handleKey(e)) return;
        if (this.puzzles.handleKey(e)) return;
        if (this.dialog.handleKey(e)) return;
        if (this.mode === 'duel') {
            if (this.duel?.handleKey(e)) e.preventDefault();
            return;
        }
        if (this.mode !== 'explore') return;
        if (e.code === 'KeyM') void this.busy(() => this.openMap(false));
        else if (e.code === 'KeyL')
            void this.busy(async () => {
                await this.openLedger('browse');
            });
        else if (e.code === 'Escape' || e.code === 'KeyP') void this.busy(() => this.pause());
    }

    /** Run a modal sequence: the player stops, time stops, the HUD prompt hides. */
    private async busy(fn: () => Promise<void>) {
        if (this.mode !== 'explore') return;
        this.mode = 'busy';
        this.hud.setPrompt(null);
        try {
            await fn();
        } catch (err) {
            console.error(err);
        } finally {
            if (this.mode === 'busy') this.mode = 'explore';
            this.input.clear();
            this.refresh();
            this.save();
        }
    }

    private refresh() {
        this.world.refresh(this.s);
        this.player.setStreak(streakLevel(this.s));
        this.dialog.streak = streakLevel(this.s);
    }

    private save() {
        const s = this.s;
        if (!s.prologueDone) return;
        if (this.player.grounded) s.pos = [this.player.pos.x, this.player.pos.z];
        s.isle = this.isle;
        saveGame(s);
    }

    // =========================================================================================
    // title, new game, continue

    private showTitle() {
        this.mode = 'title';
        this.hud.show(false);
        this.player.setVisible(false);
        this.screens.title(hasSave(), loadGame()?.sound ?? true, {
            newGame: () => this.newGame(),
            cont: () => this.continueGame(),
            sound: () => {
                const sv = loadGame();
                const on = !(sv?.sound ?? true);
                setSound(on);
                if (sv) {
                    sv.sound = on;
                    saveGame(sv);
                }
                this.showTitle();
            }
        });
    }

    private newGame() {
        const sound = loadGame()?.sound ?? true;
        clearSave();
        this.s = newState();
        this.s.sound = sound;
        this.screens.close();
        this.enterWorld();
        void this.busy(() => this.prologue());
    }

    private continueGame() {
        const sv = loadGame();
        if (!sv) return this.newGame();
        this.s = sv;
        setSound(sv.sound);
        this.screens.close();
        this.enterWorld();
        if (!this.s.prologueDone) void this.busy(() => this.prologue());
        else if (this.s.devilInk < 0) void this.busy(() => this.payDebt());
    }

    private enterWorld() {
        const s = this.s;
        this.player.setVisible(true);
        this.refresh();
        const [x, z] = s.pos;
        if (s.prologueDone && this.world.ground(x, z, spireRouteOpen(s)) === 'ground') this.player.place(x, z);
        else {
            const sp = this.world.anchors.get('spawn')!;
            this.player.place(sp.x, sp.z);
        }
        this.isle = this.world.isleAt(this.player.pos.x, this.player.pos.z) ?? 'hearthpage';
        this.mode = 'explore';
        this.hud.show(s.prologueDone);
        this.hud.banner(this.isle);
        this.hudTimer = 0;
    }

    // =========================================================================================
    // shared helpers

    private say(...lines: DLine[]) {
        return this.dialog.say(lines);
    }

    private ask(who: SpeakerId, text: string, opts: (string | ChoiceOpt)[]) {
        return this.dialog.choose(
            who,
            text,
            opts.map((o) => (typeof o === 'string' ? { label: o } : o))
        );
    }

    private faceNpc(id: string) {
        const n = this.world.npcs.get(id);
        if (n) this.player.face(n.x, n.z);
    }

    private toast(t: string, kind: 'info' | 'pink' | 'cyan' = 'info') {
        this.hud.toast(t, kind);
    }

    private async openMap(travel: boolean) {
        const to = await this.map.open(
            this.s,
            this.isle,
            this.player.pos.x,
            this.player.pos.z,
            travel,
            spireRouteOpen(this.s)
        );
        if (to && travel) await this.inkTravel(to);
    }

    private async openLedger(mode: LedgerMode, rival = '') {
        const r = await this.ledger.open(this.s, mode, () => this.refresh(), rival);
        return r.picked;
    }

    private async pause() {
        await new Promise<void>((res) => {
            const render = () =>
                this.screens.pause(this.s.sound, {
                    resume: () => (this.screens.close(), res()),
                    map: () => {
                        this.screens.close();
                        void this.openMap(false).then(res);
                    },
                    ledger: () => {
                        this.screens.close();
                        void this.openLedger('browse').then(() => res());
                    },
                    sound: () => {
                        this.s.sound = !this.s.sound;
                        setSound(this.s.sound);
                        render();
                    },
                    title: () => {
                        this.save();
                        this.screens.close();
                        res();
                        this.mode = 'title';
                        this.showTitle();
                    },
                    reset: () => {
                        clearSave();
                        this.s = newState();
                        this.screens.close();
                        res();
                        this.mode = 'title';
                        this.showTitle();
                    }
                });
            render();
        });
    }

    private fadeOut(): Promise<void> {
        this.fade.classList.add('on');
        return new Promise((res) => setTimeout(res, 420));
    }

    private fadeIn() {
        this.fade.classList.remove('on');
    }

    /** Pay off Devil Ink debt with memories (the contract). */
    private async payDebt() {
        const s = this.s;
        if (s.devilInk >= 0) return;
        const before = s.given.length;
        await this.say(
            ['lethe', `Ahem~ The contract, Itsuki. You owe me ${-s.devilInk} Devil Ink, and you're all out.`],
            ['lethe', "So… I'll take a memory instead. You choose which. I'm not a monster."]
        );
        while (s.devilInk < 0 && payable(s).length) await this.openLedger('payment');
        this.refresh();
        const eaten = s.given.slice(before);
        if (eaten.length) await this.afterEaten(eaten);
    }

    private async afterEaten(ids: string[]) {
        const s = this.s;
        const lines: DLine[] = [];
        if (s.given.length === ids.length)
            lines.push(
                ['itsuki', '…Huh. There was something there a second ago. Like a word on the tip of my tongue.'],
                ['lethe', "That's how it feels. Don't worry — I'll remember it for you~"]
            );
        for (const id of ids) {
            if (id === 'swim')
                lines.push([
                    'narrator',
                    'Itsuki looks at the water and his stomach drops. He has no idea how to swim.'
                ]);
            if (id === 'home')
                lines.push(['narrator', 'The road back to Hearthpage blurs. Its name slides off the map.']);
            if (id === 'heights')
                lines.push(['lethe', 'Ooh, no more shaky knees! My wings will carry you farther now~']);
            if (id === 'defeat') lines.push(['itsuki', "I feel… lighter? Like I'm not afraid of losing anymore."]);
            if (id === 'mask')
                lines.push(['lethe', '(…That face. Sable. I hope you never find out why it was so sweet.)']);
        }
        if (forgottenCount(s) === 2 || forgottenCount(s) === 5)
            lines.push(['narrator', 'A new white streak creeps through Itsuki’s hair.']);
        if (lines.length) await this.dialog.say(lines);
    }

    // =========================================================================================
    // duels

    private startDuel(opp: OppId, strong = false, allies = 0): Promise<boolean> {
        const prev = this.mode;
        return new Promise((res) => {
            void this.fadeOut().then(() => {
                this.mode = 'duel';
                this.hud.show(false);
                this.arena.show(true);
                this.duel = new DuelScreen({
                    opp,
                    strong,
                    allies,
                    state: this.s,
                    stage: this.stage,
                    arena: this.arena,
                    platform: PLATFORM[DUEL_ISLE[opp]],
                    project: (v) => {
                        const out = this.camera.camera!.worldToScreen(v);
                        return this.stage.toStage(out.x, out.y);
                    },
                    onSave: () => this.save(),
                    onEnd: (won) => {
                        void this.fadeOut().then(() => {
                            this.duel?.destroy();
                            this.duel = null;
                            this.arena.show(false);
                            this.mode = prev;
                            this.hud.show(true);
                            this.input.clear();
                            if (won && opp !== 'null' && !this.s.duels.includes(opp)) this.s.duels.push(opp);
                            if (won && GENERALS.includes(opp)) {
                                this.s.devilInk += 3;
                                this.toast(`${CAST[OPPONENTS[opp].speaker].name} defeated · +3 Devil Ink`, 'pink');
                            }
                            this.refresh();
                            this.save();
                            this.fadeIn();
                            res(won);
                        });
                    }
                });
                this.fadeIn();
            });
        });
    }

    /** Duel, then settle any debt with Lethe. */
    private async fight(opp: OppId, strong = false, allies = 0): Promise<boolean> {
        const won = await this.startDuel(opp, strong, allies);
        await this.payDebt();
        return won;
    }

    // =========================================================================================
    // world events

    private onArrive(isle: IsleId) {
        const s = this.s;
        this.hud.banner(isle);
        if (isle === 'hearthpage' && isForgotten(s, 'home') && !hasFlag(s, 'walked-home')) {
            setFlag(s, 'walked-home');
            this.toast('Hearthpage… you know this place. The way home is back on your map.', 'cyan');
            this.refresh();
        }
        const first = `visited:${isle}`;
        if (!hasFlag(s, first)) {
            setFlag(s, first);
            const hello: Partial<Record<IsleId, DLine[]>> = {
                forkwood: [
                    [
                        'lethe',
                        'Forkwood! Every path here splits in two. The trees grow in the wrong places on purpose.'
                    ],
                    ['lethe', 'The Twin-Path Stag guards the Slab of Choice. Go talk to it~']
                ],
                loopwater: [
                    [
                        'lethe',
                        'Loopwater Bay… Listen. That bell has been ringing the same tune since we got off the boat.'
                    ],
                    ['lethe', 'Something about loops. Old Wade the fisher might know.']
                ],
                lexicon: [
                    ['lethe', 'The Lexicon Dunes. Every grain of sand here is a letter. Don’t sneeze.'],
                    ['lethe', 'The Librarian Sphinx keeps the true names. And… someone in a mask is guarding a slab.']
                ],
                forgehollow: [
                    ['lethe', 'Hot hot hot! Forgehollow, where the golems are made.'],
                    ['lethe', 'The Golem Smith has the Slab of Craft. Be nice to it — it has very big hands.']
                ],
                spire: [
                    ['lethe', '…The Null Spire. Father’s home.'],
                    ['lethe', 'Itsuki. Whatever you see in there — it’s only you. Remember that. Please.']
                ]
            };
            const lines = hello[isle];
            if (lines) void this.busyFromExplore(() => this.dialog.say(lines));
        }
    }

    /** Like busy(), but safe to call from inside exploreTick. */
    private busyFromExplore(fn: () => Promise<void>) {
        if (this.mode === 'explore') return this.busy(fn);
        return Promise.resolve();
    }

    private checkRace() {
        const s = this.s;
        for (const r of RACES) {
            if (
                s.rivalHeld.includes(r.rival) ||
                s.slabs.includes(r.slab) ||
                s.duels.includes(r.rival) ||
                hasFlag(s, `pact:${r.to}`)
            )
                continue;
            if (s.worldTime >= r.arrive) {
                s.rivalHeld.push(r.rival);
                this.toast(
                    `${r.name} reached ${ISLES[r.to].name} first and claimed the Slab of ${SLABS[r.slab].name}!`,
                    'pink'
                );
                sfx.lose();
                this.refresh();
                this.save();
            }
        }
    }

    private async archChosen(lz: number) {
        const s = this.s;
        const gaps = [7, 1.5, -4];
        const names = ['left', 'middle', 'right'];
        let gi = 0;
        for (let i = 1; i < 3; i++) if (Math.abs(lz - gaps[i]) < Math.abs(lz - gaps[gi])) gi = i;
        if (names[gi] === 'right') {
            s.puzzles.push('forkwood');
            sfx.success();
            this.refresh();
            await this.say(
                ['stag', 'The leaves part. You chose the road the liar could not hide.'],
                [
                    'stag',
                    'Two of my signs spoke true, one lied — and you found which. That is Choice: look before you strike.'
                ]
            );
            if (!s.rivalHeld.includes('vesper')) {
                this.faceNpc('vesper');
                await this.say(
                    [
                        'vesper',
                        'So the rumors are true. A Hearthpage scribe, walking around with a devil on his shoulder.'
                    ],
                    ['vesper', 'I am Vesper Quill. I hunt knowledge the proper way — no contracts, no shortcuts.'],
                    ['vesper', 'The Slab of Choice is mine by right. Prove otherwise, if you can.']
                );
            }
            return;
        }
        this.wrongArches += 1;
        sfx.error();
        await this.say(['stag', `The ${names[gi]} road twists back on itself… The forest returns you to the fork.`]);
        const f = this.world.anchors.get('fork')!;
        await this.fadeOut();
        this.player.place(f.x, f.z, -90);
        this.fadeIn();
        if (this.wrongArches === 2)
            await this.say([
                'lethe',
                'Psst! Exactly one sign lies. Pretend each road is the true one, and count how many signs would be lying~'
            ]);
    }

    // =========================================================================================
    // sailing and inkwells

    private sailTo(from: IsleId, to: IsleId): Promise<void> {
        const a = this.world.dock(from, to);
        const b = this.world.dock(to, from);
        if (!a || !b) return Promise.resolve();
        const route = ROUTES.find((r) => (r.a === from && r.b === to) || (r.a === to && r.b === from))!;
        const ua = this.dirOf(a.yaw);
        const ub = this.dirOf(b.yaw);
        const p0 = new Vec3(a.x + ua[0] * 3.2, 0.1, a.z + ua[1] * 3.2);
        const p2 = new Vec3(b.x + ub[0] * 3.2, 0.1, b.z + ub[1] * 3.2);
        const p1 = new Vec3((route.cx - 520) * 0.16, 0.1, (route.cy - 440) * 0.16);
        const dur = Math.min(7, Math.max(3.5, p0.distance(p2) / 11));
        sfx.splash();
        return new Promise((res) => {
            this.boat.enabled = true;
            this.hud.setPrompt(null);
            this.mode = 'sail';
            this.sail = {
                t: 0,
                dur,
                p0,
                p1,
                p2,
                done: () => {
                    this.boat.enabled = false;
                    this.sail = null;
                    this.mode = 'busy';
                    const ix = b.x - ub[0] * 2.2;
                    const iz = b.z - ub[1] * 2.2;
                    this.player.place(ix, iz, b.yaw + 180);
                    if (hasFlag(this.s, 'race-started')) {
                        this.s.worldTime += 45;
                        this.toast('The voyage took a while · rivals gained 0:45', 'pink');
                    }
                    res();
                }
            };
        });
    }

    private dirOf(yaw: number): [number, number] {
        const r = (yaw * Math.PI) / 180;
        return [Math.sin(r), Math.cos(r)];
    }

    private sailTick(dt: number) {
        const sl = this.sail;
        if (!sl) return;
        sl.t += dt;
        const k = Math.min(1, sl.t / sl.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const q = (t: number) => {
            const u = 1 - t;
            return new Vec3(
                u * u * sl.p0.x + 2 * u * t * sl.p1.x + t * t * sl.p2.x,
                0,
                u * u * sl.p0.z + 2 * u * t * sl.p1.z + t * t * sl.p2.z
            );
        };
        const p = q(e);
        const ahead = q(Math.min(1, e + 0.02));
        const yaw = (Math.atan2(ahead.x - p.x, ahead.z - p.z) * 180) / Math.PI;
        const bob = Math.sin(sl.t * 3) * 0.12;
        this.boat.setPosition(p.x, 0.15 + bob, p.z);
        this.boat.setEulerAngles(Math.sin(sl.t * 2) * 3, yaw, Math.sin(sl.t * 2.6) * 4);
        this.player.ride(p.x, 0.55 + bob, p.z, yaw, dt);
        if (k >= 1) sl.done();
    }

    private async inkTravel(to: IsleId) {
        const w = this.world.anchors.get(`inkwell:${to}`)!;
        const c = ISLES[to];
        const dx = c.x - w.x;
        const dz = c.z - w.z;
        const d = Math.hypot(dx, dz) || 1;
        sfx.devil();
        await this.fadeOut();
        this.player.place(w.x + (dx / d) * 1.8, w.z + (dz / d) * 1.8);
        this.isle = to;
        this.s.isle = to;
        if (hasFlag(this.s, 'race-started')) this.s.worldTime += 20;
        this.fadeIn();
        this.hud.banner(to);
    }

    // =========================================================================================
    // objective text

    private objective(): string {
        const s = this.s;
        if (!s.prologueDone) return '…';
        if (!s.puzzles.includes('hearthpage'))
            return 'The windmill has stopped. Talk to the Windmill Warden by the mill.';
        if (!s.duels.includes('warden')) return 'Duel the Windmill Warden to prove you can write in Order.';
        if (!s.slabs.includes('order')) return 'Take the Slab of Order from the pedestal by the mill.';
        if (s.devilInk < 0) return 'Pay Lethe what you owe.';
        const here = this.isleStep(this.isle);
        if (here) return here;
        const missing = (['forkwood', 'loopwater', 'lexicon', 'forgehollow'] as IsleId[]).filter(
            (i) => !s.slabs.includes(ISLES[i].slab)
        );
        if (missing.length)
            return `Recover the slabs on ${missing.map((i) => ISLES[i].name).join(', ')}. Sail from the docks.`;
        if (!s.slabs.includes('self')) return 'Five slabs! Sail to the Null Spire from Hearthpage’s north dock.';
        if (!hasFlag(s, 'ended')) return 'Confront King Null at the foot of the Spire.';
        return 'Scriptoria is saved. Face King Null again to rewrite the ending.';
    }

    private isleStep(isle: IsleId): string | null {
        const s = this.s;
        const slab = ISLES[isle].slab;
        if (s.slabs.includes(slab)) return null;
        switch (isle) {
            case 'forkwood':
                if (s.rivalHeld.includes('vesper') && !s.duels.includes('vesper') && !hasFlag(s, 'pact:forkwood'))
                    return 'Vesper got here first. Find her past the true arch: duel her, or strike a pact.';
                if (!s.puzzles.includes('forkwood'))
                    return 'Read the three signposts. One lies. Walk through the true arch.';
                if (!s.duels.includes('vesper') && !hasFlag(s, 'pact:forkwood'))
                    return 'Duel Vesper Quill for the Slab of Choice.';
                return 'Take the Slab of Choice in the clearing.';
            case 'loopwater':
                if (!s.puzzles.includes('loopwater'))
                    return canSwim(s)
                        ? 'Swim out to the Tide Bell on the lagoon islet and break its loop.'
                        : 'Deep water! Ask Old Wade to teach you to swim again.';
                if (!s.duels.includes('overflow')) return 'Defeat Sir Overflow before he swells too big.';
                return 'Take the Slab of Echo.';
            case 'lexicon':
                if (!s.puzzles.includes('lexicon')) return 'Answer the Librarian Sphinx’s riddle.';
                if (!s.duels.includes('sable')) return 'Duel Sable, the Masked Archivist, for the Slab of Name.';
                return 'Take the Slab of Name.';
            case 'forgehollow':
                if (s.rivalHeld.includes('brakk') && !s.duels.includes('brakk') && !hasFlag(s, 'pact:forgehollow'))
                    return 'Brakk got here first and holds the Slab of Craft. Duel him or strike a pact.';
                if (!s.puzzles.includes('forgehollow')) return 'Help the Golem Smith program a helper golem.';
                if (!s.duels.includes('brakk') && !hasFlag(s, 'pact:forgehollow'))
                    return 'Duel Brakk Ironloop for the Slab of Craft.';
                return 'Take the Slab of Craft.';
            case 'spire':
                if (!s.duels.includes('mirror')) return 'Face the Mirror at the foot of the Spire.';
                return 'Take the Slab of Self.';
            default:
                return null;
        }
    }

    // =========================================================================================
    // interactables

    private at(id: string): [number, number] {
        const a = this.world.anchors.get(id);
        if (a) return [a.x, a.z];
        const n = this.world.npcs.get(id)!;
        return [n.x, n.z];
    }

    private inter(id: string, r: number, label: () => string | null, run: () => Promise<void>, anchor = id) {
        const [x, z] = this.at(anchor);
        this.inters.push({ id, x, z, r, label, run });
    }

    private npcLabel(id: string, text: string | (() => string | null)): () => string | null {
        return () => {
            const n = this.world.npcs.get(id);
            if (!n || !n.visible || !this.s.prologueDone) return null;
            return typeof text === 'string' ? text : text();
        };
    }

    private buildInteractables() {
        const s = () => this.s;
        // Hearthpage
        this.inter('mom', 2.6, this.npcLabel('mom', 'Talk to Mom'), () => this.talkMom());
        this.inter(
            'musicbox',
            2.0,
            () => (s().prologueDone ? 'Open the music box' : null),
            () => this.musicBox()
        );
        this.inter(
            'tomo',
            2.6,
            this.npcLabel('tomo', () => (isForgotten(s(), 'tomo') ? 'Talk to the friendly baker' : 'Talk to Tomo')),
            () => this.talkTomo()
        );
        this.inter('pix', 2.6, this.npcLabel('pix', 'Talk to Pix'), () => this.talkPix());
        this.inter('warden', 3.0, this.npcLabel('warden', 'Talk to the Windmill Warden'), () => this.talkWarden());
        // Forkwood
        this.inter('stag', 3.0, this.npcLabel('stag', 'Talk to the Twin-Path Stag'), () => this.talkStag());
        for (const side of ['left', 'middle', 'right'] as const)
            this.inter(
                `sign:${side}`,
                1.9,
                () => 'Read the signpost',
                () => this.readSign(side)
            );
        this.inter('vesper', 2.8, this.npcLabel('vesper', 'Talk to Vesper Quill'), () => this.talkRival('vesper'));
        this.inter('segfault', 3.0, this.npcLabel('segfault', 'Approach the glitching rift'), () =>
            this.talkGeneral('segfault')
        );
        // Loopwater
        this.inter('wade', 2.6, this.npcLabel('wade', 'Talk to Old Wade'), () => this.talkWade());
        this.inter(
            'tidebell',
            2.4,
            () => (s().puzzles.includes('loopwater') ? null : 'Ring the Tide Bell'),
            () => this.tideBell()
        );
        this.inter('overflow', 3.0, this.npcLabel('overflow', 'Face Sir Overflow'), () => this.talkGeneral('overflow'));
        // Lexicon
        this.inter('sphinx', 3.4, this.npcLabel('sphinx', 'Talk to the Librarian Sphinx'), () => this.talkSphinx());
        this.inter('sable', 2.8, this.npcLabel('sable', 'Talk to the masked archivist'), () => this.talkSable());
        this.inter('deadlock', 2.8, this.npcLabel('deadlock', 'Talk to the chained lady'), () =>
            this.talkGeneral('deadlock')
        );
        // Forgehollow
        this.inter('smith', 3.0, this.npcLabel('smith', 'Talk to the Golem Smith'), () => this.talkSmith());
        this.inter('brakk', 2.8, this.npcLabel('brakk', 'Talk to Brakk Ironloop'), () => this.talkRival('brakk'));
        // Spire
        this.inter('mirror', 2.8, this.npcLabel('mirror', 'Look into the Mirror'), () => this.talkMirror());
        this.inter('null', 3.2, this.npcLabel('null', 'Confront King Null'), () => this.talkNull());
        // per-isle things: slabs, inkwells, Lethe moments
        for (const isle of Object.keys(ISLES) as IsleId[]) {
            this.inter(
                `slab:${isle}`,
                2.6,
                () =>
                    this.world.slabStones.get(isle)?.enabled
                        ? `Take the Slab of ${SLABS[ISLES[isle].slab].name}`
                        : null,
                () => this.claimSlab(ISLES[isle].slab)
            );
            if (this.world.anchors.has(`inkwell:${isle}`)) {
                this.inter(
                    `inkwell:${isle}`,
                    2.2,
                    () => {
                        if (!s().prologueDone) return null;
                        if (isle === 'hearthpage' && !this.homeKnown()) return 'A dark inkwell… it feels familiar';
                        return s().inkwells.includes(isle) ? 'Travel by Inkwell' : 'Light the Inkwell';
                    },
                    () => this.useInkwell(isle)
                );
            }
            if (this.world.hearts.has(isle))
                this.inter(
                    `heart:${isle}`,
                    2.4,
                    () => (this.world.hearts.get(isle)?.enabled ? 'Sit with Lethe ♥' : null),
                    () => this.letheMoment(isle)
                );
        }
    }

    // =========================================================================================
    // story: the prologue and Hearthpage

    private async prologue() {
        const s = this.s;
        this.hud.show(false);
        await this.say(
            ['narrator', 'Scriptoria: a ring of floating isles, written into being by six stone slabs.'],
            [
                'narrator',
                'One night the slabs vanished. The windmills of Hearthpage stopped turning — and at the heart of the ring, the Blank began to spread.'
            ],
            ['lethe', 'Psst! Hey! You — scribe boy with the cracked Slate!'],
            ['itsuki', 'Wh— who said that? …Are those horns?'],
            ['lethe', "I'm Lethe! Princess of the Devil Court. Runaway princess. It's a long story~"],
            [
                'lethe',
                'My father, King Null, stole the six slabs. He wants to rewrite the whole world into the Blank. No songs, no names, no you.'
            ],
            ['itsuki', 'Why would you tell me?'],
            [
                'lethe',
                "Because you're a scribe. You can read slabs. And I have power — loads of it. I just can't use it alone."
            ],
            [
                'lethe',
                'So… a contract? I lend you my power. You pay me in memories. Only the ones you can spare~ Promise.'
            ]
        );
        await new Promise<void>((res) => this.screens.contract(res));
        s.prologueDone = true;
        await this.say(
            [
                'lethe',
                'Yay! Partners! Okay — the Windmill Warden guards the Slab of Order by the old mill. It only listens to scribes who write in order.'
            ],
            ['lethe', 'Say goodbye to your mom and Tomo, too. Who knows when we’ll be back~'],
            [
                'narrator',
                'Controls: WASD to move · Shift to sprint · Space to jump (hold to glide) · drag the mouse to turn the camera · E to talk · M for the map · L for the Memory Ledger · Esc for the menu.'
            ]
        );
        this.hud.show(true);
        this.hud.banner('hearthpage');
        this.save();
    }

    private async talkMom() {
        const s = this.s;
        this.faceNpc('mom');
        if (isForgotten(s, 'lullaby')) {
            await this.say(
                ['mom', 'Itsuki! You came back. Here — I’ll hum your song, like when the windmills stopped.'],
                ['narrator', 'She hums. It is a pretty tune. Itsuki has never heard it before in his life.'],
                ['mom', '…You don’t remember it, do you? That’s all right. I’ll remember it for both of us.']
            );
            return;
        }
        if (!hasFlag(s, 'met-mom')) {
            setFlag(s, 'met-mom');
            await this.say(
                ['mom', 'Leaving already? The mill’s gone quiet, and now my son wants to go chasing slabs.'],
                [
                    'mom',
                    'Take this with you: whenever you’re scared, hum the lullaby from the music box. The one I sang every night the windmills stopped.'
                ],
                ['itsuki', 'I’m not a kid anymore, Mom.'],
                ['mom', 'Then hum it for your little friend with the horns. She looks like she needs it more.'],
                ['lethe', '…She can SEE me?!']
            );
            return;
        }
        const n = s.slabs.length;
        await this.say(
            [
                'mom',
                n
                    ? `${n} slab${n > 1 ? 's' : ''} already! The mill turns again because of you.`
                    : 'The Warden is grumpy, but fair. Be patient with it.'
            ],
            ['mom', 'Eat something. And come home.']
        );
    }

    private async musicBox() {
        const s = this.s;
        if (isForgotten(s, 'lullaby')) {
            playMelody('strange', 84);
            await this.say([
                'narrator',
                'The music box plays a song you don’t recognize. Its paint has gone paper-white.'
            ]);
            return;
        }
        playMelody('lullaby', 84);
        await this.say(
            ['narrator', 'The music box plays Mom’s lullaby. Somewhere far away, a windmill creaks in time.'],
            ['lethe', '…That’s nice. That one smells really sweet, Itsuki.']
        );
    }

    private async talkTomo() {
        const s = this.s;
        this.faceNpc('tomo');
        const stranger = isForgotten(s, 'tomo');
        if (stranger)
            await this.say(
                ['tomo', 'Welcome, traveler! Fresh honey buns, right out of the oven. Have we… met?'],
                ['lethe', '(He’s smiling at you like a stranger. That was the price, Itsuki.)']
            );
        else if (!hasFlag(s, 'met-tomo')) {
            setFlag(s, 'met-tomo');
            await this.say(
                ['tomo', 'Itsuki! I heard you’re going after the slabs. With a DEVIL. You’re out of your mind.'],
                ['tomo', 'Best friends since we were five, so I’m legally required to feed you first.']
            );
        }
        if (s.bondFlags.includes('meal')) {
            if (!stranger) await this.say(['tomo', 'Your devil friend ate four buns. FOUR. Come back soon, okay?']);
            return;
        }
        if (isForgotten(s, 'bun')) {
            await this.say(
                ['narrator', 'Itsuki takes a bite of a honey bun. It tastes like paper.'],
                ['lethe', '…Oh. I ate that one, didn’t I. Sorry.']
            );
            return;
        }
        const c = await this.ask('tomo', 'One extra honey bun for you — like always. Share it?', [
            'Share the buns with Lethe',
            'Maybe later'
        ]);
        if (c === 0) {
            addBond(s, 'meal');
            sfx.success();
            await this.say(
                ['lethe', 'Mmmf! Fhis is SO GOOD. Ffey don’t have bread in the Devil Court!'],
                ['lethe', '…Thank you, Itsuki. Nobody’s ever shared with me before.']
            );
            this.toast('Bond with Lethe +1', 'pink');
        }
    }

    private async talkPix() {
        const s = this.s;
        this.faceNpc('pix');
        if (hasFlag(s, 'pix-intel')) {
            await this.say(['pix', 'Already sold you my notes, Hearthpage. And yours to them. Fore~!']);
            return;
        }
        await this.say(
            ['pix', 'Pix, knowledge hunter. They call me the Golfer: I swing once and always land where I mean to.'],
            ['pix', 'I know who you’re racing. Vesper Quill is heading for Forkwood; Brakk Ironloop for Forgehollow.']
        );
        const c = await this.ask(
            'pix',
            'I’ll sell you my notes on their spellwork. Of course, I’ll sell them notes on YOU, too. Business is business.',
            [
                { label: 'Buy the notes', note: '+1 Tell against Vesper and Brakk · rivals gain 1:00' },
                { label: 'No deal' }
            ]
        );
        if (c === 0) {
            setFlag(s, 'pix-intel');
            s.worldTime += 60;
            sfx.success();
            await this.say(['pix', 'Pleasure doing business. Vesper always opens with a Bolt, by the way. Allegedly.']);
            this.toast('Rival notes: +1 Tell vs Vesper and Brakk · rivals moved 1:00 ahead', 'cyan');
        }
    }

    private async talkWarden() {
        const s = this.s;
        this.faceNpc('warden');
        if (!s.puzzles.includes('hearthpage')) {
            await this.say(
                ['warden', 'HALT, SCRIBE. THE MILL HAS STOPPED. ITS RUNES WERE SCRAMBLED WHEN THE SLAB WAS TAKEN.'],
                ['warden', 'RESTORE THEIR ORDER. FIRST THIS. THEN THAT.']
            );
            const ok = await this.puzzles.gears();
            if (!ok) return;
            s.puzzles.push('hearthpage');
            this.refresh();
        }
        if (!s.duels.includes('warden')) {
            await this.say(['warden', 'GOOD. YOU CAN READ ORDER. NOW SHOW ME YOU CAN WRITE IT.']);
            if (!hasFlag(s, 'duel-tutorial')) {
                setFlag(s, 'duel-tutorial');
                await this.say(
                    [
                        'lethe',
                        'A code duel! Okay, quick lesson~ You write runes on your Slate, top to bottom. The Warden writes its own.'
                    ],
                    [
                        'lethe',
                        'Press RUN and both scripts execute at the same time, one line per tick. Moves happen first, then attacks.'
                    ],
                    [
                        'lethe',
                        'Strike hits a foe right next to you, if they stand still. Bolt flies down your whole row. Guard blocks both. Charge dashes down your row and smashes through Guard!'
                    ],
                    [
                        'lethe',
                        'You can read some of its lines — those are Tells. Plan around them. And if you’re stuck… my Hellflare is always hungry~'
                    ]
                );
            }
            const c = await this.ask('warden', 'BEGIN?', ['Duel the Windmill Warden', 'Not yet']);
            if (c !== 0) return;
            const won = await this.fight('warden');
            if (!won) return;
            await this.say(['warden', 'ORDER… CONFIRMED. THE SLAB IS YOURS, SCRIBE. TAKE IT FROM THE PEDESTAL.']);
            return;
        }
        await this.say([
            'warden',
            s.slabs.includes('order')
                ? 'THE MILL TURNS. THANK YOU, SCRIBE.'
                : 'THE SLAB OF ORDER AWAITS ON THE PEDESTAL.'
        ]);
    }

    // =========================================================================================
    // Forkwood

    private async talkStag() {
        const s = this.s;
        this.faceNpc('stag');
        if (s.puzzles.includes('forkwood')) {
            await this.say(['stag', 'Every fork is a question. You answered mine. Walk on.']);
            return;
        }
        await this.say(
            ['stag', 'Three arches lead to the clearing where the Slab of Choice rests. Only one road is true.'],
            ['stag', 'Before each arch stands a signpost. Two of my signs tell the truth. One of them lies.'],
            ['stag', 'Read them, choose, and walk through. Choose wrong, and the forest folds you back here.']
        );
    }

    private async readSign(side: 'left' | 'middle' | 'right') {
        const text = {
            left: '“The true road is the right one.”',
            middle: '“The right signpost lies.”',
            right: '“The left road is a trap.”'
        }[side];
        await this.say(['sign', `The ${side.toUpperCase()} signpost reads: ${text}`]);
    }

    private async talkRival(rival: 'vesper' | 'brakk') {
        const s = this.s;
        const isle: IsleId = rival === 'vesper' ? 'forkwood' : 'forgehollow';
        const slab: SlabId = rival === 'vesper' ? 'choice' : 'craft';
        this.faceNpc(rival);
        const allies = hasFlag(s, 'pix-intel') ? 1 : 0;
        if (s.duels.includes(rival) || hasFlag(s, `pact:${isle}`)) {
            if (rival === 'vesper')
                await this.say([
                    'vesper',
                    s.duels.includes('vesper')
                        ? 'Take the slab. I lost fairly. …I’ll leave some notes about King Null’s script where you’ll find them.'
                        : 'A deal is a deal. Your memory for my slab. I hope it was worth it.'
                ]);
            else
                await this.say([
                    'brakk',
                    s.duels.includes('brakk')
                        ? 'Hah! Good fight, Hearthpage. When you go after Null, I’ve got your back.'
                        : 'Pact’s a pact. I don’t even know what that memory was, but it’s mine now.'
                ]);
            return;
        }
        const held = s.rivalHeld.includes(rival);
        if (rival === 'brakk' && !held && !s.puzzles.includes('forgehollow')) {
            await this.say([
                'brakk',
                'Outta my way, Hearthpage. The Smith won’t talk to anyone who can’t build. Go build something.'
            ]);
            return;
        }
        if (rival === 'vesper') {
            if (held)
                await this.say(
                    ['vesper', 'You’re late. The Slab of Choice is already mine.'],
                    ['vesper', 'I could simply leave… but I’m curious what a contract-scribe is worth.']
                );
            else await this.say(['vesper', 'Shall we? I won’t go easy on a devil’s puppet.']);
        } else {
            const defeat = isForgotten(s, 'defeat');
            if (held)
                await this.say(
                    ['brakk', 'Too slow! The Slab of Craft is MINE. Brakk Ironloop, first to the forge!'],
                    [
                        'brakk',
                        defeat
                            ? 'Wait — you don’t remember me? I knocked you flat last spring! …Huh. That’s kinda sad.'
                            : 'Remember last spring? Flat on your back. Wanna go again?'
                    ]
                );
            else
                await this.say(
                    ['brakk', 'HAH! I ran the whole way here! The slab’s right there and you think YOU get it?'],
                    [
                        'brakk',
                        defeat
                            ? '…You don’t even remember losing to me. That makes this no fun.'
                            : 'Last spring I knocked you flat. Let’s see if you’ve trained.'
                    ]
                );
        }
        const opts: ChoiceOpt[] = [
            {
                label: held
                    ? `Duel ${CAST[rival].name.split(' ')[0]} (stronger — they have the slab)`
                    : `Duel ${CAST[rival].name.split(' ')[0]}`,
                note: allies ? 'Pix’s notes: +1 Tell' : undefined
            }
        ];
        if (held)
            opts.push({
                label: 'Strike a pact',
                note: 'trade a memory for the slab · no Devil Ink',
                disabled: payable(s).length === 0
            });
        opts.push({ label: 'Not now' });
        const c = await this.ask(rival, held ? 'Well? Fight me for it, or make me an offer.' : 'Ready?', opts);
        if (c === 0) {
            const won = await this.fight(rival, held, allies);
            if (won) {
                setFlag(s, `ally:${rival}`);
                if (rival === 'vesper')
                    await this.say(
                        [
                            'vesper',
                            '…Impressive. Your spellwork is clean, even with that devil whispering in your ear.'
                        ],
                        [
                            'vesper',
                            'Take the Slab of Choice. And take this: King Null’s scripts have a pattern. I’ll mark it for you.'
                        ]
                    );
                else
                    await this.say(
                        ['brakk', 'OOF. Okay. Okay! You trained. Take the slab, you earned it.'],
                        ['brakk', 'When you fight Null, I’ll be yelling his moves from the back. Loudly.']
                    );
                this.toast(`${CAST[rival].name.split(' ')[0]} will help you read King Null’s script (+1 Tell)`, 'cyan');
            }
            return;
        }
        if (held && c === 1) {
            const picked = await this.openLedger('pact', CAST[rival].name.split(' ')[0]);
            if (!picked) return;
            setFlag(s, `pact:${isle}`);
            setFlag(s, `ally:${rival}`);
            this.refresh();
            const m = MEMORIES.find((x) => x.id === picked)!;
            await this.say(
                [
                    rival,
                    rival === 'vesper'
                        ? `“${m.title}”… A fair price. The slab is yours.`
                        : `“${m.title}”? Weird thing to trade. DEAL!`
                ],
                ['lethe', 'Hmph! That memory was MINE to eat. …Fine. At least you got the slab.']
            );
            await this.afterEaten([picked]);
            this.toast(`Pact made · the Slab of ${SLABS[slab].name} is yours to take`, 'pink');
        }
    }

    private async talkGeneral(opp: 'overflow' | 'deadlock' | 'segfault') {
        const s = this.s;
        this.faceNpc(opp);
        const intro: Record<typeof opp, DLine[]> = {
            overflow: [
                [
                    'overflow',
                    'BWAHAHA! You broke my lovely bell loop, little scribe! I am Sir Overflow, general of the Devil Court!'
                ],
                ['overflow', 'Every tick I am not hurt, I grow. And when I am big enough — POP!'],
                ['lethe', 'He’s one of Father’s generals! Hit him often so he can’t swell up~']
            ],
            deadlock: [
                ['deadlock', 'Princess Lethe. Your father wants you home.'],
                [
                    'deadlock',
                    'And you, scribe — I am Lady Deadlock. I chain two of your lines each round. They won’t run until something unlocks them.'
                ],
                ['lethe', 'In this duel you get a Key rune! Put it BEFORE the chained lines and they’ll run.']
            ],
            segfault: [
                ['segfault', 'Hehehe… memory you shouldn’t touch… cells you shouldn’t touch… I am Segfault!'],
                [
                    'segfault',
                    'Green cells are forbidden. Swing at them and your script crashes~ And I blink around, oh yes I do.'
                ],
                ['lethe', 'Bolts don’t care about forbidden cells. Just saying~']
            ]
        };
        await this.dialog.say(intro[opp]);
        if (opp === 'overflow' && !s.puzzles.includes('loopwater')) return;
        const c = await this.ask(opp, 'Well?', [
            { label: `Duel ${CAST[opp].name}`, note: 'Devil general · reward +3 Devil Ink' },
            'Not now'
        ]);
        if (c !== 0) return;
        const won = await this.fight(opp);
        if (won) {
            const after: Record<typeof opp, DLine[]> = {
                overflow: [
                    ['overflow', 'Pfffffsssss… I’m deflating… Father will hear of this!'],
                    ['lethe', 'Bye-bye~ The Slab of Echo is free now!']
                ],
                deadlock: [
                    ['deadlock', 'Unlocked… How annoying. Princess, come home before it’s too late.'],
                    ['lethe', '…No.']
                ],
                segfault: [
                    ['segfault', 'Core… dumped…'],
                    ['lethe', 'And he dropped some Devil Ink! Yoink~']
                ]
            };
            await this.dialog.say(after[opp]);
        }
    }

    // =========================================================================================
    // Loopwater

    private async talkWade() {
        const s = this.s;
        this.faceNpc('wade');
        if (!canSwim(s)) {
            await this.say(
                ['wade', 'Can’t swim? Ha! Forgot how, did ya? Happens to the best of us, out here by the Blank.'],
                ['wade', 'C’mere. Kick your legs. Cup your hands. Breathe out under the water…']
            );
            await this.fadeOut();
            setFlag(s, 'relearned-swim');
            if (hasFlag(s, 'race-started')) s.worldTime += 60;
            this.fadeIn();
            sfx.splash();
            this.toast('You relearned how to swim (it took a while · rivals gained 1:00)', 'cyan');
            await this.say(['wade', 'There ya go. Swims like a fish. A clumsy fish.']);
            return;
        }
        if (s.puzzles.includes('loopwater')) {
            await this.say(['wade', 'The bay’s quiet now. First good night’s sleep in a week. Thank ya, kid.']);
            return;
        }
        await this.say(
            [
                'wade',
                'That Tide Bell out on the islet’s been ringin’ the same tune for days. Same notes, round and round.'
            ],
            ['wade', 'A loop like that, you don’t stop it by plugging your ears. You echo it back till it breaks.'],
            ['wade', 'Swim on out. Lagoon’s shallow enough.']
        );
    }

    private async tideBell() {
        const s = this.s;
        const ok = await this.puzzles.bells();
        if (!ok) return;
        s.puzzles.push('loopwater');
        this.refresh();
        await this.talkGeneral('overflow');
    }

    // =========================================================================================
    // Lexicon

    private async talkSphinx() {
        const s = this.s;
        this.faceNpc('sphinx');
        if (s.puzzles.includes('lexicon')) {
            await this.say([
                'sphinx',
                'What is named is never lost. Remember that, little scribe — especially with that hungry thing beside you.'
            ]);
            return;
        }
        await this.say([
            'sphinx',
            'Welcome to the Lexicon. Here, everything has a true name, and nothing may pass that cannot name things truly.'
        ]);
        const ok = await this.puzzles.nameGrid();
        if (!ok) return;
        s.puzzles.push('lexicon');
        this.refresh();
        await this.say([
            'sphinx',
            'You may approach the slab. But a masked archivist sits upon it, and she does not answer to me.'
        ]);
    }

    private async talkSable() {
        const s = this.s;
        this.faceNpc('sable');
        if (s.duels.includes('sable')) return;
        if (!s.puzzles.includes('lexicon')) {
            await this.say(
                ['sable', '…'],
                [
                    'narrator',
                    'The masked archivist says nothing. The Sphinx’s gaze holds you back: answer the riddle first.'
                ]
            );
            return;
        }
        const masked = isForgotten(s, 'mask');
        if (masked)
            await this.say(
                ['sable', 'Itsuki of Hearthpage.'],
                ['itsuki', 'Do I… know you?'],
                ['sable', '…No. Not anymore. Good. That makes this easier.']
            );
        else
            await this.say(
                ['sable', 'Itsuki of Hearthpage. You grew up.'],
                ['itsuki', 'That mask… I’ve seen it before. Before Hearthpage. Who are you?'],
                [
                    'sable',
                    'Someone who wrote things down so you wouldn’t have to remember them. Keep that memory, Itsuki. Don’t let the devil eat it.'
                ],
                ['lethe', '……']
            );
        const c = await this.ask(
            'sable',
            'The Slab of Name copies whoever wields it. So shall I — I copy your last spell.',
            ['Duel Sable', 'Not yet']
        );
        if (c !== 0) return;
        const won = await this.fight('sable');
        if (!won) return;
        setFlag(s, 'ally:sable');
        if (isForgotten(s, 'mask'))
            await this.say(
                ['sable', 'Take it. And… goodbye, Itsuki.'],
                [
                    'narrator',
                    'Sable walks into the dunes without looking back. Itsuki feels nothing at all, and that feels wrong.'
                ]
            );
        else
            await this.say(
                ['sable', 'You still remember me. Then I’ll be watching over you, the way I used to.'],
                ['sable', 'When you face King Null, I’ll copy his script into your margins.']
            );
        setFlag(s, 'sable-left');
        this.refresh();
    }

    // =========================================================================================
    // Forgehollow

    private async talkSmith() {
        const s = this.s;
        this.faceNpc('smith');
        if (s.puzzles.includes('forgehollow')) {
            await this.say(['smith', 'MAKE THE TOOL, THEN THE THING. YOU UNDERSTAND THIS NOW.']);
            return;
        }
        await this.say(
            ['smith', 'HELLO, SMALL SCRIBE. MY HELPER GOLEM MUST CARRY ORE TO THE FORGE.'],
            ['smith', 'BUT IT REMEMBERS ONLY SIX ORDERS. TEACH IT A FUNCTION, AND SIX IS PLENTY.']
        );
        const ok = await this.puzzles.golem();
        if (!ok) return;
        s.puzzles.push('forgehollow');
        this.refresh();
        await this.say(['smith', 'THE FORGE IS LIT. THE SLAB OF CRAFT IS YOURS — IF THE LOUD ONE LETS YOU.']);
    }

    // =========================================================================================
    // Spire

    private async talkMirror() {
        this.faceNpc('mirror');
        await this.say(
            ['mirror', 'Hi, Itsuki. Don’t look so surprised. I’m you — the you the Slab of Self remembers.'],
            [
                'mirror',
                'Every rune you’ve leaned on, I know it. Every habit. I’ll cast them right back at you, mirrored.'
            ],
            ['lethe', 'The more you repeat yourself, the better it knows you… Try something new!']
        );
        const c = await this.ask('mirror', 'To know the world, know yourself. Ready?', ['Duel your Mirror', 'Not yet']);
        if (c !== 0) return;
        const won = await this.fight('mirror');
        if (won)
            await this.say(
                ['mirror', 'Heh. So that’s who I am.'],
                [
                    'narrator',
                    'The Mirror cracks into a thousand white flakes. A pink-glowing slab waits on the pedestal.'
                ]
            );
    }

    private allies(): number {
        return ['vesper', 'brakk', 'sable'].filter((r) => hasFlag(this.s, `ally:${r}`)).length;
    }

    private async talkNull() {
        const s = this.s;
        this.faceNpc('null');
        if (!s.slabs.includes('self')) {
            await this.say(['null', 'Take your little slab first, scribe. I can wait. I am very good at waiting.']);
            return;
        }
        const rematch = hasFlag(s, 'ended');
        if (rematch)
            await this.say(['null', 'Back again? The Blank always gives me back. Rewrite your ending, if you dare.']);
        else
            await this.say(
                ['null', 'So. My daughter found herself a scribe.'],
                ['null', 'Lethe. Come home. You eat memories; I erase worlds. We are the same thing, you and I.'],
                [
                    'lethe',
                    s.bond >= 4
                        ? 'We are NOT. Itsuki shared his bread with me. He counted stars with me. I’m staying.'
                        : '…I… I don’t know, Father.'
                ],
                ['null', 'And you, scribe. Look at your hair. How much of you is even left?'],
                ['itsuki', forgottenCount(s) >= 4 ? 'Not much. But it’s enough.' : 'Enough to remember why I came.']
            );
        const allies = this.allies();
        if (allies)
            await this.say([
                'lethe',
                `Look — your rivals left notes in the margins of his script! ${allies === 1 ? 'One more line' : `${allies} more lines`} we can read~`
            ]);
        const c = await this.ask('null', 'Then let us write the last page.', [
            { label: 'Duel King Null', note: 'Null erases a line of your Slate every time one finishes' },
            'Not yet'
        ]);
        if (c !== 0) return;
        const won = await this.fight('null', false, allies);
        if (!won) return;
        const kind = s.bond < 4 ? 'rasa' : forgottenCount(s) <= 3 ? 'recompile' : 'crown';
        setFlag(s, 'ended');
        setFlag(s, `ending:${kind}`);
        this.save();
        await this.say(
            ['null', 'Impossible… a page cannot write itself…'],
            [
                'narrator',
                'King Null dissolves into the Blank. The slabs on Itsuki’s Slate begin to glow, all six at once.'
            ]
        );
        await new Promise<void>((res) => {
            this.hud.show(false);
            this.screens.ending(
                kind,
                { kept: keptCount(s), total: MEMORIES.length, bond: s.bond, devil: s.devilUses },
                res
            );
        });
        this.save();
        this.mode = 'title';
        this.showTitle();
    }

    // =========================================================================================
    // slabs, inkwells, Lethe moments

    private async claimSlab(id: SlabId) {
        const s = this.s;
        if (s.slabs.includes(id)) return;
        await new Promise<void>((res) => this.screens.slab(id, true, res));
        s.slabs.push(id);
        this.refresh();
        this.save();
        this.toast(`Slab of ${SLABS[id].name} recovered · ${s.slabs.length}/6`, 'cyan');
        switch (id) {
            case 'order':
                setFlag(s, 'race-started');
                await this.say(
                    ['narrator', 'With a great groan, the windmills of Hearthpage begin to turn again.'],
                    ['lethe', 'Your Slate is fixed — six lines now! …Uh-oh.'],
                    [
                        'lethe',
                        'Two knowledge hunters felt that slab wake up. Vesper Quill is heading for Forkwood. Brakk Ironloop is heading for Forgehollow.'
                    ],
                    [
                        'lethe',
                        'If they reach a slab first, they’ll keep it — and we’ll have to fight them or make a deal. The race is on~ Docks are at the edge of the isle!'
                    ]
                );
                break;
            case 'choice':
                await this.say([
                    'lethe',
                    'If / else! Now your spells can look before they leap~ Try “if foe.guarding: charge, else: strike”.'
                ]);
                break;
            case 'echo':
                await this.say(['lethe', 'Loops! One line, many ticks, less ink. Loop ×3 Bolt is sooo satisfying.']);
                break;
            case 'name':
                await this.say([
                    'lethe',
                    'The Slab of Name… It says you can Name one memory so nobody can ever take it. Not even me. Hmph.'
                ]);
                await this.openLedger('protect');
                await this.say(
                    ['lethe', 'Fine. That one’s safe forever. …I’m glad, actually. Don’t tell anyone.'],
                    ['lethe', 'You also got a Counter rune — it answers whatever the foe did last tick!']
                );
                break;
            case 'craft':
                await this.say([
                    'lethe',
                    'The Slab of Craft! Make your own rune with def — name a combo and call it on one line~'
                ]);
                break;
            case 'self':
                await this.say(
                    [
                        'lethe',
                        'fractal(3)… A spell that calls itself. Don’t forget the base case, or you’ll get dizzy!'
                    ],
                    ['narrator', 'Behind the pedestal, the Blank stirs. A crowned figure steps out of the white.']
                );
                break;
        }
        if (s.slabs.length === 5 && !s.slabs.includes('self')) {
            await this.say(
                [
                    'lethe',
                    'Five slabs! Look — a new route opened from Hearthpage’s north dock, straight to the Null Spire.'
                ],
                ['lethe', 'That’s where Father is. And the last slab.']
            );
        }
        this.refresh();
    }

    private async useInkwell(isle: IsleId) {
        const s = this.s;
        if (isle === 'hearthpage' && !this.homeKnown()) {
            await this.say(['narrator', 'The inkwell is dark and paper-white. You can’t remember where it leads.']);
            return;
        }
        if (!s.inkwells.includes(isle)) {
            s.inkwells.push(isle);
            sfx.success();
            this.refresh();
            this.toast(`Inkwell of ${ISLES[isle].name} lit · fast travel unlocked`, 'cyan');
            if (s.inkwells.length === 1)
                await this.say([
                    'lethe',
                    'Inkwells connect through the ink! Light more of them, and you can hop between isles in a blink~'
                ]);
            return;
        }
        await this.openMap(true);
    }

    private async letheMoment(isle: IsleId) {
        const s = this.s;
        const lines: Record<IsleId, DLine[]> = {
            hearthpage: [
                ['itsuki', 'This is my rooftop. I used to count stars up here until I fell asleep.'],
                ['lethe', 'There are no stars in the Devil Court. Just ink, all the way up.'],
                ['itsuki', 'Then you can borrow mine. That one’s yours. And that one.'],
                ['lethe', '…Then count them with me. And don’t you dare fall asleep first~']
            ],
            forkwood: [
                ['lethe', 'Can I tell you a secret? I ran away on purpose. Not because of the slabs.'],
                [
                    'lethe',
                    'Father makes everything blank. I wanted to see what the world looks like when it’s still written.'
                ],
                ['itsuki', 'And?'],
                ['lethe', 'It’s noisy. And green. And you’re in it. …I like it.']
            ],
            loopwater: [
                ['lethe', 'Do you ever wonder what I do with the memories I eat?'],
                ['itsuki', 'You… digest them?'],
                [
                    'lethe',
                    'Rude! I keep them. All of them. If you ever want one back, I’ll tell it to you like a bedtime story.'
                ]
            ],
            lexicon: [
                ['lethe', 'Lethe is the river of forgetting. Father named me after what I eat.'],
                ['itsuki', 'Then I’ll name you something else. In my head, at least.'],
                ['lethe', '…What is it?'],
                ['itsuki', 'Partner.'],
                ['lethe', '…Ugh. That’s so corny. Say it again.']
            ],
            forgehollow: [
                ['lethe', 'Itsuki. If I asked for a memory you really loved… would you give it to me?'],
                ['itsuki', 'Would you ask?'],
                ['lethe', '…No. I don’t think I would. Not anymore.']
            ],
            spire: []
        };
        await this.dialog.say(lines[isle]);
        if (addBond(s, `moment:${isle}`)) {
            sfx.success();
            this.toast('Bond with Lethe +1', 'pink');
        }
        this.refresh();
    }
}
