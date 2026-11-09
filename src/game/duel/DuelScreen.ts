// The code-duel screen, after the "Battle screen (playable)" design board.
import type { Vec3 } from 'playcanvas';

import { sfx } from '../audio';
import { CAST, portrait } from '../cast';
import { BASIC_RUNES, ICONS, RUNES, SENSORS } from '../data';
import type { RuneId, Sensor } from '../data';
import { canUseDevil, devilCost, playerMaxHp, slateLines, streakLevel } from '../state';
import type { GameState } from '../state';
import type { Stage } from '../ui/dom';
import { fill, h, icon } from '../ui/dom';

import type { Arena } from './Arena';
import {
    BASE_INK,
    RoundRunner,
    START_FOE,
    START_ME,
    applyInkBudget,
    isDevilLine,
    lineCode,
    lineCost,
    lineIcon,
    lineKind,
    lineLabel,
    lineTicks,
    newSim,
    slateInk
} from './engine';
import type { Line, Sim, TickResult } from './engine';
import { OPPONENTS, mirrorScript, visibleLines } from './opponents';
import type { OppDef, OppId } from './opponents';
import { parseScript } from './parse';
import type { Unlocks } from './parse';

export interface DuelOptions {
    opp: OppId;
    strong: boolean;
    allies: number;
    state: GameState;
    stage: Stage;
    arena: Arena;
    platform: string;
    project: (v: Vec3) => [number, number] | null;
    onEnd: (won: boolean) => void;
    onSave: () => void;
}

type Phase = 'write' | 'run' | 'roundEnd' | 'won' | 'lost';
type Builder =
    | null
    | { kind: 'if'; s: Sensor; a: RuneId; b: RuneId }
    | { kind: 'loop'; n: number; r: RuneId }
    | { kind: 'def'; name: string; body: RuneId[] }
    | { kind: 'recurse'; base: boolean };

export class DuelScreen {
    private o: DuelOptions;
    private def: OppDef;
    private layer: HTMLDivElement;
    private sim!: Sim;
    private round = 0;
    private phase: Phase = 'write';
    private slate: Line[] = [];
    private mode: 'runes' | 'script' = 'runes';
    private scriptText = '';
    private foeLines: Line[] = [];
    private visible = new Map<number, string>();
    private glitched = new Set<number>();
    private chained: number[] = [];
    private editUsed = false;
    private targeting = false;
    private runner: RoundRunner | null = null;
    private ink = BASE_INK;
    private log = '';
    private lethe = '';
    private prevSlate: Line[] | null = null;
    private builder: Builder = null;
    private recurseBase = false;
    private devilThisDuel = 0;
    private speed = 1;
    private lostReason = '';
    private ranMe = -1;
    private ranFoe = -1;
    private destroyed = false;

    private elTop!: HTMLDivElement;
    private elFoeScript!: HTMLDivElement;
    private elLethe!: HTMLDivElement;
    private elLog!: HTMLDivElement;
    private elBottom!: HTMLDivElement;
    private elOverlay!: HTMLDivElement;
    private elFloat!: HTMLDivElement;

    constructor(o: DuelOptions) {
        this.o = o;
        this.def = OPPONENTS[o.opp];
        this.layer = o.stage.layer('duel');
        this.slate = this.defaultSlate();
        this.build();
        o.arena.setup(this.def.speaker, streakLevel(o.state), o.platform);
        o.arena.onHit = (who, dmg, pos) => this.floater(who, dmg, pos);
        this.start();
    }

    private get foeName() {
        return CAST[this.def.speaker].name.split(' ')[0];
    }

    private defaultSlate(): Line[] {
        const max = slateLines(this.o.state);
        const last = this.o.state.lastSlate.filter((l) => !isDevilLine(l) && l.t !== 'sneeze' && l.t !== 'fizzle');
        if (last.length && slateInk(last) <= BASE_INK) return last.slice(0, max).filter((l) => this.allowed(l));
        return [];
    }

    private allowed(l: Line): boolean {
        const u = this.unlocks();
        switch (l.t) {
            case 'if':
                return u.choice;
            case 'loop':
                return u.echo;
            case 'call':
                return !!u.craft;
            case 'recurse':
                return u.self;
            case 'rune':
                return l.r === 'counter' ? u.name : l.r === 'key' ? u.key : true;
            default:
                return true;
        }
    }

    private unlocks(): Unlocks {
        const s = this.o.state;
        return {
            choice: s.slabs.includes('choice'),
            echo: s.slabs.includes('echo'),
            name: s.slabs.includes('name'),
            craft: s.slabs.includes('craft') ? s.craft : null,
            self: s.slabs.includes('self'),
            key: this.def.gimmick === 'deadlock',
            devil: true,
            recurseBase: this.recurseBase
        };
    }

    // -----------------------------------------------------------------------------------------
    // flow

    private start() {
        const s = this.o.state;
        const hp = this.o.strong && this.def.strongHp ? this.def.strongHp : this.def.hp;
        this.sim = newSim(playerMaxHp(s), hp, this.def.gimmick, this.def.foeBonus ?? 0, this.def.strikeBonus ?? 0);
        this.round = 0;
        this.prevSlate = null;
        this.lethe = this.def.lethe.hello;
        this.beginRound();
    }

    private beginRound() {
        const s = this.o.state;
        const ctx = {
            round: this.round,
            prevPlayer: this.prevSlate,
            lastSlate: s.lastSlate,
            usage: s.usage,
            strong: this.o.strong
        };
        this.foeLines = this.def.gimmick === 'mirror' ? mirrorScript(s.usage) : this.def.script(ctx);
        this.chained = this.def.chained ? this.def.chained(this.round) : [];
        this.sim.forbidden = this.def.forbidden ? this.def.forbidden(this.round) : [];
        this.sim.me.pos = { ...START_ME };
        this.sim.foe.pos = { ...START_FOE };
        this.sim.me.last = null;
        this.sim.foe.last = null;
        this.ink = BASE_INK + this.sim.inkBonusNext;
        this.sim.inkBonusNext = 0;
        this.visible = visibleLines(
            this.foeLines.length,
            this.def.tells + this.o.allies,
            this.round,
            !!this.def.allTells
        );
        this.glitched.clear();
        this.editUsed = false;
        this.targeting = false;
        this.runner = null;
        this.ranMe = -1;
        this.ranFoe = -1;
        this.phase = 'write';
        this.log =
            this.round === 0
                ? 'Write your Slate, then press RUN — both scripts execute at the same time.'
                : `Round ${this.round + 1}. Rewrite your Slate — what did you learn?`;
        if (this.round === 1) this.lethe = this.def.lethe.tip;
        if (this.def.gimmick === 'deadlock')
            this.lethe = `Lady Deadlock chained your lines ${this.chained[0] + 1} and ${this.chained[1] + 1}! Play a Key rune before them~`;
        while (slateInk(this.slate) > this.ink) this.slate.pop();
        this.o.arena.place(this.sim.me.pos, this.sim.foe.pos);
        this.o.arena.setTiles(this.sim.me.pos, this.sim.foe.pos, this.sim.forbidden);
        this.o.arena.setOverflow(0);
        this.render();
    }

    private inkUsed() {
        return slateInk(this.slate);
    }

    private pendingDevil() {
        return this.slate.filter(isDevilLine).length * devilCost(this.o.state);
    }

    private add(l: Line) {
        if (this.phase !== 'write' && this.phase !== 'roundEnd') return;
        if (this.phase === 'roundEnd') this.phase = 'write';
        const max = slateLines(this.o.state);
        if (this.slate.length >= max) {
            sfx.error();
            return;
        }
        if (lineCost(l) > this.ink - this.inkUsed()) {
            sfx.error();
            this.log = 'Out of Ink — that rune costs more than you have left this round.';
            this.render();
            return;
        }
        if (isDevilLine(l)) {
            if (!canUseDevil(this.o.state, this.pendingDevil())) {
                this.lethe = "You don't have anything left I can eat… no Hellflare for you.";
                sfx.error();
                this.render();
                return;
            }
            this.lethe = 'Hellflare? Ooh, then I get a memory~ Something sweet, please.';
            sfx.devil();
        } else sfx.click();
        this.slate.push(l);
        this.syncScriptText();
        this.render();
    }

    private remove(i: number) {
        if (this.phase !== 'write' && this.phase !== 'roundEnd') return;
        this.slate.splice(i, 1);
        sfx.close();
        this.syncScriptText();
        this.render();
    }

    private move(i: number, d: number) {
        const j = i + d;
        if (j < 0 || j >= this.slate.length || this.phase === 'run') return;
        [this.slate[i], this.slate[j]] = [this.slate[j], this.slate[i]];
        sfx.tick();
        this.syncScriptText();
        this.render();
    }

    private syncScriptText() {
        this.scriptText = this.slate.map(lineCode).join('\n');
    }

    private run() {
        if (this.phase === 'roundEnd') {
            this.beginRound();
            return;
        }
        if (this.phase !== 'write' || this.slate.length === 0) return;
        const s = this.o.state;
        // pay Lethe for devil runes as they are cast
        for (const l of this.slate) {
            if (isDevilLine(l)) this.payDevil();
            if (l.t !== 'sneeze' && l.t !== 'fizzle') {
                const k = JSON.stringify(l);
                s.usage[k] = (s.usage[k] ?? 0) + 1;
            }
        }
        s.lastSlate = this.slate.map((l) => JSON.parse(JSON.stringify(l)) as Line);
        this.prevSlate = s.lastSlate;
        const lines = applyInkBudget(this.slate, this.ink);
        this.runner = new RoundRunner(this.sim, lines, this.foeLines, {
            foeName: this.foeName,
            nullLines: this.def.gimmick === 'null',
            chained: this.chained,
            glitched: this.glitched
        });
        this.phase = 'run';
        this.targeting = false;
        this.lethe = 'Here we go! Watch both scripts run at the same time~';
        this.log = 'Running…';
        sfx.open();
        this.render();
        this.o.arena.tw.wait(0.35, () => this.step());
    }

    private payDevil() {
        const s = this.o.state;
        s.devilInk -= devilCost(s);
        s.devilUses += 1;
        this.devilThisDuel += 1;
        this.o.onSave();
    }

    private step() {
        if (this.destroyed || !this.runner) return;
        const res = this.runner.step();
        if (!res) {
            this.endRound();
            return;
        }
        this.ranMe = res.meLine;
        this.ranFoe = res.foeLine;
        this.log = `Tick ${this.runner.tick + 1} · ${res.text}`;
        if (this.def.gimmick === 'overflow') this.o.arena.setOverflow(this.sim.overflow);
        this.render();
        this.o.arena.play(res, this.sim.forbidden, () => {
            this.afterTick(res);
            this.o.arena.tw.wait(0.18, () => this.step());
        });
    }

    private afterTick(res: TickResult) {
        if (res.me.act === 'dizzy' && this.lethe.indexOf('base case') < 0)
            this.lethe = 'Stack Overflow! You forgot the base case — so dizzy~';
        if (res.me.act === 'sneeze') this.lethe = "Bless you! …That line wasn't valid script, Itsuki.";
        this.renderPanels();
    }

    private endRound() {
        const sim = this.sim;
        this.runner = null;
        if (sim.foe.hp <= 0) {
            this.phase = 'won';
            this.lethe = this.def.lethe.win;
            sfx.win();
        } else if (sim.me.hp <= 0) {
            this.phase = 'lost';
            this.lostReason = 'Itsuki is down — rewrite and retry';
            this.lethe = this.def.lethe.lose;
            sfx.lose();
        } else if (this.def.roundLimit && this.round + 1 >= this.def.roundLimit) {
            this.phase = 'lost';
            this.lostReason = `Out of rounds — the ${CAST[this.def.speaker].name} wins this trial`;
            this.lethe = this.def.lethe.lose;
            sfx.lose();
        } else {
            this.phase = 'roundEnd';
            this.round += 1;
            this.log = `Round over · You ${sim.me.hp} HP · ${this.foeName} ${sim.foe.hp} HP. Edit your Slate, then press NEXT ROUND.`;
            if (this.lethe.startsWith('Here we go'))
                this.lethe = this.editUsed
                    ? 'Not bad! Again, again~'
                    : `Round over! Next time, let me glitch one of ${this.foeName}'s lines for you~`;
        }
        this.render();
    }

    private devilEdit() {
        if (this.editUsed || this.phase === 'won' || this.phase === 'lost' || this.phase === 'roundEnd') return;
        if (!canUseDevil(this.o.state, this.phase === 'write' ? this.pendingDevil() : 0)) {
            this.lethe = "Nothing left I can eat… I can't edit for you anymore.";
            sfx.error();
            this.render();
            return;
        }
        if (this.phase === 'run' && this.runner) {
            const target = this.runner.nextFoeLine();
            if (target < 0) return;
            this.applyEdit(target);
            return;
        }
        this.targeting = !this.targeting;
        this.lethe = this.targeting
            ? "Pick one of their lines — I'll glitch it into nothing~"
            : 'Changed your mind? Fine~';
        sfx.devil();
        this.render();
    }

    private applyEdit(line: number) {
        this.glitched.add(line);
        this.editUsed = true;
        this.targeting = false;
        this.payDevil();
        sfx.chomp();
        const tastes = [
            'your first snowfall',
            'warm bread',
            'a lost button',
            'the smell of ink',
            'a summer nap',
            'mill-dust in sunlight'
        ];
        this.lethe = `Yum! That one tasted like… ${tastes[(this.round + line) % tastes.length]}. Their line ${line + 1} is glitched now~`;
        this.render();
    }

    private finish(won: boolean) {
        sfx.click();
        this.o.onEnd(won);
    }

    // -----------------------------------------------------------------------------------------
    // rendering

    private build() {
        this.elTop = h('div', { class: 'duel-top' });
        this.elLethe = h('div', { class: 'lethe-bubble duel-lethe' });
        this.elFoeScript = h('div', { class: 'panel foe-script' });
        this.elLog = h('div', { class: 'log-bar' });
        this.elBottom = h('div', { class: 'panel duel-bottom' });
        this.elOverlay = h('div', { class: 'duel-overlay' });
        this.elFloat = h('div', { class: 'floaters' });
        this.layer.append(
            this.elTop,
            this.elLethe,
            this.elFoeScript,
            this.elLog,
            this.elBottom,
            this.elFloat,
            this.elOverlay
        );
    }

    private render() {
        if (this.destroyed) return;
        this.renderPanels();
        this.renderFoeScript();
        this.renderBottom();
        this.renderOverlay();
    }

    private renderPanels() {
        const s = this.o.state;
        const sim = this.sim;
        const inkLeft = this.ink - this.inkUsed();
        const pips: HTMLElement[] = [];
        for (let i = 0; i < this.ink; i++) pips.push(h('span', { class: `pip ${i < inkLeft ? 'on' : ''}` }));
        let phase = 'WRITE YOUR SLATE';
        if (this.phase === 'run' && this.runner) phase = `RUN · TICK ${Math.max(1, this.runner.tick + 1)}`;
        else if (this.phase === 'roundEnd') phase = 'ROUND OVER';
        else if (this.phase === 'won') phase = 'VICTORY';
        else if (this.phase === 'lost') phase = 'DEFEAT';
        const foeAccent = CAST[this.def.speaker].accent;
        const limit = this.def.roundLimit ? ` · ${this.def.roundLimit} rounds` : '';
        this.elTop.replaceChildren(
            h('div', { class: 'panel duel-hp me' }, [
                h('div', { class: 'avatar', html: portrait('itsuki', 120, streakLevel(s)) }),
                h('div', { class: 'hp-col' }, [
                    h('div', { class: 'hp-row' }, [
                        h('b', { text: 'Itsuki' }),
                        h('span', { class: 'hp-num cyan', text: `HP ${sim.me.hp} / ${sim.me.maxHp}` })
                    ]),
                    h('div', { class: 'bar' }, [
                        h('div', {
                            class: 'fill',
                            style: `width:${(sim.me.hp / sim.me.maxHp) * 100}%;background:#5ED6E8`
                        })
                    ]),
                    h('div', { class: 'ink-row' }, [
                        h('span', { class: 'cap', text: `INK ${inkLeft}/${this.ink}` }),
                        h('div', { class: 'pips' }, pips),
                        h('span', { class: 'cap pink devil-ink', text: `DEVIL INK ${s.devilInk}` })
                    ])
                ])
            ]),
            h('div', { class: 'duel-title' }, [
                h('span', { class: 'round', text: `ROUND ${this.round + 1}` }),
                h('span', { class: 'phase', text: phase }),
                h('span', { class: 'sub', text: `${this.def.kind} · ${this.def.place}${limit}` }),
                this.def.gimmick !== 'none' ? h('span', { class: 'gimmick', text: this.def.gimmickText }) : null
            ]),
            h('div', { class: 'panel duel-hp foe' }, [
                h('div', {
                    class: 'avatar',
                    style: `border-color:${foeAccent}`,
                    html: portrait(this.def.speaker, 120)
                }),
                h('div', { class: 'hp-col' }, [
                    h('div', { class: 'hp-row' }, [
                        h('span', { class: 'hp-num', text: `HP ${sim.foe.hp} / ${sim.foe.maxHp}` }),
                        h('b', { text: CAST[this.def.speaker].name })
                    ]),
                    h('div', { class: 'bar rev' }, [
                        h('div', {
                            class: 'fill',
                            style: `width:${(sim.foe.hp / sim.foe.maxHp) * 100}%;background:${foeAccent}`
                        })
                    ]),
                    h('div', {
                        class: 'cap right',
                        text:
                            CAST[this.def.speaker].role.toUpperCase() +
                            (this.def.gimmick === 'overflow' ? ` · SWELL ${this.sim.overflow}/6` : '')
                    })
                ])
            ])
        );
        this.elLethe.replaceChildren(h('span', { class: 'who', text: 'LETHE' }), h('span', { text: this.lethe }));
        this.elLog.textContent = this.log;
    }

    private renderFoeScript() {
        const rows = this.foeLines.map((l, i) => {
            const ran =
                this.phase !== 'write' &&
                (this.ranFoe >= i || this.phase === 'won' || this.phase === 'lost' || this.phase === 'roundEnd');
            const lit = this.phase === 'run' && this.ranFoe === i;
            const glitched = this.glitched.has(i);
            const tag = this.visible.get(i);
            const shown = !!tag || ran;
            let cls = 'foe-line';
            if (shown) cls += ' shown';
            if (lit) cls += ' lit';
            if (glitched) cls += ' glitched';
            if (this.targeting && !glitched) cls += ' target';
            const label = glitched ? 'GLITCHED' : shown ? lineLabel(l).toUpperCase() : '? ? ?';
            let t = '';
            if (glitched) t = "Devil's Edit";
            else if (ran) t = 'ran';
            else if (tag) t = tag;
            if (lineTicks(l) > 1 && shown) t += `${t ? ' · ' : ''}${lineTicks(l)} ticks`;
            return h(
                'button',
                {
                    class: cls,
                    disabled: !this.targeting || glitched,
                    on: { click: () => this.targeting && this.applyEdit(i) }
                },
                [
                    h('span', { class: 'n', text: String(i + 1) }),
                    h('span', { class: 'txt', text: label }),
                    h('span', { class: 'tag', text: t })
                ]
            );
        });
        fill(this.elFoeScript, [
            h('div', { class: 'head' }, [
                h('span', { class: 'cap', text: `${this.foeName.toUpperCase()}'S SCRIPT` }),
                h('span', {
                    class: 'cap dim',
                    text: this.targeting ? 'click a line to glitch it' : 'what you can read'
                })
            ]),
            ...rows,
            this.sim.forbidden.length
                ? h('div', { class: 'note green', text: 'Green cells are forbidden: melee aimed there crashes.' })
                : null
        ]);
    }

    private renderBottom() {
        const s = this.o.state;
        const max = slateLines(s);
        const editable = this.phase === 'write' || this.phase === 'roundEnd';
        const live = this.phase !== 'write';
        // --- slate
        const tabs = h('div', { class: 'seg' }, [
            h('button', {
                class: this.mode === 'runes' ? 'on' : '',
                text: 'Runes',
                on: { click: () => this.setMode('runes') }
            }),
            h('button', {
                class: this.mode === 'script' ? 'on' : '',
                text: 'Script',
                on: { click: () => this.setMode('script') }
            })
        ]);
        let slateBody: HTMLElement;
        if (this.mode === 'runes') {
            const rows: HTMLElement[] = [];
            for (let i = 0; i < max; i++) {
                const l = this.slate[i];
                const chained = this.chained.includes(i);
                if (!l) {
                    rows.push(
                        h('div', { class: `slot empty ${chained ? 'chained' : ''}` }, [
                            h('span', { class: 'n', text: String(i + 1) }),
                            h('span', { text: chained ? '⛓ chained line — empty' : 'empty line' })
                        ])
                    );
                    continue;
                }
                const erased = this.runner?.erased.has(i) ?? false;
                let cls = `slot ${lineKind(l)}`;
                if (live && this.ranMe > i) cls += ' ran';
                if (this.phase === 'run' && this.ranMe === i) cls += ' lit';
                if (erased) cls += ' erased';
                if (chained) cls += ' chained';
                const over = editable && slateInk(this.slate.slice(0, i + 1)) > this.ink;
                rows.push(
                    h('div', { class: cls }, [
                        h('span', { class: 'n', text: String(i + 1) }),
                        h('span', { class: 'ic', html: icon(lineIcon(l), 16) }),
                        h('span', {
                            class: 'lbl',
                            text: (chained ? '⛓ ' : '') + lineLabel(l) + (over ? ' · fizzles' : '')
                        }),
                        h('span', {
                            class: 'cost',
                            text: isDevilLine(l) ? `${devilCost(s)} devil ink` : `${lineCost(l)} ink`
                        }),
                        editable
                            ? h('button', {
                                  class: 'mini',
                                  html: '↑',
                                  attrs: { 'aria-label': `Move line ${i + 1} up` },
                                  on: { click: () => this.move(i, -1) }
                              })
                            : null,
                        editable
                            ? h('button', {
                                  class: 'mini',
                                  html: '↓',
                                  attrs: { 'aria-label': `Move line ${i + 1} down` },
                                  on: { click: () => this.move(i, 1) }
                              })
                            : null,
                        editable
                            ? h('button', {
                                  class: 'mini x',
                                  html: '✕',
                                  attrs: { 'aria-label': `Remove line ${i + 1}` },
                                  on: { click: () => this.remove(i) }
                              })
                            : null
                    ])
                );
            }
            slateBody = h('div', { class: `slots n${max}` }, rows);
        } else {
            slateBody = this.renderScriptEditor(max, editable);
        }
        const slate = h('div', { class: 'slate' }, [
            h('div', { class: 'row-head' }, [
                h('span', { class: 'cap', text: `YOUR SLATE · ${max} LINES` }),
                tabs,
                h('span', {
                    class: 'cap dim push',
                    text: this.mode === 'runes' ? '✕ removes · ↑↓ reorder' : 'type python-ish runes'
                })
            ]),
            slateBody
        ]);
        // --- palette
        const u = this.unlocks();
        const inkLeft = this.ink - this.inkUsed();
        const full = this.slate.length >= max;
        const tiles: HTMLElement[] = [];
        const tile = (
            label: string,
            note: string,
            ic: string,
            cls: string,
            cost: number,
            onClick: () => void,
            devil = false
        ) => {
            const disabled = !editable || full || cost > inkLeft || (devil && !canUseDevil(s, this.pendingDevil()));
            tiles.push(
                h(
                    'button',
                    {
                        class: `rune ${cls}`,
                        disabled,
                        attrs: { 'aria-label': `${label}, ${note}` },
                        on: { click: onClick }
                    },
                    [
                        h('span', { class: 'ic', html: icon(ic, 22) }),
                        h('span', { class: 'rt' }, [h('b', { text: label }), h('span', { text: note })])
                    ]
                )
            );
        };
        for (const r of BASIC_RUNES)
            tile(RUNES[r].label, RUNES[r].note, RUNES[r].icon, 'basic', RUNES[r].cost, () =>
                this.add({ t: 'rune', r })
            );
        if (u.key) tile('Key', RUNES.key.note, RUNES.key.icon, 'construct', 1, () => this.add({ t: 'rune', r: 'key' }));
        if (u.choice)
            tile('If / else…', 'sensor picks a rune', ICONS.iff, 'construct', 1, () => this.openBuilder('if'));
        if (u.echo) tile('Loop ×n…', 'rune cost + 1', ICONS.loop, 'construct', 1, () => this.openBuilder('loop'));
        if (u.name)
            tile('Counter', RUNES.counter.note, RUNES.counter.icon, 'construct', 1, () =>
                this.add({ t: 'rune', r: 'counter' })
            );
        if (s.slabs.includes('craft')) {
            if (s.craft) {
                const c = s.craft;
                const cost = c.body.reduce((n, r) => n + RUNES[r].cost, 0);
                tile(`${c.name}()`, `${cost} ink · ${c.body.length} ticks`, ICONS.def, 'construct', cost, () =>
                    this.add({ t: 'call', name: c.name, body: c.body.slice() })
                );
            }
            tile('def…', s.craft ? 'redefine your rune' : 'craft your own rune', ICONS.def, 'construct', 0, () =>
                this.openBuilder('def')
            );
        }
        if (u.self)
            tile('fractal(3)…', '3 ink · bolts 3, 2, 1', ICONS.recurse, 'construct', 3, () =>
                this.openBuilder('recurse')
            );
        tile(
            'Hellflare',
            `0 ink · 4 dmg · ${devilCost(s)} devil ink`,
            ICONS.hellflare,
            'devil',
            0,
            () => this.add({ t: 'rune', r: 'hellflare' }),
            true
        );
        const palette = h('div', { class: 'palette' }, [
            h('div', { class: 'row-head' }, [
                h('span', { class: 'cap', text: 'RUNES · CLICK TO ADD' }),
                h('span', { class: 'cap dim', text: 'cyan = construct · pink = devil' })
            ]),
            h('div', { class: `tiles ${tiles.length > 12 ? 'dense' : ''}` }, tiles)
        ]);
        // --- actions
        const runDisabled =
            this.phase === 'run' ||
            this.phase === 'won' ||
            this.phase === 'lost' ||
            (this.phase === 'write' && this.slate.length === 0);
        const runLabel = this.phase === 'run' ? 'RUNNING' : this.phase === 'roundEnd' ? 'NEXT ROUND' : 'RUN';
        const devilDisabled =
            this.editUsed ||
            this.phase === 'won' ||
            this.phase === 'lost' ||
            this.phase === 'roundEnd' ||
            !canUseDevil(s, this.phase === 'write' ? this.pendingDevil() : 0);
        const actions = h('div', { class: 'actions' }, [
            h(
                'button',
                { class: `run ${runDisabled ? '' : 'go'}`, disabled: runDisabled, on: { click: () => this.run() } },
                [
                    h('span', {
                        html: '<svg width="20" height="20" viewBox="0 0 24 24" style="fill:currentColor"><path d="M7 4l13 8-13 8z"/></svg>'
                    }),
                    h('span', { text: runLabel })
                ]
            ),
            h(
                'button',
                {
                    class: `devil-edit ${this.targeting ? 'armed' : ''}`,
                    disabled: devilDisabled,
                    on: { click: () => this.devilEdit() }
                },
                [
                    h('b', { text: this.targeting ? 'Pick a line…' : "Devil's Edit" }),
                    h('span', {
                        text:
                            this.phase === 'run'
                                ? `glitch their next line · ${devilCost(s)} devil ink`
                                : `glitch one of their lines · ${devilCost(s)} devil ink`
                    })
                ]
            ),
            h('div', { class: 'row2' }, [
                h('button', {
                    class: 'ghost',
                    text: 'Clear slate',
                    disabled: !editable,
                    on: { click: () => this.clearSlate() }
                }),
                h('button', { class: 'ghost', text: `Speed ${this.speed}×`, on: { click: () => this.toggleSpeed() } })
            ]),
            h('div', {
                class: 'paid',
                html: `Devil powers used this duel: <b>${this.devilThisDuel}</b>${s.devilInk < 0 ? ` · <b>owed ${-s.devilInk}</b>` : ''}`
            })
        ]);
        this.elBottom.replaceChildren(slate, palette, actions);
        if (this.builder) this.elBottom.append(this.renderBuilder());
    }

    private renderScriptEditor(max: number, editable: boolean): HTMLElement {
        const ta = h('textarea', {
            class: 'script',
            attrs: { spellcheck: 'false', rows: String(max), 'aria-label': 'Script editor' }
        });
        ta.value = this.scriptText;
        ta.disabled = !editable;
        const parsed = h('div', { class: 'parsed' });
        const fill = () => {
            const lines = this.slate;
            parsed.replaceChildren(
                ...lines.map((l, i) => {
                    const over = slateInk(lines.slice(0, i + 1)) > this.ink;
                    const cls = l.t === 'sneeze' ? 'bad' : over ? 'warn' : lineKind(l);
                    const txt =
                        l.t === 'sneeze'
                            ? 'Syntax Slip → sneeze'
                            : over
                              ? 'Out of Ink → fizzles'
                              : `${lineLabel(l)} · ${isDevilLine(l) ? 'devil' : lineCost(l) + ' ink'}`;
                    return h('div', { class: `p ${cls}` }, [
                        h('span', { class: 'n', text: String(i + 1) }),
                        h('span', { text: txt })
                    ]);
                })
            );
        };
        ta.addEventListener('input', () => {
            this.scriptText = ta.value;
            this.slate = parseScript(ta.value, this.unlocks(), max);
            fill();
            this.renderPanels();
        });
        ta.addEventListener('keydown', (e) => e.stopPropagation());
        fill();
        const help = h('div', {
            class: 'script-help',
            text:
                'move(→) strike() guard() bolt() charge() focus()' +
                (this.unlocks().choice ? ' · if foe.guarding: charge() else: strike()' : '') +
                (this.unlocks().echo ? ' · loop 2: bolt()' : '')
        });
        return h('div', { class: 'script-wrap' }, [h('div', { class: 'script-cols' }, [ta, parsed]), help]);
    }

    private setMode(m: 'runes' | 'script') {
        if (m === this.mode) return;
        this.mode = m;
        if (m === 'script') this.syncScriptText();
        sfx.click();
        this.render();
    }

    private clearSlate() {
        this.slate = [];
        this.scriptText = '';
        sfx.close();
        this.render();
    }

    private toggleSpeed() {
        this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
        this.o.arena.speed = this.speed;
        this.render();
    }

    // -----------------------------------------------------------------------------------------
    // construct builders

    private openBuilder(kind: 'if' | 'loop' | 'def' | 'recurse') {
        if (kind === 'if') this.builder = { kind, s: 'guarding', a: 'charge', b: 'strike' };
        else if (kind === 'loop') this.builder = { kind, n: 2, r: 'bolt' };
        else if (kind === 'def')
            this.builder = {
                kind,
                name: this.o.state.craft?.name ?? 'flurry',
                body: this.o.state.craft?.body.slice() ?? []
            };
        else this.builder = { kind, base: this.recurseBase };
        sfx.open();
        this.render();
    }

    private builderLine(): Line | null {
        const b = this.builder;
        if (!b) return null;
        if (b.kind === 'if') return { t: 'if', s: b.s, a: b.a, b: b.b };
        if (b.kind === 'loop') return { t: 'loop', n: b.n, r: b.r };
        if (b.kind === 'recurse') return { t: 'recurse', n: 3, base: b.base };
        return null;
    }

    private renderBuilder(): HTMLElement {
        const b = this.builder!;
        const runePills = (sel: RuneId | null, onPick: (r: RuneId) => void) =>
            h(
                'div',
                { class: 'pills' },
                BASIC_RUNES.map((r) =>
                    h('button', {
                        class: `pill ${sel === r ? 'on' : ''}`,
                        text: RUNES[r].label,
                        on: { click: () => (onPick(r), this.render()) }
                    })
                )
            );
        const body: HTMLElement[] = [];
        let code = '';
        let title = '';
        let addLabel = 'Add to Slate';
        let canAdd = true;
        if (b.kind === 'if') {
            title = 'If / else · Slab of Choice';
            body.push(
                h('div', { class: 'cap', text: 'IF' }),
                h(
                    'div',
                    { class: 'pills' },
                    (Object.keys(SENSORS) as Sensor[]).map((sn) =>
                        h('button', {
                            class: `pill ${b.s === sn ? 'on' : ''}`,
                            title: SENSORS[sn].hint,
                            text: SENSORS[sn].label,
                            on: { click: () => ((b.s = sn), this.render()) }
                        })
                    )
                ),
                h('div', { class: 'cap', text: 'THEN' }),
                runePills(b.a, (r) => (b.a = r)),
                h('div', { class: 'cap', text: 'ELSE' }),
                runePills(b.b, (r) => (b.b = r))
            );
            code = `if ${SENSORS[b.s].code}:\n  ${RUNES[b.a].code}\nelse:\n  ${RUNES[b.b].code}`;
        } else if (b.kind === 'loop') {
            title = 'Loop · Slab of Echo';
            body.push(
                h('div', { class: 'cap', text: 'REPEAT' }),
                h(
                    'div',
                    { class: 'pills' },
                    [2, 3].map((n) =>
                        h('button', {
                            class: `pill ${b.n === n ? 'on' : ''}`,
                            text: `×${n}`,
                            on: { click: () => ((b.n = n), this.render()) }
                        })
                    )
                ),
                h('div', { class: 'cap', text: 'RUNE' }),
                runePills(b.r, (r) => (b.r = r))
            );
            code = `loop ${b.n}:\n  ${RUNES[b.r].code}`;
        } else if (b.kind === 'def') {
            title = 'def · Slab of Craft';
            addLabel = 'Save rune';
            canAdd = b.body.length >= 2 && /^[a-z_][a-z0-9_]{0,11}$/i.test(b.name);
            const nameIn = h('input', {
                class: 'name-in',
                attrs: { maxlength: '12', 'aria-label': 'Rune name', spellcheck: 'false' }
            });
            nameIn.value = b.name;
            nameIn.addEventListener('input', () => {
                b.name = nameIn.value.replace(/[^a-z0-9_]/gi, '').toLowerCase();
            });
            nameIn.addEventListener('change', () => this.render());
            nameIn.addEventListener('keydown', (e) => e.stopPropagation());
            body.push(
                h('div', { class: 'cap', text: 'NAME' }),
                nameIn,
                h('div', { class: 'cap', text: `BODY · ${b.body.length}/3 RUNES` }),
                runePills(null, (r) => {
                    if (b.body.length < 3) b.body.push(r);
                }),
                h('button', {
                    class: 'ghost small',
                    text: 'Clear body',
                    on: { click: () => ((b.body = []), this.render()) }
                })
            );
            code = `def ${b.name || '???'}():\n${b.body.map((r) => '  ' + RUNES[r].code).join('\n') || '  …'}`;
        } else {
            title = 'fractal · Slab of Self';
            const cb = h('input', { attrs: { type: 'checkbox', id: 'basecase' } });
            cb.checked = b.base;
            cb.addEventListener('change', () => {
                b.base = cb.checked;
                this.render();
            });
            body.push(
                h('label', { class: 'check' }, [cb, h('span', { text: 'include the base case: if n == 0: return' })]),
                h('div', {
                    class: 'note',
                    text: 'Without a base case the spell keeps calling itself: Stack Overflow, dizzy for two ticks.'
                })
            );
            code = `def fractal(n):\n${b.base ? '  if n == 0: return\n' : ''}  bolt(n)\n  fractal(n - 1)\n\nfractal(3)`;
        }
        const line = this.builderLine();
        const cost = line ? lineCost(line) : 0;
        const inkOk = !line || cost <= this.ink - this.inkUsed();
        return h('div', { class: 'builder panel' }, [
            h('div', { class: 'b-head' }, [
                h('b', { text: title }),
                line ? h('span', { class: 'cap', text: `${cost} ink · ${lineTicks(line)} ticks · 1 line` }) : null
            ]),
            h('div', { class: 'b-body' }, [
                h('div', { class: 'b-left' }, body),
                h('pre', { class: 'code', text: code })
            ]),
            h('div', { class: 'b-actions' }, [
                h('button', {
                    class: 'ghost',
                    text: 'Cancel',
                    on: { click: () => ((this.builder = null), sfx.close(), this.render()) }
                }),
                h('button', {
                    class: 'primary',
                    text: inkOk ? addLabel : 'Not enough ink',
                    disabled: !canAdd || !inkOk,
                    on: { click: () => this.confirmBuilder() }
                })
            ])
        ]);
    }

    private confirmBuilder() {
        const b = this.builder;
        if (!b) return;
        if (b.kind === 'def') {
            this.o.state.craft = { name: b.name, body: b.body.slice() };
            this.slate = this.slate.map((l) =>
                l.t === 'call' ? { t: 'call', name: b.name, body: b.body.slice() } : l
            );
            this.builder = null;
            sfx.success();
            this.lethe = `${b.name}()! A rune with your name on it~`;
            this.o.onSave();
            this.render();
            return;
        }
        if (b.kind === 'recurse') this.recurseBase = b.base;
        const line = this.builderLine();
        this.builder = null;
        if (line) this.add(line);
        else this.render();
    }

    // -----------------------------------------------------------------------------------------

    private renderOverlay() {
        this.elOverlay.replaceChildren();
        if (this.phase === 'won') {
            this.elOverlay.append(
                h('div', { class: 'result win' }, [
                    h('div', { text: `${CAST[this.def.speaker].name} is out of HP — you win!` }),
                    h('button', { class: 'primary big', text: 'Continue', on: { click: () => this.finish(true) } })
                ])
            );
        } else if (this.phase === 'lost') {
            this.elOverlay.append(
                h('div', { class: 'result lose' }, [
                    h('div', { text: this.lostReason }),
                    h('div', { class: 'row' }, [
                        h('button', {
                            class: 'primary big',
                            text: 'Retry duel',
                            on: { click: () => (sfx.click(), this.start()) }
                        }),
                        h('button', { class: 'ghost big', text: 'Retreat', on: { click: () => this.finish(false) } })
                    ])
                ])
            );
        }
    }

    private floater(who: 'me' | 'foe', dmg: number, pos: Vec3) {
        const p = this.o.project(pos);
        if (!p) return;
        const el = h('div', { class: `floater ${who}`, text: `−${dmg}`, style: `left:${p[0]}px;top:${p[1]}px` });
        this.elFloat.append(el);
        setTimeout(() => el.remove(), 1100);
    }

    handleKey(e: KeyboardEvent): boolean {
        if (e.code === 'Enter' || e.code === 'Space') {
            if (this.phase === 'won') this.finish(true);
            else if (this.phase === 'write' || this.phase === 'roundEnd') this.run();
            return true;
        }
        if (e.code === 'Escape' && this.builder) {
            this.builder = null;
            this.render();
            return true;
        }
        return false;
    }

    destroy() {
        this.destroyed = true;
        this.o.arena.tw.clear();
        this.o.arena.onHit = null;
        this.layer.remove();
    }
}
