// Duel opponents: stats, gimmicks and how each writes their Slate.
import type { SpeakerId } from '../cast';
import type { RuneId } from '../data';

import type { Cell, Gimmick, Line } from './engine';

export type OppId = 'warden' | 'vesper' | 'overflow' | 'sable' | 'brakk' | 'deadlock' | 'segfault' | 'mirror' | 'null';

export interface ScriptCtx {
    round: number;
    prevPlayer: Line[] | null;
    lastSlate: Line[];
    usage: Record<string, number>;
    strong: boolean;
}

export interface OppDef {
    id: OppId;
    speaker: SpeakerId;
    kind: string;
    hp: number;
    strongHp?: number;
    tells: number;
    roundLimit?: number;
    gimmick: Gimmick;
    gimmickText: string;
    place: string;
    foeBonus?: number;
    strikeBonus?: number;
    allTells?: boolean;
    script(ctx: ScriptCtx): Line[];
    chained?(round: number): number[];
    forbidden?(round: number): Cell[];
    lethe: { hello: string; win: string; lose: string; tip: string };
}

const r = (x: RuneId): Line => ({ t: 'rune', r: x });
const loop = (n: number, x: RuneId): Line => ({ t: 'loop', n, r: x });
const iff = (s: 'guarding' | 'adjacent' | 'inRow' | 'hurt', a: RuneId, b: RuneId): Line => ({ t: 'if', s, a, b });
const pick = <T>(arr: T[], i: number) => arr[i % arr.length];

const flipRune = (x: RuneId): RuneId =>
    x === 'moveR' ? 'moveL' : x === 'moveL' ? 'moveR' : x === 'hellflare' ? 'charge' : x;

/** Mirror a script left ↔ right so the foe can run it from the other side of the arena. */
export function mirrorLines(lines: Line[]): Line[] {
    return lines.map((l): Line => {
        switch (l.t) {
            case 'rune':
                return { t: 'rune', r: flipRune(l.r) };
            case 'if':
                return { t: 'if', s: l.s, a: flipRune(l.a), b: flipRune(l.b) };
            case 'loop':
                return { t: 'loop', n: l.n, r: flipRune(l.r) };
            case 'call':
                return { t: 'call', name: l.name, body: l.body.map(flipRune) };
            case 'fizzle':
                return { t: 'fizzle', of: l.of };
            default:
                return l;
        }
    });
}

export const OPPONENTS: Record<OppId, OppDef> = {
    warden: {
        id: 'warden',
        speaker: 'warden',
        kind: 'Guardian trial',
        hp: 8,
        tells: 2,
        roundLimit: 5,
        gimmick: 'none',
        gimmickText: 'Guardian: the same hidden script every round. Deduce it within 5 rounds.',
        place: 'The great mill · Hearthpage',
        script: () => [r('bolt'), r('guard'), r('charge'), r('strike'), r('guard'), r('bolt')],
        lethe: {
            hello: 'Psst — guardians never change their script. Read the Tells, fill in the gaps each round~',
            tip: 'His line 2 is a Guard? Charge breaks guards. And if he Charges, a Strike interrupts it!',
            win: 'We did it! See? Order is just… first this, then that~',
            lose: 'Ouch. Same script every time — we know more lines now. Again!'
        }
    },
    vesper: {
        id: 'vesper',
        speaker: 'vesper',
        kind: 'Hunter duel',
        hp: 12,
        strongHp: 15,
        tells: 2,
        gimmick: 'none',
        gimmickText: 'The Pure: never repeats a rune twice in a row. Her script changes every round.',
        place: 'Forkwood clearing',
        script: (ctx) => {
            const rounds: Line[][] = [
                [r('bolt'), r('guard'), r('strike'), r('charge'), r('bolt'), r('guard')],
                [r('moveL'), r('strike'), r('guard'), r('charge'), r('focus'), r('bolt')],
                [r('guard'), r('bolt'), r('moveU'), r('bolt'), r('charge'), r('strike')]
            ];
            const s = pick(rounds, ctx.round).slice();
            if (ctx.strong) s[2] = iff('adjacent', 'strike', 'bolt');
            return s;
        },
        lethe: {
            hello: "Vesper never repeats herself — so whatever she just did, she won't do next~",
            tip: 'Her Charges come right after Strikes. Guard is weak to Charge… Strike interrupts it!',
            win: 'We won! …Can I have a snack now? A small memory?',
            lose: 'Ouch. Her combos chain so neatly. Read the Tells and break the chain!'
        }
    },
    overflow: {
        id: 'overflow',
        speaker: 'overflow',
        kind: 'Devil fight',
        hp: 14,
        tells: 2,
        gimmick: 'overflow',
        gimmickText: 'Overflow: grows stronger every tick he takes no damage. Six ticks and he bursts for 4.',
        place: 'The Tide Bell · Loopwater Bay',
        script: (ctx) =>
            pick(
                [
                    [r('guard'), r('focus'), r('guard'), r('focus'), r('charge'), r('strike')],
                    [r('guard'), r('guard'), r('bolt'), r('focus'), r('guard'), r('charge')],
                    [r('focus'), r('guard'), r('charge'), r('guard'), r('focus'), r('bolt')]
                ],
                ctx.round
            ),
        lethe: {
            hello: "Ew, Sir Overflow. Don't leave him alone — every tick he isn't hurt, he swells up!",
            tip: 'He hides behind Guards. Charge cracks them, and Bolts chip him on the ticks he relaxes.',
            win: 'Pop! Ahh, that was satisfying~',
            lose: 'He burst all over us… Keep hitting him every tick, okay?'
        }
    },
    sable: {
        id: 'sable',
        speaker: 'sable',
        kind: 'Hunter duel',
        hp: 13,
        tells: 6,
        allTells: true,
        strikeBonus: 1,
        gimmick: 'copycat',
        gimmickText: 'Copycat: Sable runs your previous script, mirrored — and Strikes harder (+1).',
        place: 'The buried library · Lexicon Dunes',
        script: (ctx) => {
            const src = ctx.prevPlayer ?? (ctx.lastSlate.length ? ctx.lastSlate : null);
            const base = src
                ? mirrorLines(src)
                : [r('guard'), r('bolt'), r('strike'), r('guard'), r('charge'), r('bolt')];
            return base.length ? base.slice(0, 6) : [r('guard'), r('bolt')];
        },
        lethe: {
            hello: "Sable copies what you did last. So… you're fighting yourself. Out-think your past self~",
            tip: 'You can see their whole script: it is your last one, flipped. Write its counter!',
            win: 'Hmph. Copying is cheating anyway.',
            lose: 'They beat you with your own spell… Write something new!'
        }
    },
    brakk: {
        id: 'brakk',
        speaker: 'brakk',
        kind: 'Hunter duel',
        hp: 16,
        strongHp: 19,
        tells: 2,
        gimmick: 'none',
        gimmickText: 'The Brute: brute-force loops — one line can hit three times.',
        place: 'The great forge · Forgehollow',
        script: (ctx) => {
            const rounds: Line[][] = [
                [r('moveL'), loop(3, 'strike'), r('guard'), r('charge')],
                [loop(2, 'bolt'), r('charge'), loop(2, 'strike'), r('guard')],
                [r('guard'), loop(3, 'charge'), r('focus'), r('strike')]
            ];
            const s = pick(rounds, ctx.round).slice();
            if (ctx.strong) s.unshift({ t: 'call', name: 'smash', body: ['charge', 'strike'] });
            return s.slice(0, 6);
        },
        lethe: {
            hello: 'Brakk loops the same rune over and over. Big, slow… very predictable~',
            tip: "A Strike loop can't hit you if you're not next to him. Step away, then Bolt!",
            win: 'He took it well! What a nice brute~',
            lose: "Oof. Don't stand still while he's looping Strikes!"
        }
    },
    deadlock: {
        id: 'deadlock',
        speaker: 'deadlock',
        kind: 'Devil fight',
        hp: 12,
        tells: 2,
        gimmick: 'deadlock',
        gimmickText: 'Deadlock: chains two of your lines. Neither runs until you play a Key rune.',
        place: 'The sealed archive · Lexicon Dunes',
        chained: (round) => {
            const a = 1 + (round % 4);
            return [a, a + 1];
        },
        script: (ctx) =>
            pick(
                [
                    [r('guard'), r('strike'), r('guard'), r('bolt'), r('strike'), r('guard')],
                    [r('moveL'), r('strike'), r('strike'), r('guard'), r('bolt'), r('charge')],
                    [r('bolt'), r('guard'), r('charge'), r('bolt'), r('guard'), r('strike')]
                ],
                ctx.round
            ),
        lethe: {
            hello: 'Lady Deadlock locks two of your lines together. Put a Key rune before them!',
            tip: 'The chained lines are marked on your Slate. Key first, then they run.',
            win: 'Unlocked and unloved~ Bye bye!',
            lose: 'Your best lines never ran… Key rune first!'
        }
    },
    segfault: {
        id: 'segfault',
        speaker: 'segfault',
        kind: 'Devil fight',
        hp: 11,
        tells: 2,
        gimmick: 'segfault',
        gimmickText: 'Segfault: blinks into forbidden cells. Strikes and Charges aimed there crash.',
        place: 'A Blank rift · Forkwood',
        forbidden: (round) =>
            pick(
                [
                    [
                        { c: 4, r: 0 },
                        { c: 2, r: 2 },
                        { c: 4, r: 2 }
                    ],
                    [
                        { c: 2, r: 0 },
                        { c: 3, r: 2 },
                        { c: 4, r: 1 }
                    ],
                    [
                        { c: 3, r: 0 },
                        { c: 4, r: 2 },
                        { c: 2, r: 1 }
                    ]
                ],
                round
            ),
        script: (ctx) =>
            pick(
                [
                    [{ t: 'blink' }, r('bolt'), r('guard'), { t: 'blink' }, r('bolt'), r('strike')],
                    [r('guard'), { t: 'blink' }, r('bolt'), r('bolt'), { t: 'blink' }, r('charge')],
                    [r('bolt'), { t: 'blink' }, r('guard'), r('bolt'), { t: 'blink' }, r('bolt')]
                ] as Line[][],
                ctx.round
            ),
        lethe: {
            hello: "Segfault hops into glitchy cells where melee crashes. Bolts don't care about cells~",
            tip: 'Bolt hits anywhere in your row. Move into his row, then Bolt!',
            win: 'Core dumped! Hehe~',
            lose: 'Too many crashes. Ranged spells, Itsuki — Bolts!'
        }
    },
    mirror: {
        id: 'mirror',
        speaker: 'mirror',
        kind: 'Guardian trial',
        hp: 14,
        tells: 3,
        gimmick: 'mirror',
        gimmickText: 'Mirror: fights back with the lines you have used most this journey.',
        place: 'The foot of the Null Spire',
        script: () => [],
        lethe: {
            hello: "That's… you. He knows every spell you lean on. Surprise him~",
            tip: 'His script is your favourite habits. Do something you never do!',
            win: 'You beat yourself! …That sounds sad when I say it out loud.',
            lose: 'He knows you too well. Break your habits!'
        }
    },
    null: {
        id: 'null',
        speaker: 'null',
        kind: 'Final duel',
        hp: 22,
        tells: 2,
        gimmick: 'null',
        gimmickText: 'Null lines: every time one of your lines finishes, King Null erases the next one.',
        place: 'The top of the Null Spire',
        script: (ctx) =>
            pick(
                [
                    [r('bolt'), r('charge'), r('guard'), r('bolt'), r('strike'), r('charge')],
                    [r('guard'), r('bolt'), r('bolt'), r('charge'), r('guard'), r('strike')],
                    [r('charge'), r('strike'), r('bolt'), r('guard'), r('charge'), r('bolt')]
                ],
                ctx.round
            ),
        lethe: {
            hello: "Papa erases every other line. So make each line count — loops, crafts, fractals! Lines that run long can't be erased mid-spell~",
            tip: 'Only lines 1, 3 and 5 will survive. Pack them with constructs!',
            win: 'Papa… is down. We did it, Itsuki.',
            lose: "He's so strong… Pack your surviving lines with loops and fractals!"
        }
    }
};

/** Build Mirror Itsuki's script from the player's most-used lines. */
export function mirrorScript(usage: Record<string, number>): Line[] {
    const top = Object.entries(usage)
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => {
            try {
                return JSON.parse(k) as Line;
            } catch {
                return null;
            }
        })
        .filter((l): l is Line => !!l && l.t !== 'sneeze' && l.t !== 'fizzle')
        .slice(0, 6);
    const fill: Line[] = [r('strike'), r('guard'), r('bolt'), r('charge'), r('bolt'), r('guard')];
    while (top.length < 6) top.push(fill[top.length]);
    return mirrorLines(top);
}

/** Which of the foe's lines the player can read this round, and why. */
export function visibleLines(n: number, tells: number, round: number, all: boolean): Map<number, string> {
    const out = new Map<number, string>();
    if (all) {
        for (let i = 0; i < n; i++) out.set(i, 'Copy');
        return out;
    }
    const order = [1, 3, 4, 0, 5, 2].filter((i) => i < n);
    const count = Math.min(n, tells + 1);
    for (let k = 0; k < count; k++) {
        const idx = order[(round * count + k) % order.length];
        out.set(idx, k < tells ? 'Tell' : 'Margin Notes');
    }
    return out;
}
