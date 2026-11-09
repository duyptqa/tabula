// The cast: names, colours, portraits and model specs for everyone who speaks or fights.
import { chibiSvg, golemSvg, itsukiSvg, letheSvg, sphinxSvg, stagSvg } from './ui/portraits';
import type { ChibiSpec } from './ui/portraits';

export type SpeakerId =
    | 'itsuki'
    | 'lethe'
    | 'mom'
    | 'tomo'
    | 'pix'
    | 'warden'
    | 'stag'
    | 'wade'
    | 'sphinx'
    | 'sable'
    | 'smith'
    | 'vesper'
    | 'brakk'
    | 'overflow'
    | 'deadlock'
    | 'segfault'
    | 'mirror'
    | 'null'
    | 'narrator'
    | 'sign';

export type ModelKind = 'itsuki' | 'lethe' | 'chibi' | 'golem' | 'stag' | 'sphinx' | 'mirror' | 'none';

export interface Speaker {
    name: string;
    role: string;
    model: ModelKind;
    chibi?: ChibiSpec;
    golem?: { body: string; glow: string };
    accent: string;
}

export const CHIBIS: Record<string, ChibiSpec> = {
    vesper: {
        look: 'long',
        hair: '#DCE2F3',
        outfit: '#2F5C8F',
        trim: '#E8C46A',
        eye: '#4FA3E0',
        skin: '#FBE3D3',
        glasses: true
    },
    brakk: { look: 'spiky', hair: '#D9573B', outfit: '#6B4A2B', trim: '#C9B994', eye: '#3B8A4A', skin: '#E9B892' },
    pix: { look: 'bob', hair: '#7BD389', outfit: '#3A3A4A', trim: '#FFB347', eye: '#FFB347', skin: '#FBE3D3' },
    sable: {
        look: 'hood',
        hair: '#3F4E9E',
        outfit: '#4A4370',
        trim: '#E8C46A',
        eye: '#E8A33D',
        skin: '#FBE3D3',
        mask: true
    },
    null: {
        look: 'spiky',
        hair: '#F2EEF8',
        outfit: '#3A2E63',
        trim: '#FF7AB6',
        eye: '#FF3D8B',
        skin: '#D9D3F0',
        horns: true,
        crown: true,
        cape: true
    },
    deadlock: {
        look: 'long',
        hair: '#8C9AB8',
        outfit: '#4B5675',
        trim: '#9AE6FF',
        eye: '#9AE6FF',
        skin: '#E6E1F0',
        horns: true
    },
    overflow: {
        look: 'bob',
        hair: '#FF9D5C',
        outfit: '#8C3B2E',
        trim: '#FFD08A',
        eye: '#FFD08A',
        skin: '#FBE3D3',
        horns: true
    },
    segfault: {
        look: 'spiky',
        hair: '#A7F07A',
        outfit: '#2F4A3A',
        trim: '#A7F07A',
        eye: '#A7F07A',
        skin: '#E6F0E0',
        horns: true
    },
    mom: { look: 'long', hair: '#8A5E3F', outfit: '#C46A4A', trim: '#F3EBDD', eye: '#6B4632', skin: '#F6D2BE' },
    tomo: { look: 'bob', hair: '#E8C46A', outfit: '#F3EBDD', trim: '#C46A4A', eye: '#6B4632', skin: '#F0CDB8' },
    wade: { look: 'hood', hair: '#DCE2F3', outfit: '#2B6C86', trim: '#E3D1A4', eye: '#4FA3E0', skin: '#E9B892' }
};

export const CAST: Record<SpeakerId, Speaker> = {
    itsuki: { name: 'Itsuki', role: "Scribe's apprentice", model: 'itsuki', accent: '#5ED6E8' },
    lethe: { name: 'Lethe', role: 'Runaway devil princess', model: 'lethe', accent: '#FF7AB6' },
    mom: { name: 'Mom', role: 'Hearthpage', model: 'chibi', chibi: CHIBIS.mom, accent: '#C46A4A' },
    tomo: { name: 'Tomo', role: 'Baker · best friend', model: 'chibi', chibi: CHIBIS.tomo, accent: '#E8C46A' },
    pix: { name: 'Pix', role: 'Knowledge hunter · The Golfer', model: 'chibi', chibi: CHIBIS.pix, accent: '#7BD389' },
    warden: {
        name: 'Windmill Warden',
        role: 'Guardian of the Slab of Order',
        model: 'golem',
        golem: { body: '#8E89AE', glow: '#8FF3FF' },
        accent: '#8FF3FF'
    },
    stag: { name: 'Twin-Path Stag', role: 'Guardian of Forkwood', model: 'stag', accent: '#8FF3FF' },
    wade: { name: 'Old Wade', role: 'Fisher of Loopwater', model: 'chibi', chibi: CHIBIS.wade, accent: '#2B6C86' },
    sphinx: { name: 'Librarian Sphinx', role: 'Keeper of true names', model: 'sphinx', accent: '#E8C46A' },
    sable: {
        name: 'Sable',
        role: 'Knowledge hunter · The Masked Archivist',
        model: 'chibi',
        chibi: CHIBIS.sable,
        accent: '#E8A33D'
    },
    smith: {
        name: 'Golem Smith',
        role: 'Forgehollow',
        model: 'golem',
        golem: { body: '#6B3B37', glow: '#FF9A4A' },
        accent: '#FF9A4A'
    },
    vesper: {
        name: 'Vesper Quill',
        role: 'Knowledge hunter · The Pure',
        model: 'chibi',
        chibi: CHIBIS.vesper,
        accent: '#DCE2F3'
    },
    brakk: {
        name: 'Brakk Ironloop',
        role: 'Knowledge hunter · The Brute',
        model: 'chibi',
        chibi: CHIBIS.brakk,
        accent: '#D9573B'
    },
    overflow: {
        name: 'Sir Overflow',
        role: 'Devil general',
        model: 'chibi',
        chibi: CHIBIS.overflow,
        accent: '#FF9D5C'
    },
    deadlock: {
        name: 'Lady Deadlock',
        role: 'Devil general',
        model: 'chibi',
        chibi: CHIBIS.deadlock,
        accent: '#9AE6FF'
    },
    segfault: { name: 'Segfault', role: 'Devil general', model: 'chibi', chibi: CHIBIS.segfault, accent: '#A7F07A' },
    mirror: { name: 'Mirror Itsuki', role: 'Trial of the Slab of Self', model: 'mirror', accent: '#FF7AB6' },
    null: {
        name: 'King Null',
        role: 'The Devil King · Lethe’s father',
        model: 'chibi',
        chibi: CHIBIS.null,
        accent: '#FF7AB6'
    },
    narrator: { name: '', role: '', model: 'none', accent: '#CFC8EA' },
    sign: { name: 'Signpost', role: '', model: 'none', accent: '#E9DFC2' }
};

export function portrait(id: SpeakerId, size: number, streak = 1): string {
    const s = CAST[id];
    switch (s.model) {
        case 'itsuki':
            return itsukiSvg(size, streak);
        case 'mirror':
            return itsukiSvg(size, 3, true);
        case 'lethe':
            return letheSvg(size);
        case 'chibi':
            return chibiSvg(size, s.chibi!, s.name);
        case 'golem':
            return golemSvg(size, s.golem!.body, s.golem!.glow, s.name);
        case 'stag':
            return stagSvg(size);
        case 'sphinx':
            return sphinxSvg(size);
        default:
            return '';
    }
}
