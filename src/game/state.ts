// The single source of truth for a playthrough, plus save / load.
import { DEVIL_COST, MEMORIES, RACES } from './data';
import type { IsleId, MemoryDef, RaceDef, RuneId, SlabId } from './data';
import type { Line } from './duel/engine';

export interface GameState {
    v: 1;
    prologueDone: boolean;
    isle: IsleId;
    pos: [number, number];
    slabs: SlabId[];
    rivalHeld: string[]; // rivals who claimed a slab before you
    given: string[]; // memories eaten by Lethe
    pacts: string[]; // memories traded to rivals
    protectedIds: string[];
    protectPending: boolean;
    devilInk: number;
    bond: number;
    bondFlags: string[];
    flags: string[];
    puzzles: IsleId[];
    duels: string[];
    inkwells: IsleId[];
    worldTime: number;
    usage: Record<string, number>;
    lastSlate: Line[];
    craft: { name: string; body: RuneId[] } | null;
    devilUses: number;
    sound: boolean;
}

const KEY = 'tabula-save-v1';

export function newState(): GameState {
    return {
        v: 1,
        prologueDone: false,
        isle: 'hearthpage',
        pos: [0, 0],
        slabs: [],
        rivalHeld: [],
        given: [],
        pacts: [],
        protectedIds: [],
        protectPending: false,
        devilInk: 0,
        bond: 0,
        bondFlags: [],
        flags: [],
        puzzles: [],
        duels: [],
        inkwells: [],
        worldTime: 0,
        usage: {},
        lastSlate: [],
        craft: null,
        devilUses: 0,
        sound: true
    };
}

export function saveGame(s: GameState) {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
        // storage may be unavailable (private mode); the game still runs
    }
}

export function loadGame(): GameState | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const s = JSON.parse(raw) as GameState;
        if (s.v !== 1) return null;
        return { ...newState(), ...s };
    } catch {
        return null;
    }
}

export function hasSave(): boolean {
    return loadGame() !== null;
}

export function clearSave() {
    try {
        localStorage.removeItem(KEY);
    } catch {
        // ignore
    }
}

// ---------------------------------------------------------------------------------------------
// Memory helpers

export const hasFlag = (s: GameState, f: string) => s.flags.includes(f);
export const setFlag = (s: GameState, f: string) => {
    if (!s.flags.includes(f)) s.flags.push(f);
};

export function isForgotten(s: GameState, id: string): boolean {
    return s.given.includes(id) || s.pacts.includes(id);
}

export function forgottenCount(s: GameState): number {
    return s.given.length + s.pacts.length;
}

export function keptCount(s: GameState): number {
    return MEMORIES.length - forgottenCount(s);
}

export function streakLevel(s: GameState): number {
    const n = forgottenCount(s);
    if (n >= 5) return 3;
    if (n >= 2) return 2;
    return 1;
}

export function streakLabel(s: GameState): string {
    return ['', 'Act 1 · a single lock', 'Act 2 · a white fringe', 'Act 3 · half gone'][streakLevel(s)];
}

export function isProtected(s: GameState, m: MemoryDef): boolean {
    return !!m.locked || s.protectedIds.includes(m.id);
}

export function payable(s: GameState): MemoryDef[] {
    return MEMORIES.filter((m) => !isProtected(s, m) && !isForgotten(s, m.id));
}

export function devilCost(s: GameState): number {
    return s.bond >= 3 ? DEVIL_COST - 1 : DEVIL_COST;
}

/** Devil power is allowed while Itsuki can still pay for it with Devil Ink or memories. */
export function canUseDevil(s: GameState, pendingCost = 0): boolean {
    const credit = payable(s).reduce((n, m) => n + m.ink, 0);
    return s.devilInk - pendingCost - devilCost(s) + credit >= 0;
}

export function addBond(s: GameState, flag: string, amount = 1): boolean {
    if (s.bondFlags.includes(flag)) return false;
    s.bondFlags.push(flag);
    s.bond += amount;
    return true;
}

export function playerMaxHp(s: GameState): number {
    return 12 + (isForgotten(s, 'defeat') ? 1 : 0);
}

export function canSwim(s: GameState): boolean {
    return !isForgotten(s, 'swim') || hasFlag(s, 'relearned-swim');
}

export function homeKnown(s: GameState): boolean {
    return !isForgotten(s, 'home') || hasFlag(s, 'walked-home');
}

export function slateLines(s: GameState): number {
    return s.slabs.includes('order') ? 6 : 4;
}

// ---------------------------------------------------------------------------------------------
// Rival race

export interface RaceStatus {
    def: RaceDef;
    progress: number; // 0..1 along the route
    arrived: boolean;
    beaten: boolean; // the slab was claimed by the player before arrival
    remaining: number;
}

export function raceStatus(s: GameState, def: RaceDef): RaceStatus {
    const playerHas = s.slabs.includes(def.slab);
    const arrivedFlag = s.rivalHeld.includes(def.rival);
    const progress = Math.min(1, s.worldTime / def.arrive);
    return {
        def,
        progress: arrivedFlag ? 1 : progress,
        arrived: arrivedFlag,
        beaten: (playerHas || s.duels.includes(def.rival)) && !arrivedFlag,
        remaining: Math.max(0, def.arrive - s.worldTime)
    };
}

export function races(s: GameState): RaceStatus[] {
    return RACES.map((r) => raceStatus(s, r));
}

export function fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const ss = Math.floor(sec % 60);
    return `${m}:${ss.toString().padStart(2, '0')}`;
}
