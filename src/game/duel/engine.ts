// Pure code-duel simulation: two Slates run at once, one op per tick, on a 5 × 3 arena.
import { RUNES, SENSORS } from '../data';
import type { RuneId, Sensor } from '../data';

export const COLS = 5;
export const ROWS = 3;
export const BASE_INK = 10;

export type Line =
    | { t: 'rune'; r: RuneId }
    | { t: 'if'; s: Sensor; a: RuneId; b: RuneId }
    | { t: 'loop'; n: number; r: RuneId }
    | { t: 'call'; name: string; body: RuneId[] }
    | { t: 'recurse'; n: number; base: boolean }
    | { t: 'sneeze'; src: string }
    | { t: 'fizzle'; of: Line }
    | { t: 'blink' };

export type Act = RuneId | 'idle' | 'glitch' | 'dizzy' | 'sneeze' | 'chained' | 'blink' | 'fizzle';

export interface Op {
    line: number;
    kind: 'rune' | 'if' | 'dizzy' | 'sneeze' | 'blink' | 'fizzle';
    r?: RuneId;
    s?: Sensor;
    a?: RuneId;
    b?: RuneId;
    power?: number;
}

export interface Cell {
    c: number;
    r: number;
}

export interface Fighter {
    hp: number;
    maxHp: number;
    pos: Cell;
    last: Act | null;
}

export type Gimmick = 'none' | 'overflow' | 'segfault' | 'deadlock' | 'null' | 'copycat' | 'mirror';

export interface Sim {
    me: Fighter;
    foe: Fighter;
    gimmick: Gimmick;
    foeBonus: number;
    strikeBonus: number;
    overflow: number;
    forbidden: Cell[];
    keyUsed: boolean;
    inkBonusNext: number;
}

export interface SideOut {
    act: Act;
    from: Cell;
    to: Cell;
    dmg: number;
    hit: boolean;
    whiff: boolean;
    crash: boolean;
    blocked: boolean;
    interrupted: boolean;
    bumped: boolean;
    power: number;
    branch: string;
}

export interface TickResult {
    me: SideOut;
    foe: SideOut;
    text: string;
    burst: boolean;
    meLine: number;
    foeLine: number;
    erased: number;
}

export const START_ME: Cell = { c: 1, r: 1 };
export const START_FOE: Cell = { c: 3, r: 1 };

// ---------------------------------------------------------------------------------------------
// Lines

const runeCost = (r: RuneId) => RUNES[r].cost;

export function lineCost(l: Line): number {
    switch (l.t) {
        case 'rune':
            return runeCost(l.r);
        case 'if':
            return Math.max(runeCost(l.a), runeCost(l.b)) + 1;
        case 'loop':
            return runeCost(l.r) + 1;
        case 'call':
            return l.body.reduce((n, r) => n + runeCost(r), 0);
        case 'recurse':
            return 3;
        default:
            return 0;
    }
}

export function isDevilLine(l: Line): boolean {
    return l.t === 'rune' && RUNES[l.r].kind === 'devil';
}

export function lineKind(l: Line): 'basic' | 'construct' | 'devil' | 'broken' {
    if (l.t === 'sneeze' || l.t === 'fizzle') return 'broken';
    if (l.t === 'rune')
        return RUNES[l.r].kind === 'devil' ? 'devil' : RUNES[l.r].kind === 'construct' ? 'construct' : 'basic';
    return 'construct';
}

const shortRune = (r: RuneId) => RUNES[r].label;

export function lineLabel(l: Line): string {
    switch (l.t) {
        case 'rune':
            return shortRune(l.r);
        case 'if':
            return `If ${SENSORS[l.s].label} → ${shortRune(l.a)} · else ${shortRune(l.b)}`;
        case 'loop':
            return `Loop ×${l.n} → ${shortRune(l.r)}`;
        case 'call':
            return `${l.name}() · ${l.body.map(shortRune).join(', ')}`;
        case 'recurse':
            return `fractal(${l.n})${l.base ? ' · base case ✓' : ' · no base case!'}`;
        case 'sneeze':
            return `Syntax Slip · “${l.src}”`;
        case 'fizzle':
            return `Out of Ink · ${lineLabel(l.of)}`;
        case 'blink':
            return 'Blink';
    }
}

export function lineIcon(l: Line): string {
    switch (l.t) {
        case 'rune':
            return RUNES[l.r].icon;
        case 'if':
            return 'M6 4v16M6 12c0-4 4-6 12-6M15 3l3 3-3 3';
        case 'loop':
            return 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4';
        case 'call':
            return 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16';
        case 'recurse':
            return 'M4 4h16v16H4zM8 8h8v8H8zM11 11h2v2h-2z';
        case 'blink':
            return 'M4 12h4M16 12h4M12 4v4M12 16v4';
        default:
            return 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M9 10h.01M15 10h.01M9 15c2 1 4 1 6 0';
    }
}

export function lineCode(l: Line): string {
    switch (l.t) {
        case 'rune':
            return RUNES[l.r].code;
        case 'if':
            return `if ${SENSORS[l.s].code}: ${RUNES[l.a].code} else: ${RUNES[l.b].code}`;
        case 'loop':
            return `loop ${l.n}: ${RUNES[l.r].code}`;
        case 'call':
            return `${l.name}()`;
        case 'recurse':
            return `fractal(${l.n})`;
        case 'sneeze':
            return l.src;
        case 'fizzle':
            return lineCode(l.of);
        case 'blink':
            return 'blink()';
    }
}

/** Number of ticks a line will take. */
export function lineTicks(l: Line): number {
    switch (l.t) {
        case 'loop':
            return l.n;
        case 'call':
            return l.body.length;
        case 'recurse':
            return l.n + (l.base ? 0 : 2);
        default:
            return 1;
    }
}

export function expand(lines: Line[]): Op[] {
    const ops: Op[] = [];
    lines.forEach((l, i) => {
        switch (l.t) {
            case 'rune':
                ops.push({ line: i, kind: 'rune', r: l.r });
                break;
            case 'if':
                ops.push({ line: i, kind: 'if', s: l.s, a: l.a, b: l.b });
                break;
            case 'loop':
                for (let k = 0; k < l.n; k++) ops.push({ line: i, kind: 'rune', r: l.r });
                break;
            case 'call':
                for (const r of l.body) ops.push({ line: i, kind: 'rune', r });
                break;
            case 'recurse':
                for (let k = l.n; k >= 1; k--) ops.push({ line: i, kind: 'rune', r: 'bolt', power: k });
                if (!l.base) {
                    ops.push({ line: i, kind: 'dizzy' });
                    ops.push({ line: i, kind: 'dizzy' });
                }
                break;
            case 'sneeze':
                ops.push({ line: i, kind: 'sneeze' });
                break;
            case 'fizzle':
                ops.push({ line: i, kind: 'fizzle' });
                break;
            case 'blink':
                ops.push({ line: i, kind: 'blink' });
                break;
        }
    });
    return ops.slice(0, 14);
}

/** Replace lines that go over the Ink budget with fizzles ("Out of Ink — the line fizzles"). */
export function applyInkBudget(lines: Line[], ink: number): Line[] {
    let left = ink;
    return lines.map((l) => {
        const c = lineCost(l);
        if (c > left) return { t: 'fizzle', of: l } as Line;
        left -= c;
        return l;
    });
}

export function slateInk(lines: Line[]): number {
    return lines.reduce((n, l) => n + lineCost(l), 0);
}

// ---------------------------------------------------------------------------------------------
// Sim

export function newSim(meHp: number, foeHp: number, gimmick: Gimmick, foeBonus = 0, strikeBonus = 0): Sim {
    return {
        me: { hp: meHp, maxHp: meHp, pos: { ...START_ME }, last: null },
        foe: { hp: foeHp, maxHp: foeHp, pos: { ...START_FOE }, last: null },
        gimmick,
        foeBonus,
        strikeBonus,
        overflow: 0,
        forbidden: [],
        keyUsed: false,
        inkBonusNext: 0
    };
}

const DIRS: Partial<Record<Act, [number, number]>> = {
    moveR: [1, 0],
    moveL: [-1, 0],
    moveU: [0, -1],
    moveD: [0, 1]
};

const cheb = (a: Cell, b: Cell) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));
export const sameCell = (a: Cell, b: Cell) => a.c === b.c && a.r === b.r;
const inBounds = (p: Cell) => p.c >= 0 && p.c < COLS && p.r >= 0 && p.r < ROWS;

export function counterOf(a: Act | null): RuneId {
    switch (a) {
        case 'strike':
        case 'bolt':
        case 'hellflare':
            return 'guard';
        case 'charge':
            return 'strike';
        case 'guard':
            return 'charge';
        case 'moveR':
        case 'moveL':
        case 'moveU':
        case 'moveD':
        case 'blink':
            return 'bolt';
        case null:
            return 'guard';
        default:
            return 'strike';
    }
}

function sensor(s: Sensor, self: Fighter, other: Fighter, otherAct: Act | null): boolean {
    switch (s) {
        case 'guarding':
            return otherAct === 'guard';
        case 'adjacent':
            return cheb(self.pos, other.pos) <= 1;
        case 'inRow':
            return self.pos.r === other.pos.r;
        case 'hurt':
            return self.hp <= Math.ceil(self.maxHp / 2);
    }
}

interface Pre {
    act: Act | null;
    branch: string;
    power: number;
}

function pre(op: Op | null, self: Fighter, other: Fighter): Pre {
    if (!op) return { act: 'idle', branch: '', power: 1 };
    switch (op.kind) {
        case 'dizzy':
            return { act: 'dizzy', branch: '', power: 1 };
        case 'sneeze':
            return { act: 'sneeze', branch: '', power: 1 };
        case 'fizzle':
            return { act: 'fizzle', branch: '', power: 1 };
        case 'blink':
            return { act: 'blink', branch: '', power: 1 };
        case 'rune':
            if (op.r === 'counter') {
                const r = counterOf(other.last);
                return { act: r, branch: `last = ${other.last ?? 'nothing'} → ${RUNES[r].code}`, power: 1 };
            }
            return { act: op.r ?? 'idle', branch: '', power: op.power ?? 1 };
        case 'if': {
            if (op.s === 'guarding') return { act: null, branch: '', power: 1 };
            const v = sensor(op.s!, self, other, null);
            const r = v ? op.a! : op.b!;
            return { act: r, branch: `if ${SENSORS[op.s!].code} → ${v} → ${RUNES[r].code}`, power: 1 };
        }
    }
}

function resolveIfGuarding(op: Op, self: Fighter, other: Fighter, otherAct: Act | null): Pre {
    const v = sensor('guarding', self, other, otherAct);
    const r = v ? op.a! : op.b!;
    return { act: r, branch: `if foe.guarding → ${v} → ${RUNES[r].code}`, power: 1 };
}

interface AttackRes {
    toOther: number;
    toSelf: number;
    hit: boolean;
    whiff: boolean;
    crash: boolean;
    blockedByOther: boolean;
    interrupted: boolean;
}

const chargeValid = (act: Act, from: Cell, otherFrom: Cell) => act === 'charge' && from.r === otherFrom.r;

function isForbidden(sim: Sim, cell: Cell) {
    return sim.forbidden.some((f) => sameCell(f, cell));
}

function attack(
    sim: Sim,
    aAct: Act,
    aFrom: Cell,
    bAct: Act,
    bFrom: Cell,
    bTo: Cell,
    bonus: number,
    strikeBonus: number,
    power: number,
    targetIsFoe: boolean
): AttackRes {
    const res: AttackRes = {
        toOther: 0,
        toSelf: 0,
        hit: false,
        whiff: false,
        crash: false,
        blockedByOther: false,
        interrupted: false
    };
    const bMoved = !sameCell(bFrom, bTo);
    const crashCell = (c: Cell) => targetIsFoe && isForbidden(sim, c);
    switch (aAct) {
        case 'strike': {
            if (chargeValid(bAct, bFrom, aFrom)) {
                res.toOther = (2 + bonus + strikeBonus) * 2;
                res.hit = true;
                break;
            }
            if (cheb(aFrom, bFrom) > 1) {
                res.whiff = true;
                break;
            }
            if (crashCell(bFrom)) {
                res.crash = true;
                break;
            }
            if (bMoved) {
                res.whiff = true;
                break;
            }
            if (bAct === 'guard') {
                res.blockedByOther = true;
                res.toSelf = 1;
                break;
            }
            res.toOther = 2 + bonus + strikeBonus;
            res.hit = true;
            break;
        }
        case 'charge': {
            if (!chargeValid(aAct, aFrom, bFrom)) {
                res.whiff = true;
                break;
            }
            if (bAct === 'strike') {
                res.interrupted = true;
                break;
            }
            if (crashCell(bFrom)) {
                res.crash = true;
                break;
            }
            if (bMoved && bAct !== 'charge') {
                res.whiff = true;
                break;
            }
            res.toOther = 3 + bonus;
            res.hit = true;
            break;
        }
        case 'bolt': {
            if (bTo.r !== aFrom.r) {
                res.whiff = true;
                break;
            }
            if (bAct === 'guard') {
                res.blockedByOther = true;
                break;
            }
            res.toOther = power + bonus;
            res.hit = true;
            break;
        }
        case 'hellflare':
            res.toOther = 4;
            res.hit = true;
            break;
        default:
            break;
    }
    return res;
}

const NICE: Record<string, string> = {
    moveR: 'Move →',
    moveL: 'Move ←',
    moveU: 'Move ↑',
    moveD: 'Move ↓',
    strike: 'Strike',
    guard: 'Guard',
    bolt: 'Bolt',
    charge: 'Charge',
    focus: 'Focus',
    counter: 'Counter',
    key: 'Key',
    hellflare: 'Hellflare',
    idle: 'nothing',
    glitch: 'a glitched line',
    dizzy: 'dizzy stars',
    sneeze: 'a sneeze',
    chained: 'a chained line',
    blink: 'Blink',
    fizzle: 'a fizzle'
};

export function niceAct(a: Act): string {
    return NICE[a] ?? a;
}

/**
 * Resolve one tick. Mutates the sim (HP, positions, last acts, gimmick counters).
 */
export function resolveTick(
    sim: Sim,
    meOp: Op | null,
    foeOp: Op | null,
    opts: { foeGlitched?: boolean; meChained?: boolean; foeName: string; meLine?: number; foeLine?: number }
): TickResult {
    const { me, foe } = sim;
    let mp = pre(meOp, me, foe);
    let fp = pre(foeOp, foe, me);
    if (opts.foeGlitched) fp = { act: 'glitch', branch: '', power: 1 };
    if (mp.act === null && meOp) mp = resolveIfGuarding(meOp, me, foe, fp.act);
    if (fp.act === null && foeOp) fp = resolveIfGuarding(foeOp, foe, me, mp.act);
    let meA: Act = mp.act ?? 'idle';
    const foeA: Act = fp.act ?? 'idle';

    if (opts.meChained && !sim.keyUsed) meA = 'chained';
    if (meA === 'key') sim.keyUsed = true;

    // --- movement
    const want = (act: Act, self: Cell, other: Cell): Cell => {
        const d = DIRS[act];
        if (d) {
            const t = { c: self.c + d[0], r: self.r + d[1] };
            return inBounds(t) ? t : { ...self };
        }
        if (act === 'charge' && self.r === other.r) {
            const dir = Math.sign(other.c - self.c);
            return { c: other.c - dir, r: self.r };
        }
        return { ...self };
    };
    let mT = want(meA, me.pos, foe.pos);
    let fT = want(foeA, foe.pos, me.pos);
    if (foeA === 'blink') {
        const free = sim.forbidden.filter((f) => !sameCell(f, me.pos) && !sameCell(f, foe.pos) && !sameCell(f, mT));
        if (free.length) fT = { ...free[0] };
    }
    if (sameCell(mT, fT)) {
        mT = { ...me.pos };
        if (foeA !== 'blink') fT = { ...foe.pos };
    }
    if (sameCell(mT, foe.pos) && (sameCell(fT, foe.pos) || sameCell(fT, me.pos))) mT = { ...me.pos };
    if (sameCell(fT, me.pos) && (sameCell(mT, me.pos) || sameCell(mT, foe.pos))) fT = { ...foe.pos };

    const meMoveWanted = !!DIRS[meA];
    const foeMoveWanted = !!DIRS[foeA];

    // --- attacks
    const overBonus = sim.gimmick === 'overflow' ? Math.floor(sim.overflow / 3) : 0;
    const foeBonus = sim.foeBonus + overBonus;
    const ma = attack(sim, meA, me.pos, foeA, foe.pos, fT, 0, 0, mp.power, true);
    const fa = attack(sim, foeA, foe.pos, meA, me.pos, mT, foeBonus, sim.strikeBonus, fp.power, false);

    let dmgFoe = ma.toOther + fa.toSelf;
    let dmgMe = fa.toOther + ma.toSelf;

    // --- overflow gimmick
    let burst = false;
    if (sim.gimmick === 'overflow') {
        if (dmgFoe > 0) sim.overflow = 0;
        else sim.overflow += 1;
        if (sim.overflow >= 6) {
            burst = true;
            dmgMe += 4;
            sim.overflow = 0;
        }
    }

    dmgFoe = Math.min(dmgFoe, foe.hp);
    dmgMe = Math.min(dmgMe, me.hp);

    const meOut: SideOut = {
        act: meA,
        from: { ...me.pos },
        to: mT,
        dmg: dmgMe,
        hit: ma.hit,
        whiff: ma.whiff,
        crash: ma.crash,
        blocked: fa.blockedByOther,
        interrupted: ma.interrupted,
        bumped: meMoveWanted && sameCell(mT, me.pos),
        power: mp.power,
        branch: mp.branch
    };
    const foeOut: SideOut = {
        act: foeA,
        from: { ...foe.pos },
        to: fT,
        dmg: dmgFoe,
        hit: fa.hit,
        whiff: fa.whiff,
        crash: fa.crash,
        blocked: ma.blockedByOther,
        interrupted: fa.interrupted,
        bumped: foeMoveWanted && sameCell(fT, foe.pos),
        power: fp.power,
        branch: fp.branch
    };

    me.hp -= dmgMe;
    foe.hp -= dmgFoe;
    me.pos = mT;
    foe.pos = fT;
    me.last = meA;
    foe.last = foeA;
    if (meA === 'focus') sim.inkBonusNext += 2;

    return {
        me: meOut,
        foe: foeOut,
        text: describe(meOut, foeOut, opts.foeName, burst),
        burst,
        meLine: opts.meLine ?? -1,
        foeLine: opts.foeLine ?? -1,
        erased: -1
    };
}

function describe(m: SideOut, f: SideOut, foeName: string, burst: boolean): string {
    const n = foeName;
    let what: string;
    if (f.act === 'glitch') what = `Lethe glitched ${n}'s line — your ${niceAct(m.act)} runs free!`;
    else if (m.act === 'chained') what = `Your line is chained! ${n}: ${niceAct(f.act)}.`;
    else if (m.act === 'dizzy') what = `Stack Overflow! You're dizzy. ${n}: ${niceAct(f.act)}.`;
    else if (m.act === 'sneeze') what = `Syntax Slip — your line comes out as a sneeze. ${n}: ${niceAct(f.act)}.`;
    else if (m.act === 'fizzle') what = `Out of Ink — your line fizzles. ${n}: ${niceAct(f.act)}.`;
    else if (m.act === 'charge' && f.act === 'guard' && m.hit) what = `Charge breaks ${n}'s Guard!`;
    else if (m.act === 'strike' && f.act === 'charge' && m.hit) what = `Strike interrupts ${n}'s Charge!`;
    else if (m.act === 'guard' && f.act === 'strike' && m.blocked) what = `You parry ${n}'s Strike!`;
    else if (m.act === 'strike' && f.act === 'guard' && f.blocked) what = `${n} parries your Strike.`;
    else if (m.act === 'bolt' && f.act === 'guard' && f.blocked) what = `${n}'s Guard swallows your Bolt.`;
    else if (f.act === 'bolt' && m.act === 'guard' && m.blocked) what = `Your Guard swallows ${n}'s Bolt.`;
    else if (f.act === 'charge' && m.act === 'guard' && f.hit) what = `${n}'s Charge breaks your Guard.`;
    else if (f.act === 'strike' && m.act === 'charge' && f.hit) what = `${n}'s Strike interrupts your Charge.`;
    else if (m.act === 'hellflare') what = `Hellflare! Devil fire ignores ${n}'s ${niceAct(f.act)}.`;
    else if (f.act === 'hellflare') what = `${n} unleashes devil fire!`;
    else if (m.crash) what = `Segfault! Your ${niceAct(m.act)} crashes into a forbidden cell.`;
    else if (f.whiff && (f.act === 'strike' || f.act === 'charge' || f.act === 'bolt') && !sameCell(m.from, m.to))
        what = `You dodge ${n}'s ${niceAct(f.act)}!`;
    else if (m.whiff && (m.act === 'strike' || m.act === 'charge' || m.act === 'bolt'))
        what = `Your ${niceAct(m.act)} misses. ${n}: ${niceAct(f.act)}.`;
    else what = `You: ${niceAct(m.act)} · ${n}: ${niceAct(f.act)}.`;
    if (m.bumped) what += ' (bumped)';
    if (burst) what += ` ${n} bursts with overflow!`;
    const pre = m.branch ? `${m.branch} · ` : '';
    const parts: string[] = [];
    if (f.dmg) parts.push(`${n} −${f.dmg}`);
    if (m.dmg) parts.push(`You −${m.dmg}`);
    return `${pre}${what}  ${parts.length ? parts.join(' · ') : 'No damage.'}`;
}

// ---------------------------------------------------------------------------------------------
// Round runner: steps both programs tick by tick, applying line-level gimmicks.

export interface RoundOpts {
    foeName: string;
    nullLines: boolean;
    chained: number[];
    glitched: Set<number>;
}

export class RoundRunner {
    meOps: Op[];
    foeOps: Op[];
    mi = 0;
    fi = 0;
    tick = -1;
    erased = new Set<number>();
    sim: Sim;
    opts: RoundOpts;

    constructor(sim: Sim, meLines: Line[], foeLines: Line[], opts: RoundOpts) {
        this.sim = sim;
        this.opts = opts;
        this.meOps = expand(meLines);
        this.foeOps = expand(foeLines);
        sim.keyUsed = false;
    }

    get done(): boolean {
        return this.sim.me.hp <= 0 || this.sim.foe.hp <= 0 || (this.nextMe() === null && this.fi >= this.foeOps.length);
    }

    private skipErased() {
        while (this.mi < this.meOps.length && this.erased.has(this.meOps[this.mi].line)) this.mi++;
    }

    nextMe(): Op | null {
        this.skipErased();
        return this.mi < this.meOps.length ? this.meOps[this.mi] : null;
    }

    /** Foe line index the next tick will run, or -1. */
    nextFoeLine(): number {
        return this.fi < this.foeOps.length ? this.foeOps[this.fi].line : -1;
    }

    step(): TickResult | null {
        if (this.done) return null;
        const meOp = this.nextMe();
        const foeOp = this.fi < this.foeOps.length ? this.foeOps[this.fi] : null;
        this.tick++;
        const res = resolveTick(this.sim, meOp, foeOp, {
            foeName: this.opts.foeName,
            foeGlitched: !!foeOp && this.opts.glitched.has(foeOp.line),
            meChained: !!meOp && this.opts.chained.includes(meOp.line),
            meLine: meOp ? meOp.line : -1,
            foeLine: foeOp ? foeOp.line : -1
        });
        if (meOp) this.mi++;
        if (foeOp) this.fi++;
        // Null lines: when one of your lines finishes, King Null erases the next one.
        if (this.opts.nullLines && meOp) {
            const nxt = this.mi < this.meOps.length ? this.meOps[this.mi] : null;
            if (nxt && nxt.line !== meOp.line && !this.erased.has(nxt.line)) {
                this.erased.add(nxt.line);
                res.erased = nxt.line;
                res.text += `  King Null erases your line ${nxt.line + 1}!`;
            }
        }
        return res;
    }
}
