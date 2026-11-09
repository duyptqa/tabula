// Full-screen moments: title, pause menu, slab reveal, the contract and the endings.
import { sfx } from '../audio';
import { SLABS, SLAB_ORDER } from '../data';
import type { SlabId } from '../data';

import { h } from './dom';
import type { Stage } from './dom';
import { itsukiSvg, letheSvg } from './portraits';

export function slabSvg(id: SlabId, w: number, glow = true): string {
    const d = SLABS[id];
    const pink = id === 'self';
    const filter = glow
        ? `filter:drop-shadow(0 0 14px ${pink ? 'rgba(255,122,182,0.6)' : 'rgba(94,214,232,0.6)'})`
        : '';
    return `<svg viewBox="0 0 80 100" width="${w}" height="${w * 1.25}" aria-hidden="true" style="${filter}"><path d="M10 98 V34 Q10 6 40 6 Q70 6 70 34 V98 Z" fill="#8E89AE"/><path d="M16 92 V36 Q16 13 40 13 Q64 13 64 36 V92 Z" fill="#6F6A93"/><path d="${d.glyph}" fill="none" stroke="${pink ? '#FF8DC0' : '#8FF3FF'}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const STARS = `<svg width="1600" height="900" viewBox="0 0 1600 900" aria-hidden="true" class="stars-svg"><g fill="#EFEAFF"><circle cx="820" cy="80" r="1.6" opacity="0.7"/><circle cx="910" cy="150" r="1.2" opacity="0.5"/><circle cx="1010" cy="60" r="2" opacity="0.8"/><circle cx="1180" cy="120" r="1.3" opacity="0.5"/><circle cx="1290" cy="40" r="1.8" opacity="0.7"/><circle cx="1560" cy="90" r="1.4" opacity="0.6"/><circle cx="1500" cy="220" r="1.1" opacity="0.4"/><circle cx="860" cy="250" r="1.2" opacity="0.45"/><circle cx="60" cy="60" r="1.4" opacity="0.5"/><circle cx="300" cy="40" r="1.1" opacity="0.4"/><circle cx="560" cy="90" r="1.6" opacity="0.6"/><circle cx="700" cy="40" r="1.2" opacity="0.45"/><circle cx="1570" cy="820" r="1.5" opacity="0.5"/></g></svg>`;

export class Screens {
    private layer: HTMLDivElement;
    private keyFn: ((e: KeyboardEvent) => boolean) | null = null;
    active = false;

    constructor(stage: Stage) {
        this.layer = stage.layer('screens');
        this.layer.style.display = 'none';
    }

    private open(cls: string, kids: (HTMLElement | null)[]) {
        this.active = true;
        this.layer.className = `layer screens ${cls}`;
        this.layer.style.display = '';
        this.layer.replaceChildren(...kids.filter((k): k is HTMLElement => !!k));
    }

    close() {
        this.active = false;
        this.keyFn = null;
        this.layer.style.display = 'none';
        this.layer.replaceChildren();
    }

    handleKey(e: KeyboardEvent): boolean {
        if (!this.active) return false;
        this.keyFn?.(e);
        return true;
    }

    // -----------------------------------------------------------------------------------------

    title(hasSave: boolean, sound: boolean, on: { newGame: () => void; cont: () => void; sound: () => void }) {
        let armed = false;
        const newBtn = h('button', {
            class: hasSave ? 'ghost big' : 'primary big',
            text: 'New game',
            on: {
                click: () => {
                    sfx.click();
                    if (hasSave && !armed) {
                        armed = true;
                        newBtn.textContent = 'Erase save & start over?';
                        newBtn.className = 'danger big';
                        return;
                    }
                    on.newGame();
                }
            }
        });
        const btns = h('div', { class: 'title-btns' }, [
            hasSave
                ? h('button', { class: 'primary big', text: 'Continue', on: { click: () => (sfx.click(), on.cont()) } })
                : null,
            newBtn,
            h('button', { class: 'ghost', text: sound ? '♪ Sound on' : '♪ Sound off', on: { click: () => on.sound() } })
        ]);
        const glyphs = (['choice', 'echo', 'order', 'name', 'craft', 'self'] as SlabId[]).map((id, i) =>
            h('div', { class: `t-slab s${i}`, html: slabSvg(id, i < 2 ? 52 : i < 4 ? 62 : 72) })
        );
        this.open('title', [
            h('div', { class: 'stars-wrap', html: STARS }),
            h('div', { class: 'glow cyan' }),
            h('div', { class: 'glow pink' }),
            h('div', { class: 't-ring' }),
            ...glyphs,
            h('div', { class: 't-itsuki', html: itsukiSvg(380, 2) }),
            h('div', { class: 't-lethe', html: letheSvg(220) }),
            h('div', { class: 't-copy' }, [
                h('div', { class: 'cap cyan', text: 'OPEN-WORLD RPG · 3D CHIBI ANIME' }),
                h('div', {}, [
                    h('h1', { text: 'TABULA' }),
                    h('div', { class: 't-sub', text: 'and the Devil Who Ate My Memories' })
                ]),
                h('p', {
                    text: "Six stone slabs hold the knowledge that wrote the world. Collect them all to rewrite its ending — duel with code, crack the world's puzzles, and pay your devil partner with your own memories."
                }),
                h('div', { class: 'chips' }, [
                    h('span', { class: 'chip cyan', text: 'Open world' }),
                    h('span', { class: 'chip cyan', text: '1v1 code duels' }),
                    h('span', { class: 'chip pink', text: 'Memory contract' }),
                    h('span', { class: 'chip pink', text: 'Rival hunters' })
                ]),
                btns
            ]),
            h('div', {
                class: 't-foot',
                html: SLAB_ORDER.map((s) => `<span>${SLABS[s].name.toUpperCase()}</span>`).join(
                    '<span class="dot">·</span>'
                )
            })
        ]);
        this.keyFn = (e) => {
            if (e.code === 'Enter' || e.code === 'Space') (hasSave ? on.cont : on.newGame)();
            return true;
        };
    }

    pause(
        sound: boolean,
        on: {
            resume: () => void;
            map: () => void;
            ledger: () => void;
            sound: () => void;
            title: () => void;
            reset: () => void;
        }
    ) {
        let confirm = false;
        const render = () => {
            this.open('pause', [
                h('div', { class: 'pause-card panel' }, [
                    h('h2', { text: 'Paused' }),
                    h('div', { class: 'pause-btns' }, [
                        h('button', { class: 'primary big', text: 'Resume', on: { click: () => on.resume() } }),
                        h('button', { class: 'ghost', text: 'World map [M]', on: { click: () => on.map() } }),
                        h('button', { class: 'ghost', text: 'Memory ledger [L]', on: { click: () => on.ledger() } }),
                        h('button', {
                            class: 'ghost',
                            text: sound ? 'Sound: on' : 'Sound: off',
                            on: { click: () => on.sound() }
                        }),
                        h('button', {
                            class: 'ghost',
                            text: 'Save & return to title',
                            on: { click: () => on.title() }
                        }),
                        confirm
                            ? h('button', {
                                  class: 'danger',
                                  text: 'Really erase your save and start over?',
                                  on: { click: () => on.reset() }
                              })
                            : h('button', {
                                  class: 'ghost dim',
                                  text: 'Start over…',
                                  on: { click: () => ((confirm = true), render()) }
                              })
                    ]),
                    h('div', { class: 'help' }, [
                        h('div', { class: 'cap', text: 'CONTROLS' }),
                        h('div', {
                            html: '<b>WASD / arrows</b> move · <b>Shift</b> sprint · <b>Space</b> jump (hold to glide) · <b>drag mouse</b> or <b>Q / R</b> turn camera · <b>wheel</b> zoom · <b>E</b> talk / interact · <b>M</b> map · <b>L</b> ledger'
                        }),
                        h('div', { class: 'cap', text: 'CODE DUELS' }),
                        h('div', {
                            html: 'Write a Slate of runes; both scripts run at once, one line per tick. Moves resolve first, then attacks aim at where the target <i>started</i>. Strike hits adjacent foes that stand still · Bolt hits anywhere in your row · Guard blocks both and reflects strikes · Charge dashes along your row and breaks Guard. Read their Tells, then press <b>RUN</b>.'
                        }),
                        h('div', { class: 'cap', text: 'THE CONTRACT' }),
                        h('div', {
                            html: "Lethe's Hellflare and Devil's Edit cost Devil Ink. If you're short, she eats a memory after the fight — and the world changes around what Itsuki forgets."
                        })
                    ])
                ])
            ]);
        };
        render();
        this.keyFn = (e) => {
            if (e.code === 'Escape') on.resume();
            return true;
        };
    }

    slab(id: SlabId, firstTime: boolean, onClaim: () => void) {
        const d = SLABS[id];
        sfx.slab();
        this.open('slab-reveal', [
            h('div', { class: 'glow cyan big' }),
            h('div', { class: 'sr-card' }, [
                h('div', { class: 'sr-art', html: slabSvg(id, 180) }),
                h('div', { class: 'sr-copy' }, [
                    h('div', { class: 'cap cyan', text: `SLAB ${d.numeral} · ${firstTime ? 'RECOVERED' : 'CLAIMED'}` }),
                    h('h2', { text: `Slab of ${d.name}` }),
                    h('div', { class: 'quote', text: d.quote }),
                    h('p', { html: `<b>${d.teaches}</b> ${d.detail}` }),
                    h('pre', { class: 'code', text: d.code }),
                    h('div', { class: 'unlock' }, [
                        h('span', { class: 'cap', text: 'UNLOCKED' }),
                        h('span', { text: d.unlock })
                    ]),
                    h('button', {
                        class: 'primary big',
                        text: 'Take the slab',
                        on: { click: () => (this.close(), onClaim()) }
                    })
                ])
            ])
        ]);
        this.keyFn = (e) => {
            if (e.code === 'Enter' || e.code === 'KeyE') {
                this.close();
                onClaim();
            }
            return true;
        };
    }

    contract(onSign: () => void) {
        const input = h('input', {
            class: 'sign-in',
            attrs: { maxlength: '14', 'aria-label': 'Sign your name', spellcheck: 'false' }
        });
        input.value = '';
        input.placeholder = 'Itsuki';
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') sign();
        });
        const sign = () => {
            sfx.devil();
            this.close();
            onSign();
        };
        this.open('contract', [
            h('div', { class: 'glow pink big' }),
            h('div', { class: 'contract-card' }, [
                h('div', { class: 'cap pinkt', text: 'A CONTRACT · WRITTEN IN DEVIL INK' }),
                h('h2', { text: 'The Memory Contract' }),
                h('ol', {}, [
                    h('li', {
                        html: 'Lethe, runaway princess of the Devil Court, lends the undersigned <b>her power</b>: Hellflare and the Devil’s Edit.'
                    }),
                    h('li', {
                        html: 'Every use costs <b>Devil Ink</b>. When the ink runs dry, the undersigned pays with <b>memories</b> — sweeter memories pay more.'
                    }),
                    h('li', {
                        html: 'What is eaten is <b>gone</b>. The world forgets it too: songs, names, roads home.'
                    }),
                    h('li', {
                        html: 'In return, the undersigned helps Lethe recover the <b>six slabs</b> before King Null rewrites Scriptoria into the Blank.'
                    }),
                    h('li', { class: 'fine', text: 'Fine print: Lethe may not eat what has been Named.' })
                ]),
                h('div', { class: 'sign-row' }, [h('span', { class: 'cap', text: 'SIGN HERE' }), input]),
                h('button', { class: 'devil big', text: 'Sign in Devil Ink', on: { click: sign } })
            ]),
            h('div', { class: 'contract-lethe', html: letheSvg(280) })
        ]);
        // wait out the E press that closed the last dialogue line, so it doesn't type into the field
        setTimeout(() => input.focus(), 450);
        this.keyFn = () => true;
    }

    ending(
        kind: 'rasa' | 'recompile' | 'crown',
        stats: { kept: number; total: number; bond: number; devil: number },
        onDone: () => void
    ) {
        const E = {
            rasa: {
                tag: 'ENDING · TABULA RASA',
                title: 'A Blank Page',
                color: '#F7F5FF',
                text: [
                    'King Null falls, and the Spire cracks open like an egg. White light pours across Scriptoria — and recedes.',
                    'Lethe stands at the edge of it. "The contract’s done, Itsuki. I was only ever here for the snacks… right?"',
                    'She never looks back. By morning, Itsuki can’t remember why there’s a little pink feather in his satchel. The world is saved. It is very quiet.'
                ]
            },
            recompile: {
                tag: 'ENDING · RECOMPILE',
                title: 'The World, Rewritten',
                color: '#5ED6E8',
                text: [
                    'With six slabs on his Slate, Itsuki writes the last line himself: return everything.',
                    'The Blank gives back the songs, the names and the roads home — and Lethe, laughing, gives back the rest. "Just this once! Don’t get used to it~"',
                    'The windmills of Hearthpage turn. Tomo bakes one extra honey bun, and a devil princess eats it on the rooftop of stars.'
                ]
            },
            crown: {
                tag: 'ENDING · CROWN OF NULL',
                title: 'The Devil’s Scribe',
                color: '#FF7AB6',
                text: [
                    'King Null’s crown rolls to Itsuki’s feet. Half his hair is white now; he barely remembers the boy who left Hearthpage.',
                    'Lethe takes his hand. "You gave me so much of yourself… so let me keep you. We’ll rule the Court together."',
                    'Scriptoria survives, rewritten by a scribe who forgot almost everything — except the devil at his side.'
                ]
            }
        }[kind];
        sfx.win();
        this.open(`ending ${kind}`, [
            h('div', { class: 'stars-wrap', html: STARS }),
            h('div', { class: 'end-card' }, [
                h('div', { class: 'cap', style: `color:${E.color}`, text: E.tag }),
                h('h2', { text: E.title }),
                ...E.text.map((t) => h('p', { text: t })),
                h('div', { class: 'end-stats' }, [
                    h('div', {}, [
                        h('b', { text: `${stats.kept}/${stats.total}` }),
                        h('span', { text: 'memories kept' })
                    ]),
                    h('div', {}, [h('b', { text: String(stats.bond) }), h('span', { text: 'bond with Lethe' })]),
                    h('div', {}, [h('b', { text: String(stats.devil) }), h('span', { text: 'devil powers used' })])
                ]),
                h('p', {
                    class: 'hint',
                    text:
                        kind === 'rasa'
                            ? 'Spend time with Lethe at the heart markers to reach a different ending.'
                            : kind === 'recompile'
                              ? 'Three endings exist. Feed Lethe more of yourself to see another.'
                              : 'Three endings exist. Keep more of your memories to see another.'
                }),
                h('button', {
                    class: 'primary big',
                    text: 'Return to title',
                    on: { click: () => (this.close(), onDone()) }
                })
            ]),
            h('div', { class: 'end-lethe', html: letheSvg(240) })
        ]);
        this.keyFn = () => true;
    }
}
