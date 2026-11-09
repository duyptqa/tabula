// Static game data for TABULA: runes, memories, isles, routes and slabs.

export const C = {
    inkNight: '#15122B',
    inkNight2: '#1B1640',
    panel: '#211C3F',
    panelLine: '#3A3366',
    parchment: '#F3EBDD',
    slabStone: '#8E89AE',
    slabStoneDark: '#6F6A93',
    cyan: '#5ED6E8',
    cyanSoft: '#9DEBF5',
    cyanGlow: '#8FF3FF',
    pink: '#FF7AB6',
    pinkSoft: '#FF8DC0',
    blank: '#F7F5FF',
    text: '#EFEAFF',
    textDim: '#CFC8EA',
    textMute: '#8F86B8'
} as const;

// ---------------------------------------------------------------------------------------------
// Runes

export type RuneId =
    | 'moveR'
    | 'moveL'
    | 'moveU'
    | 'moveD'
    | 'strike'
    | 'guard'
    | 'bolt'
    | 'charge'
    | 'focus'
    | 'counter'
    | 'key'
    | 'hellflare';

export interface RuneDef {
    id: RuneId;
    label: string;
    cost: number;
    note: string;
    code: string;
    icon: string;
    kind: 'basic' | 'devil' | 'construct';
}

export const ICONS = {
    moveR: 'M4 12h14M13 6l6 6-6 6',
    moveL: 'M20 12H6M11 6l-6 6 6 6',
    moveU: 'M12 20V5M6 10l6-6 6 6',
    moveD: 'M12 4v15M6 14l6 6 6-6',
    strike: 'M19 5L8 16M15 5h4v4M6 14l4 4M4 20l3-3',
    guard: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
    bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
    charge: 'M5 6l6 6-6 6M12 6l6 6-6 6',
    focus: 'M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
    counter: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5',
    key: 'M14 10a4 4 0 1 0-1.2 1.2L20 18.4M17 15.4l2-2',
    hellflare: 'M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-2 0-4 0-7z',
    iff: 'M6 4v16M6 12c0-4 4-6 12-6M15 3l3 3-3 3',
    loop: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
    def: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
    recurse: 'M4 4h16v16H4zM8 8h8v8H8zM11 11h2v2h-2z',
    sneeze: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M9 10h.01M15 10h.01M9 15c2 1 4 1 6 0'
} as const;

export const RUNES: Record<RuneId, RuneDef> = {
    moveR: {
        id: 'moveR',
        label: 'Move →',
        cost: 1,
        note: '1 ink · step',
        code: 'move(→)',
        icon: ICONS.moveR,
        kind: 'basic'
    },
    moveL: {
        id: 'moveL',
        label: 'Move ←',
        cost: 1,
        note: '1 ink · step',
        code: 'move(←)',
        icon: ICONS.moveL,
        kind: 'basic'
    },
    moveU: {
        id: 'moveU',
        label: 'Move ↑',
        cost: 1,
        note: '1 ink · step',
        code: 'move(↑)',
        icon: ICONS.moveU,
        kind: 'basic'
    },
    moveD: {
        id: 'moveD',
        label: 'Move ↓',
        cost: 1,
        note: '1 ink · step',
        code: 'move(↓)',
        icon: ICONS.moveD,
        kind: 'basic'
    },
    strike: {
        id: 'strike',
        label: 'Strike',
        cost: 1,
        note: '1 ink · 2 dmg, adjacent',
        code: 'strike()',
        icon: ICONS.strike,
        kind: 'basic'
    },
    guard: {
        id: 'guard',
        label: 'Guard',
        cost: 1,
        note: '1 ink · parry',
        code: 'guard()',
        icon: ICONS.guard,
        kind: 'basic'
    },
    bolt: {
        id: 'bolt',
        label: 'Bolt',
        cost: 2,
        note: '2 ink · 1 dmg, your row',
        code: 'bolt()',
        icon: ICONS.bolt,
        kind: 'basic'
    },
    charge: {
        id: 'charge',
        label: 'Charge',
        cost: 2,
        note: '2 ink · 3 dmg, breaks guard',
        code: 'charge()',
        icon: ICONS.charge,
        kind: 'basic'
    },
    focus: {
        id: 'focus',
        label: 'Focus',
        cost: 0,
        note: '0 ink · +2 ink next round',
        code: 'focus()',
        icon: ICONS.focus,
        kind: 'basic'
    },
    counter: {
        id: 'counter',
        label: 'Counter',
        cost: 1,
        note: '1 ink · answer their last move',
        code: 'counter(last)',
        icon: ICONS.counter,
        kind: 'construct'
    },
    key: {
        id: 'key',
        label: 'Key',
        cost: 1,
        note: '1 ink · unchain locked lines',
        code: 'unlock()',
        icon: ICONS.key,
        kind: 'basic'
    },
    hellflare: {
        id: 'hellflare',
        label: 'Hellflare',
        cost: 0,
        note: '0 ink · 4 dmg · devil',
        code: 'lethe.hellflare()',
        icon: ICONS.hellflare,
        kind: 'devil'
    }
};

export const BASIC_RUNES: RuneId[] = ['moveR', 'moveL', 'moveU', 'moveD', 'strike', 'guard', 'bolt', 'charge', 'focus'];

export type Sensor = 'guarding' | 'adjacent' | 'inRow' | 'hurt';

export const SENSORS: Record<Sensor, { label: string; code: string; hint: string }> = {
    guarding: { label: 'foe is guarding', code: 'foe.guarding', hint: 'True if their line this tick is a Guard' },
    adjacent: {
        label: 'foe is adjacent',
        code: 'foe.adjacent',
        hint: 'True if they stand next to you (diagonals count)'
    },
    inRow: { label: 'foe is in my row', code: 'foe.in_row', hint: 'True if you share a row' },
    hurt: { label: 'I am hurt', code: 'me.hurt', hint: 'True if your HP is half or less' }
};

// ---------------------------------------------------------------------------------------------
// Memories

export type MemoryCat = 'People' | 'Places' | 'Skills' | 'Feelings';

export interface MemoryDef {
    id: string;
    cat: MemoryCat;
    title: string;
    flavor: string;
    ink: number;
    effect: string;
    locked?: boolean;
    mystery?: boolean;
}

export const MEMORIES: MemoryDef[] = [
    {
        id: 'lullaby',
        cat: 'People',
        title: "Mom's lullaby",
        flavor: 'She hummed it every night the windmills stopped.',
        ink: 3,
        effect: "The music box in Hearthpage now plays a song you don't recognize. It turns paper-white."
    },
    {
        id: 'tomo',
        cat: 'People',
        title: "Tomo's name",
        flavor: 'Your best friend since you were five.',
        ink: 2,
        effect: "Tomo becomes 'the friendly baker'. He greets you like a stranger, and his color drains to paper-white."
    },
    {
        id: 'swim',
        cat: 'Skills',
        title: 'How to swim',
        flavor: 'Learned the summer you nearly drowned.',
        ink: 2,
        effect: 'Deep water blocks your path until you relearn swimming from Old Wade in Loopwater Bay.'
    },
    {
        id: 'home',
        cat: 'Places',
        title: 'The way home',
        flavor: 'Left at the mill, right at the old oak.',
        ink: 1,
        effect: 'Hearthpage vanishes from your map and its Inkwell goes dark until you sail back there.'
    },
    {
        id: 'heights',
        cat: 'Feelings',
        title: 'Fear of heights',
        flavor: 'Your knees still shake on the mill ladder.',
        ink: 1,
        effect: "Upside: you glide 30% farther on Lethe's wings. Downside: nothing up high feels thrilling anymore."
    },
    {
        id: 'defeat',
        cat: 'Feelings',
        title: 'Your first defeat',
        flavor: 'Brakk knocked you flat. You swore you would train.',
        ink: 2,
        effect: "Upside: no flinch — start every duel with +1 HP. Downside: Brakk's rivalry forgets why it started."
    },
    {
        id: 'stars',
        cat: 'Places',
        title: 'The rooftop of stars',
        flavor: 'Where you counted stars until you fell asleep.',
        ink: 2,
        effect: "The Hearthpage rooftop fades to paper-white. You can't share that view with Lethe anymore."
    },
    {
        id: 'bun',
        cat: 'Feelings',
        title: "Tomo's honey buns",
        flavor: 'Warm, sticky, and always one extra for you.',
        ink: 1,
        effect: 'Bread tastes like paper now. You can no longer share a meal with Lethe at the bakery.'
    },
    {
        id: 'lesson',
        cat: 'Skills',
        title: "Teacher's last lesson",
        flavor: '“Name a thing, and it can never be erased.”',
        ink: 4,
        effect: 'Protected by the Slab of Name. Lethe cannot take this one.',
        locked: true
    },
    {
        id: 'mask',
        cat: 'People',
        title: 'A masked face',
        flavor: 'Someone you knew before Hearthpage…?',
        ink: 5,
        effect: "Lethe licks her lips and won't say why this one tastes so sweet. Giving it up changes how Sable's story ends.",
        mystery: true
    }
];

export const DEVIL_COST = 2;

// ---------------------------------------------------------------------------------------------
// Slabs and isles

export type SlabId = 'order' | 'choice' | 'echo' | 'name' | 'craft' | 'self';
export type IsleId = 'hearthpage' | 'forkwood' | 'loopwater' | 'lexicon' | 'forgehollow' | 'spire';

export interface SlabDef {
    id: SlabId;
    numeral: string;
    name: string;
    quote: string;
    teaches: string;
    detail: string;
    code: string;
    unlock: string;
    glyph: string;
    isle: IsleId;
}

export const SLABS: Record<SlabId, SlabDef> = {
    order: {
        id: 'order',
        numeral: 'I',
        name: 'Order',
        quote: '“First this, then that.”',
        teaches: 'Teaches sequence.',
        detail: 'Your Slate runs top to bottom, one line per tick.',
        code: 'move(→)\nstrike()\nguard()',
        unlock: 'Your cracked Slate is mended: you can now write six lines instead of four.',
        glyph: 'M27 44h26M27 57h26M27 70h26',
        isle: 'hearthpage'
    },
    choice: {
        id: 'choice',
        numeral: 'II',
        name: 'Choice',
        quote: '“Look before you strike.”',
        teaches: 'Teaches if / else.',
        detail: 'Runes react to sensors: is the foe guarding, close, in your row? Are you hurt?',
        code: 'if foe.guarding:\n  charge()\nelse:\n  strike()',
        unlock: 'New construct: If / Else. Two runes on one line; a sensor picks which runs.',
        glyph: 'M40 80V60M40 60L27 42M40 60L53 42',
        isle: 'forkwood'
    },
    echo: {
        id: 'echo',
        numeral: 'III',
        name: 'Echo',
        quote: '“What repeats can be broken.”',
        teaches: 'Teaches loops.',
        detail: 'Repeat a rune on a single line, for less Ink. Each repeat takes its own tick.',
        code: 'loop 3:\n  bolt()',
        unlock: 'New construct: Loop ×n. One line, several ticks, cost of the rune + 1.',
        glyph: 'M54 58a14 14 0 1 1 -4.1 -9.9M47 41l3 7 7 -2',
        isle: 'loopwater'
    },
    name: {
        id: 'name',
        numeral: 'IV',
        name: 'Name',
        quote: '“What is named is never lost.”',
        teaches: 'Teaches variables.',
        detail: 'Remember a value and use it later. Also shields one memory from Lethe.',
        code: 'last = foe.move\ncounter(last)',
        unlock: 'New rune: Counter — answers whatever the foe did last tick. And you may Name one memory to protect it forever.',
        glyph: 'M33 40q-7 0-7 7v5q0 4-4 4q4 0 4 4v5q0 7 7 7M47 40q7 0 7 7v5q0 4 4 4q-4 0-4 4v5q0 7-7 7M36 52l8 8M44 52l-8 8',
        isle: 'lexicon'
    },
    craft: {
        id: 'craft',
        numeral: 'V',
        name: 'Craft',
        quote: '“Make the tool, then the thing.”',
        teaches: 'Teaches functions.',
        detail: 'Save a combo as your own named rune and reuse it.',
        code: 'def flurry():\n  strike()\n  strike()\nflurry()',
        unlock: 'New construct: def — name a 2–3 rune combo, then call it on one line.',
        glyph: 'M29 40h6l16 38M41 58l-12 20',
        isle: 'forgehollow'
    },
    self: {
        id: 'self',
        numeral: 'VI',
        name: 'Self',
        quote: '“To know the world, know yourself.”',
        teaches: 'Teaches recursion.',
        detail: 'A spell that calls itself. Forget the base case and you get Stack Overflow: dizzy for two ticks.',
        code: 'def fractal(n):\n  if n == 0: return\n  bolt(n)\n  fractal(n - 1)',
        unlock: 'New construct: fractal(3) — bolts of power 3, 2, 1 from a single line.',
        glyph: 'M23 39h34v38H23zM30 46h20v24H30zM36 52h8v12h-8z',
        isle: 'spire'
    }
};

export const SLAB_ORDER: SlabId[] = ['order', 'choice', 'echo', 'name', 'craft', 'self'];

export interface IsleDef {
    id: IsleId;
    name: string;
    sub: string;
    // centre in world units (x, z), radius
    x: number;
    z: number;
    r: number;
    // centre on the world-map SVG (1040 × 904)
    mx: number;
    my: number;
    slab: SlabId;
}

// World positions are derived from the map: X = (mx - 520) * 0.16, Z = (my - 440) * 0.16
const W = (mx: number, my: number) => ({ x: (mx - 520) * 0.16, z: (my - 440) * 0.16 });

export const ISLES: Record<IsleId, IsleDef> = {
    hearthpage: {
        id: 'hearthpage',
        name: 'Hearthpage',
        sub: 'I · Order · the start',
        ...W(520, 772),
        r: 21,
        mx: 520,
        my: 772,
        slab: 'order'
    },
    forkwood: {
        id: 'forkwood',
        name: 'Forkwood',
        sub: 'II · Choice',
        ...W(200, 600),
        r: 20,
        mx: 200,
        my: 600,
        slab: 'choice'
    },
    loopwater: {
        id: 'loopwater',
        name: 'Loopwater Bay',
        sub: 'III · Echo',
        ...W(222, 230),
        r: 20,
        mx: 222,
        my: 230,
        slab: 'echo'
    },
    lexicon: {
        id: 'lexicon',
        name: 'Lexicon Dunes',
        sub: 'IV · Name',
        ...W(820, 226),
        r: 20,
        mx: 820,
        my: 226,
        slab: 'name'
    },
    forgehollow: {
        id: 'forgehollow',
        name: 'Forgehollow',
        sub: 'V · Craft',
        ...W(840, 614),
        r: 20,
        mx: 840,
        my: 614,
        slab: 'craft'
    },
    spire: {
        id: 'spire',
        name: 'The Null Spire',
        sub: 'VI · Self · finale',
        ...W(520, 420),
        r: 10,
        mx: 520,
        my: 420,
        slab: 'self'
    }
};

export const ISLE_ORDER: IsleId[] = ['hearthpage', 'forkwood', 'loopwater', 'lexicon', 'forgehollow', 'spire'];

export interface RouteDef {
    a: IsleId;
    b: IsleId;
    // quadratic control point on the map
    cx: number;
    cy: number;
}

export const ROUTES: RouteDef[] = [
    { a: 'hearthpage', b: 'forkwood', cx: 330, cy: 760 },
    { a: 'hearthpage', b: 'forgehollow', cx: 710, cy: 760 },
    { a: 'forkwood', b: 'loopwater', cx: 120, cy: 420 },
    { a: 'forgehollow', b: 'lexicon', cx: 930, cy: 420 },
    { a: 'loopwater', b: 'lexicon', cx: 520, cy: 110 },
    { a: 'hearthpage', b: 'spire', cx: 470, cy: 600 }
];

// ---------------------------------------------------------------------------------------------
// Rival race

export interface RaceDef {
    rival: 'vesper' | 'brakk';
    name: string;
    color: string;
    from: IsleId;
    to: IsleId;
    via: IsleId[];
    arrive: number; // seconds of world time after the prologue
    slab: SlabId;
}

export const RACES: RaceDef[] = [
    {
        rival: 'vesper',
        name: 'Vesper',
        color: '#DCE2F3',
        from: 'lexicon',
        to: 'forkwood',
        via: ['lexicon', 'loopwater', 'forkwood'],
        arrive: 480,
        slab: 'choice'
    },
    {
        rival: 'brakk',
        name: 'Brakk',
        color: '#D9573B',
        from: 'loopwater',
        to: 'forgehollow',
        via: ['loopwater', 'lexicon', 'forgehollow'],
        arrive: 960,
        slab: 'craft'
    }
];
