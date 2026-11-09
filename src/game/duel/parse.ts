// Script mode: type your Slate. Anything the Slate can't read becomes a sneeze (Syntax Slip).
import type { RuneId, Sensor } from '../data';

import type { Line } from './engine';

export interface Unlocks {
    choice: boolean;
    echo: boolean;
    name: boolean;
    craft: { name: string; body: RuneId[] } | null;
    self: boolean;
    key: boolean;
    devil: boolean;
    recurseBase: boolean;
}

const MOVES: Record<string, RuneId> = {
    '→': 'moveR',
    '->': 'moveR',
    right: 'moveR',
    r: 'moveR',
    '←': 'moveL',
    '<-': 'moveL',
    left: 'moveL',
    l: 'moveL',
    '↑': 'moveU',
    up: 'moveU',
    u: 'moveU',
    '↓': 'moveD',
    down: 'moveD',
    d: 'moveD'
};

const SIMPLE: Record<string, RuneId> = {
    'strike()': 'strike',
    'guard()': 'guard',
    'bolt()': 'bolt',
    'charge()': 'charge',
    'focus()': 'focus'
};

const SENSOR_CODES: Record<string, Sensor> = {
    'foe.guarding': 'guarding',
    'foe.adjacent': 'adjacent',
    'foe.in_row': 'inRow',
    'foe.inrow': 'inRow',
    'me.hurt': 'hurt'
};

function basic(src: string): RuneId | null {
    const s = src.replace(/\s+/g, '').toLowerCase();
    if (SIMPLE[s]) return SIMPLE[s];
    const m = /^move\((.+)\)$/.exec(s);
    if (m && MOVES[m[1]]) return MOVES[m[1]];
    return null;
}

export function parseLine(raw: string, u: Unlocks): Line | null {
    const src = raw.replace(/#.*$/, '').trim();
    if (!src) return null;
    const s = src.replace(/\s+/g, '').toLowerCase();
    const sneeze: Line = { t: 'sneeze', src };
    const b = basic(src);
    if (b) return { t: 'rune', r: b };
    if (/^(counter\((last)?\)|last=foe\.move;?counter\(last\))$/.test(s))
        return u.name ? { t: 'rune', r: 'counter' } : sneeze;
    if (s === 'unlock()' || s === 'key()') return u.key ? { t: 'rune', r: 'key' } : sneeze;
    if (s === 'lethe.hellflare()' || s === 'hellflare()') return u.devil ? { t: 'rune', r: 'hellflare' } : sneeze;
    const iff = /^if(.+?):(.+?)else:(.+)$/.exec(s);
    if (iff) {
        if (!u.choice) return sneeze;
        const sensor = SENSOR_CODES[iff[1]];
        const a = basic(iff[2]);
        const bb = basic(iff[3]);
        return sensor && a && bb ? { t: 'if', s: sensor, a, b: bb } : sneeze;
    }
    const lp = /^loop([0-9]+):(.+)$/.exec(s);
    if (lp) {
        if (!u.echo) return sneeze;
        const n = Number(lp[1]);
        const r = basic(lp[2]);
        return r && n >= 2 && n <= 3 ? { t: 'loop', n, r } : sneeze;
    }
    const fr = /^fractal\(([0-9]+)\)$/.exec(s);
    if (fr) {
        if (!u.self) return sneeze;
        const n = Number(fr[1]);
        return n >= 1 && n <= 3 ? { t: 'recurse', n, base: u.recurseBase } : sneeze;
    }
    if (u.craft && s === `${u.craft.name.toLowerCase()}()`)
        return { t: 'call', name: u.craft.name, body: u.craft.body.slice() };
    return sneeze;
}

export function parseScript(text: string, u: Unlocks, maxLines: number): Line[] {
    const out: Line[] = [];
    for (const raw of text.split('\n')) {
        const l = parseLine(raw, u);
        if (l) out.push(l);
        if (out.length >= maxLines) break;
    }
    return out;
}
