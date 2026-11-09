// Overworld HUD, rendered from GameState every few frames.
import type { IsleId } from '../data';
import { ISLES, SLABS, SLAB_ORDER, MEMORIES } from '../data';
import { fmtTime, forgottenCount, hasFlag, keptCount, races } from '../state';
import type { GameState } from '../state';

import { h } from './dom';
import type { Stage } from './dom';

export class Hud {
    private layer: HTMLDivElement;
    private top: HTMLDivElement;
    private right: HTMLDivElement;
    private race: HTMLDivElement;
    private prompt: HTMLDivElement;
    private toasts: HTMLDivElement;
    private keys: HTMLDivElement;
    private isleBanner: HTMLDivElement;
    private lastKey = '';

    constructor(stage: Stage) {
        this.layer = stage.layer('hud');
        this.top = h('div', { class: 'hud-top panel' });
        this.right = h('div', { class: 'hud-right' });
        this.race = h('div', { class: 'hud-race' });
        this.prompt = h('div', { class: 'hud-prompt' });
        this.toasts = h('div', { class: 'toasts' });
        this.isleBanner = h('div', { class: 'isle-banner' });
        this.keys = h('div', {
            class: 'hud-keys',
            html: '<b>WASD</b> move · <b>Shift</b> sprint · <b>Space</b> jump, hold to glide · <b>drag</b> camera · <b>E</b> interact · <b>M</b> map · <b>L</b> ledger · <b>Esc</b> menu'
        });
        this.layer.append(this.top, this.right, this.race, this.prompt, this.toasts, this.isleBanner, this.keys);
    }

    show(on: boolean) {
        this.layer.style.display = on ? '' : 'none';
    }

    render(s: GameState, isle: IsleId, objective: string) {
        const key = JSON.stringify([
            s.slabs,
            s.devilInk,
            s.bond,
            s.given,
            s.pacts,
            isle,
            objective,
            Math.floor(s.worldTime),
            s.rivalHeld,
            s.flags.length
        ]);
        if (key === this.lastKey) return;
        this.lastKey = key;
        const d = ISLES[isle];
        this.top.replaceChildren(
            h('div', { class: 'isle' }, [h('b', { text: d.name }), h('span', { text: d.sub })]),
            h('div', { class: 'obj' }, [h('span', { class: 'cap', text: 'NEXT' }), h('span', { text: objective })])
        );
        const pips = SLAB_ORDER.map((id) => {
            const have = s.slabs.includes(id);
            return h('div', { class: `slab-pip ${have ? 'on' : ''}`, title: `Slab of ${SLABS[id].name}` }, [
                h('span', { text: SLABS[id].numeral })
            ]);
        });
        const kept = keptCount(s);
        this.right.replaceChildren(
            h('div', { class: 'panel stat-card' }, [
                h('div', { class: 'slab-pips' }, pips),
                h('div', { class: 'stats' }, [
                    h('div', { class: 'stat pink' }, [
                        h('span', { class: 'cap', text: 'DEVIL INK' }),
                        h('b', { text: String(s.devilInk) })
                    ]),
                    h('div', { class: 'stat' }, [
                        h('span', { class: 'cap', text: 'MEMORIES' }),
                        h('b', { text: `${kept}/${MEMORIES.length}` })
                    ]),
                    h('div', { class: 'stat pink' }, [
                        h('span', { class: 'cap', text: 'BOND' }),
                        h('b', { text: '♥'.repeat(Math.min(6, s.bond)) || '—' })
                    ])
                ]),
                forgottenCount(s)
                    ? h('div', { class: 'cap dim', text: `${forgottenCount(s)} forgotten · ledger [L]` })
                    : null
            ])
        );
        if (!hasFlag(s, 'race-started')) {
            this.race.replaceChildren();
            return;
        }
        const rows = races(s).map((r) => {
            let txt: string;
            let cls = '';
            if (r.beaten) {
                txt = 'beaten to the slab';
                cls = 'done';
            } else if (r.arrived) {
                txt = `holds the Slab of ${SLABS[r.def.slab].name}`;
                cls = 'held';
            } else txt = `reaches ${ISLES[r.def.to].name} in ${fmtTime(r.remaining)}`;
            return h('div', { class: `race-row ${cls}` }, [
                h('span', { class: 'dot', style: `background:${r.def.color}` }),
                h('b', { text: r.def.name }),
                h('span', { text: txt }),
                h('div', { class: 'rbar' }, [
                    h('div', { style: `width:${Math.round(r.progress * 100)}%;background:${r.def.color}` })
                ])
            ]);
        });
        this.race.replaceChildren(h('div', { class: 'cap pink', text: 'THE RACE IS LIVE' }), ...rows);
    }

    setPrompt(text: string | null) {
        if (!text) {
            this.prompt.style.display = 'none';
            return;
        }
        this.prompt.style.display = '';
        if (this.prompt.dataset.t !== text) {
            this.prompt.dataset.t = text;
            this.prompt.replaceChildren(h('span', { class: 'key', text: 'E' }), h('span', { text }));
        }
    }

    toast(text: string, kind: 'info' | 'pink' | 'cyan' = 'info') {
        const el = h('div', { class: `toast ${kind}`, text });
        this.toasts.append(el);
        setTimeout(() => el.classList.add('out'), 3800);
        setTimeout(() => el.remove(), 4400);
    }

    banner(isle: IsleId) {
        const d = ISLES[isle];
        this.isleBanner.replaceChildren(h('b', { text: d.name }), h('span', { text: d.sub }));
        this.isleBanner.classList.remove('show');
        void this.isleBanner.offsetWidth;
        this.isleBanner.classList.add('show');
    }
}
