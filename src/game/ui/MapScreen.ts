// The world map of Scriptoria, after the "World map" design board.
import { sfx } from '../audio';
import { ISLES, ISLE_ORDER, ROUTES, SLABS } from '../data';
import type { IsleId } from '../data';
import { fmtTime, homeKnown, races, hasFlag } from '../state';
import type { GameState } from '../state';

import { h } from './dom';
import type { Stage } from './dom';

const ISLE_ART = `
<path d="M392 772 C380 728 450 700 520 704 C600 700 660 730 650 772 C660 812 590 842 520 838 C440 842 400 812 392 772 Z" fill="#7DBE7A" stroke="#E9DFC2" stroke-width="5" data-isle="hearthpage"/>
<g data-isle-art="hearthpage">
<path d="M410 800 C440 830 600 830 636 800 C620 840 560 856 520 854 C470 856 420 840 410 800 Z" fill="#5B4636"/>
<g fill="#4F9A5C"><circle cx="440" cy="760" r="11"/><circle cx="458" cy="790" r="9"/><circle cx="610" cy="788" r="10"/></g>
<path d="M560 770 h22 v16 h-22 z M590 778 h18 v12 h-18 z" fill="#F3EBDD"/>
<path d="M556 770 l15 -12 l15 12 z M588 778 l11 -9 l11 9 z" fill="#C46A4A"/>
<path d="M508 776 L513 736 L527 736 L532 776 Z" fill="#F3EBDD"/>
<path d="M520 736 l-22 -18 M520 736 l22 -18 M520 736 l-18 22 M520 736 l18 22" stroke="#F3EBDD" stroke-width="4" stroke-linecap="round"/>
</g>
<path d="M84 600 C78 540 140 500 206 506 C276 500 326 548 318 604 C322 660 266 700 198 694 C128 700 88 660 84 600 Z" fill="#3E7D5A" stroke="#E9DFC2" stroke-width="5"/>
<path d="M200 684 L200 620 L160 556 M200 620 L242 556" stroke="#E9DFC2" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<g fill="#2C6346"><circle cx="128" cy="590" r="16"/><circle cx="150" cy="630" r="14"/><circle cx="262" cy="608" r="16"/><circle cx="282" cy="570" r="12"/><circle cx="120" cy="552" r="11"/><circle cx="244" cy="652" r="13"/><circle cx="200" cy="530" r="10"/></g>
<path d="M96 238 C90 160 170 118 240 124 C320 128 360 180 350 238 C346 300 290 340 224 336 C150 334 102 300 96 238 Z" fill="#E3D1A4" stroke="#F3EBDD" stroke-width="5"/>
<circle cx="262" cy="222" r="58" fill="#2B6C86"/>
<path d="M286 222 a24 24 0 1 1 -7 -17" fill="none" stroke="#8FF3FF" stroke-width="3.5" stroke-linecap="round"/>
<path d="M272 198 l8 7 l-9 5" fill="none" stroke="#8FF3FF" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M130 230 h18 v14 h-18 z M138 268 h16 v12 h-16 z M170 290 h18 v13 h-18 z" fill="#F3EBDD"/>
<path d="M126 230 l13 -10 l13 10 z M134 268 l12 -9 l12 9 z M166 290 l13 -10 l13 10 z" fill="#3A8AA6"/>
<path d="M690 226 C684 160 750 124 822 128 C900 124 952 170 948 228 C952 290 890 324 818 320 C744 324 694 290 690 226 Z" fill="#E2B867" stroke="#F3EBDD" stroke-width="5"/>
<path d="M720 262 Q760 240 800 262 T880 262 M736 190 Q770 174 804 190" stroke="#C99A45" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M836 222 h56 v26 h-56 z" fill="#F3EBDD"/>
<path d="M840 222 a24 24 0 0 1 48 0 z" fill="#5ED6E8"/>
<path d="M848 230 v14 M860 230 v14 M872 230 v14 M884 230 v14" stroke="#C99A45" stroke-width="3"/>
<path d="M712 616 C700 552 770 512 846 516 C924 512 972 560 966 620 C970 684 904 716 836 712 C762 716 718 680 712 616 Z" fill="#6B3B37" stroke="#C9A08A" stroke-width="5"/>
<path d="M800 630 L846 556 L892 630 Z" fill="#4A2826"/>
<path d="M846 560 L838 598 L852 612 L846 630" stroke="#FF9A4A" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
<g fill="#8E89AE" opacity="0.6"><circle cx="852" cy="540" r="9"/><circle cx="864" cy="522" r="12"/><circle cx="880" cy="500" r="15"/></g>
<path d="M760 660 h20 v14 h-20 z M900 650 h18 v16 h-18 z" fill="#C9A08A"/>
<path d="M470 470 C470 450 500 444 520 444 C546 444 572 452 570 470 C560 500 540 520 520 524 C500 520 478 498 470 470 Z" fill="#2A2147"/>
<path d="M510 470 L506 360 L500 352 L520 300 L540 352 L534 360 L530 470 Z" fill="#3A2E63"/>
<path d="M508 420 L532 404 M507 380 L533 364" stroke="#5A4A8E" stroke-width="4"/>
<circle cx="520" cy="302" r="9" fill="#FF7AB6"/>
<circle cx="520" cy="302" r="18" fill="#FF7AB6" opacity="0.25"/>`;

const BLANK = `
<rect x="0" y="0" width="1040" height="904" rx="28" fill="#142540"/>
<g stroke="#1E3A5E" stroke-width="2.5" fill="none" stroke-linecap="round">
<path d="M60 90 q12 -8 24 0 t24 0"/><path d="M420 120 q12 -8 24 0 t24 0"/><path d="M960 400 q12 -8 24 0 t24 0"/><path d="M70 420 q12 -8 24 0 t24 0"/><path d="M300 860 q12 -8 24 0 t24 0"/><path d="M760 840 q12 -8 24 0 t24 0"/><path d="M960 760 q12 -8 24 0 t24 0"/><path d="M560 40 q12 -8 24 0 t24 0"/>
</g>
<path d="M260 450 C240 270 400 180 530 186 C700 186 800 300 790 456 C792 620 660 700 512 694 C370 700 270 610 260 450 Z" fill="#F7F5FF" opacity="0.10"/>
<path d="M300 446 C290 300 420 228 524 230 C660 228 754 320 746 450 C750 584 640 652 514 648 C392 652 306 574 300 446 Z" fill="#F7F5FF" opacity="0.22"/>
<path d="M340 440 C330 330 420 270 520 272 C630 270 712 340 702 444 C708 552 620 610 516 606 C410 610 346 548 340 440 Z" fill="#EDEAF8"/>`;

const SLAB_SPOTS: Record<IsleId, [number, number]> = {
    hearthpage: [600, 718],
    forkwood: [308, 548],
    loopwater: [338, 162],
    lexicon: [914, 196],
    forgehollow: [948, 610],
    spire: [560, 300]
};

const LABELS: Record<IsleId, [number, number]> = {
    hearthpage: [520, 870],
    forkwood: [200, 720],
    loopwater: [222, 360],
    lexicon: [820, 344],
    forgehollow: [840, 736],
    spire: [600, 330]
};

export const toMap = (x: number, z: number): [number, number] => [x / 0.16 + 520, z / 0.16 + 440];

export class MapScreen {
    private layer: HTMLDivElement;
    private done: ((to: IsleId | null) => void) | null = null;
    active = false;

    constructor(stage: Stage) {
        this.layer = stage.layer('map');
        this.layer.style.display = 'none';
    }

    open(
        s: GameState,
        here: IsleId,
        px: number,
        pz: number,
        travel: boolean,
        spireOpen: boolean
    ): Promise<IsleId | null> {
        this.active = true;
        this.layer.style.display = '';
        sfx.open();
        this.render(s, here, px, pz, travel, spireOpen);
        return new Promise((res) => (this.done = res));
    }

    private close(to: IsleId | null) {
        this.active = false;
        this.layer.style.display = 'none';
        sfx.close();
        const d = this.done;
        this.done = null;
        d?.(to);
    }

    private render(s: GameState, here: IsleId, px: number, pz: number, travel: boolean, spireOpen: boolean) {
        const homeOk = homeKnown(s);
        let routes = '';
        for (const r of ROUTES) {
            const a = ISLES[r.a];
            const b = ISLES[r.b];
            const open = r.b !== 'spire' || spireOpen;
            const hidden = !homeOk && (r.a === 'hearthpage' || r.b === 'hearthpage');
            if (hidden) continue;
            routes += `<path d="M${a.mx} ${a.my} Q${r.cx} ${r.cy} ${b.mx} ${b.my}" stroke="${open ? '#E9DFC2' : '#5A5278'}" opacity="${open ? 0.75 : 0.5}"/>`;
        }
        let slabs = '';
        for (const id of ISLE_ORDER) {
            const [x, y] = SLAB_SPOTS[id];
            const have = s.slabs.includes(ISLES[id].slab);
            const stroke = id === 'spire' ? '#FF7AB6' : '#8FF3FF';
            slabs += `<path d="M${x - 8} ${y + 18} V${y + 6} Q${x - 8} ${y - 2} ${x} ${y - 2} Q${x + 8} ${y - 2} ${x + 8} ${y + 6} V${y + 18} Z" fill="${have ? stroke : '#8E89AE'}" stroke="${stroke}" stroke-width="2"/>`;
        }
        const fog = homeOk
            ? ''
            : `<path d="M380 772 C370 720 450 690 520 694 C600 690 670 720 660 772 C670 822 590 852 520 848 C440 852 390 822 380 772 Z" fill="#F7F5FF" opacity="0.92"/>`;
        const svg = `<svg width="1040" height="904" viewBox="0 0 1040 904" role="img" aria-label="Map of Scriptoria">${BLANK}<g fill="none" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round">${routes}</g>${ISLE_ART}${fog}${slabs}</svg>`;
        const labels = ISLE_ORDER.map((id) => {
            const [x, y] = LABELS[id];
            const d = ISLES[id];
            const unknown = id === 'hearthpage' && !homeOk;
            return h('div', { class: `map-label ${id === 'spire' ? 'dark' : ''}`, style: `left:${x}px;top:${y}px` }, [
                h('span', { text: unknown ? '? ? ?' : d.name }),
                h('span', { class: 'sub', text: unknown ? 'you forgot the way' : d.sub })
            ]);
        });
        const markers: HTMLElement[] = [];
        const [mx, my] = toMap(px, pz);
        markers.push(
            h('div', { class: 'map-marker', style: `left:${mx}px;top:${my}px;border-color:#5ED6E8;color:#BFF6FF` }, [
                h('span', { class: 'dot', style: 'background:#5ED6E8' }),
                h('span', { text: 'You' })
            ])
        );
        if (hasFlag(s, 'race-started')) {
            for (const r of races(s)) {
                if (r.beaten) continue;
                const via = r.def.via;
                const seg = Math.min(via.length - 2, Math.floor(r.progress * (via.length - 1)));
                const k = r.progress * (via.length - 1) - seg;
                const a = ISLES[via[seg]];
                const b = ISLES[via[seg + 1]];
                const x = a.mx + (b.mx - a.mx) * k + 14;
                const y = a.my + (b.my - a.my) * k - 30;
                markers.push(
                    h('div', { class: 'map-marker', style: `left:${x}px;top:${y}px;border-color:${r.def.color}` }, [
                        h('span', { class: 'dot', style: `background:${r.def.color}` }),
                        h('span', { text: r.def.name })
                    ])
                );
            }
        }
        const wells: HTMLElement[] = [];
        if (travel) {
            for (const id of ISLE_ORDER) {
                if (!s.inkwells.includes(id) || id === here) continue;
                if (id === 'hearthpage' && !homeOk) continue;
                const d = ISLES[id];
                wells.push(
                    h(
                        'button',
                        {
                            class: 'well-btn',
                            style: `left:${d.mx}px;top:${d.my}px`,
                            attrs: { 'aria-label': `Fast travel to ${d.name}` },
                            on: { click: () => this.close(id) }
                        },
                        [h('span', { text: '⛲' }), h('span', { text: `Travel to ${d.name}` })]
                    )
                );
            }
        }
        const raceCard = hasFlag(s, 'race-started')
            ? h(
                  'div',
                  { class: 'race-card' },
                  [h('div', { class: 'cap pinkt', text: 'THE RACE IS LIVE' })].concat(
                      races(s).map((r) =>
                          h('p', {
                              text: r.beaten
                                  ? `${r.def.name} was too late for the Slab of ${SLABS[r.def.slab].name}.`
                                  : r.arrived
                                    ? `${r.def.name} holds the Slab of ${SLABS[r.def.slab].name} on ${ISLES[r.def.to].name}. Duel them for it — or strike a pact.`
                                    : `${r.def.name} reaches ${ISLES[r.def.to].name} in ${fmtTime(r.remaining)}.`
                          })
                      )
                  )
              )
            : h('div', { class: 'race-card calm' }, [
                  h('div', { class: 'cap', text: 'THE RACE' }),
                  h('p', {
                      text: 'Rival hunters set out once the Slab of Order wakes. Sailing and lingering both let them gain ground.'
                  })
              ]);
        this.layer.replaceChildren(
            h('div', { class: 'map-svg-wrap' }, [
                h('div', { class: 'map-svg', html: svg }),
                ...labels,
                h('div', { class: 'blank-label', text: 'The Blank — where forgotten things go' }),
                ...markers,
                ...wells
            ]),
            h('div', { class: 'map-side' }, [
                h('div', {}, [
                    h('div', { class: 'cap cyan', text: travel ? 'INKWELL · FAST TRAVEL' : 'THE OPEN WORLD' }),
                    h('h2', { text: 'Scriptoria' }),
                    h('p', {
                        text: travel
                            ? 'Pick a lit Inkwell to travel through the ink. Rivals keep moving while you do.'
                            : 'A ring of floating isles around the Blank — a white void that spreads wherever the world forgets itself. King Null’s Spire rises from its center.'
                    })
                ]),
                h('div', { class: 'getting' }, [
                    h('div', { class: 'cap dim', text: 'GETTING AROUND' }),
                    h('div', { html: '<b>Glide</b> on Lethe’s wings: hold Space mid-jump' }),
                    h('div', { html: '<b>Sail</b> paper-boat routes from the docks' }),
                    h('div', { html: `<b>Fast travel</b> through Inkwells you’ve lit (${s.inkwells.length} lit)` })
                ]),
                raceCard,
                h('button', {
                    class: 'primary',
                    text: travel ? 'Stay here' : 'Close map [M]',
                    on: { click: () => this.close(null) }
                })
            ])
        );
    }

    handleKey(e: KeyboardEvent): boolean {
        if (!this.active) return false;
        if (e.code === 'KeyM' || e.code === 'Escape') this.close(null);
        return true;
    }
}
