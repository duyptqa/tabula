// The Memory Ledger, after the "Memory ledger" design board.
import { sfx } from '../audio';
import { MEMORIES } from '../data';
import type { MemoryCat, MemoryDef } from '../data';
import { isForgotten, isProtected, keptCount, streakLabel } from '../state';
import type { GameState } from '../state';

import { h } from './dom';
import type { Stage } from './dom';
import { letheSvg } from './portraits';

export type LedgerMode = 'browse' | 'payment' | 'protect' | 'pact';

const TABS: ('All' | MemoryCat)[] = ['All', 'People', 'Places', 'Skills', 'Feelings'];

export interface LedgerResult {
    picked: string | null;
}

export class Ledger {
    private layer: HTMLDivElement;
    private filter: 'All' | MemoryCat = 'All';
    private sel: string | null = null;
    private lethe = '';
    private mode: LedgerMode = 'browse';
    private s!: GameState;
    private rival = '';
    private done: ((r: LedgerResult) => void) | null = null;
    private onChange: (() => void) | null = null;
    active = false;

    constructor(stage: Stage) {
        this.layer = stage.layer('ledger');
        this.layer.style.display = 'none';
    }

    open(s: GameState, mode: LedgerMode, onChange: () => void, rival = ''): Promise<LedgerResult> {
        this.s = s;
        this.mode = mode;
        this.rival = rival;
        this.onChange = onChange;
        this.sel = null;
        this.filter = 'All';
        this.lethe =
            mode === 'payment'
                ? `You owe me ${-s.devilInk} Devil Ink, Itsuki~ Mm, I'm starving. Which one will you feed me?`
                : mode === 'protect'
                  ? 'The Slab of Name… pick one memory and I can never, ever eat it. Hmph.'
                  : mode === 'pact'
                    ? `A pact with ${rival}? They want a memory too… That's MY food!`
                    : 'Mm~ Your memories, all lined up. They look delicious.';
        this.active = true;
        this.layer.style.display = '';
        sfx.open();
        this.render();
        return new Promise((res) => (this.done = res));
    }

    private close(picked: string | null) {
        this.active = false;
        this.layer.style.display = 'none';
        sfx.close();
        const d = this.done;
        this.done = null;
        d?.({ picked });
    }

    private pick(m: MemoryDef) {
        const s = this.s;
        let lethe: string;
        if (isForgotten(s, m.id))
            lethe = s.pacts.includes(m.id)
                ? "Someone else took that one… I'm jealous."
                : "That one's mine now. …You don't even remember it, do you?";
        else if (m.locked) lethe = 'Hmph. The Slab of Name guards that one. No fair!';
        else if (s.protectedIds.includes(m.id)) lethe = "You Named that one. I can't even lick it.";
        else if (m.mystery) lethe = 'Ooh… that face. It smells sooo sweet. Give it to me?';
        else if (m.ink >= 3) lethe = `“${m.title}”? Ooh, a sweet one~`;
        else lethe = `“${m.title}”? Mm, a little snack~`;
        if (this.mode === 'protect')
            lethe = isProtected(s, m) || isForgotten(s, m.id) ? lethe : `Protect “${m.title}”? …Fine. Pick it, then.`;
        this.sel = m.id;
        this.lethe = lethe;
        sfx.tick();
        this.render();
    }

    private give() {
        const s = this.s;
        const m = MEMORIES.find((x) => x.id === this.sel);
        if (!m || isProtected(s, m) || isForgotten(s, m.id)) return;
        if (this.mode === 'protect') {
            s.protectedIds.push(m.id);
            s.protectPending = false;
            sfx.success();
            this.onChange?.();
            this.close(m.id);
            return;
        }
        if (this.mode === 'pact') {
            s.pacts.push(m.id);
            sfx.chomp();
            this.onChange?.();
            this.close(m.id);
            return;
        }
        s.given.push(m.id);
        s.devilInk += m.ink;
        sfx.chomp();
        this.lethe = "Mmm… thank you. Don't worry — I'll keep it safe for you.";
        this.sel = null;
        this.onChange?.();
        if (this.mode === 'payment' && s.devilInk >= 0) {
            this.lethe = 'Paid in full~ Mmm. You taste like home.';
        }
        this.render();
    }

    private render() {
        const s = this.s;
        const kept = keptCount(s);
        const total = MEMORIES.length;
        const owed = this.mode === 'payment' && s.devilInk < 0;
        const tabs = TABS.map((t) =>
            h('button', {
                class: `tab ${this.filter === t ? 'on' : ''}`,
                text: t,
                on: {
                    click: () => {
                        this.filter = t;
                        this.render();
                    }
                }
            })
        );
        const cards = MEMORIES.filter((m) => this.filter === 'All' || m.cat === this.filter).map((m) => {
            const gone = isForgotten(s, m.id);
            const prot = isProtected(s, m);
            let cls = 'mem';
            if (prot) cls += ' locked';
            if (m.mystery) cls += ' mystery';
            if (gone) cls += ' gone';
            if (this.sel === m.id) cls += ' sel';
            let badge = '';
            if (m.locked) badge = 'PROTECTED';
            else if (s.protectedIds.includes(m.id)) badge = 'NAMED';
            else if (m.mystery) badge = '???';
            if (gone) badge = s.pacts.includes(m.id) ? 'TRADED' : 'FORGOTTEN';
            const inkText = gone
                ? s.pacts.includes(m.id)
                    ? 'Traded in a pact'
                    : 'Paid to Lethe'
                : prot
                  ? 'Cannot be eaten'
                  : `+${m.ink} Devil Ink`;
            return h(
                'button',
                { class: cls, attrs: { 'aria-pressed': String(this.sel === m.id) }, on: { click: () => this.pick(m) } },
                [
                    // a forgotten card keeps only its badge: Itsuki can't recall even what kind of memory it was
                    h('span', { class: 'mem-top' }, [
                        h('span', { text: gone ? badge : m.cat.toUpperCase() }),
                        h('span', { text: gone ? '' : badge })
                    ]),
                    h('b', { text: gone ? '· · · · · ·' : m.title }),
                    h('span', { class: 'flavor', text: gone ? "You can't remember what was here." : m.flavor }),
                    h('span', { class: `ink ${gone ? 'g' : prot ? 'c' : 'p'}`, text: inkText })
                ]
            );
        });
        const m = MEMORIES.find((x) => x.id === this.sel) ?? null;
        const gone = m ? isForgotten(s, m.id) : false;
        const blocked = !m || isProtected(s, m) || gone || this.mode === 'browse';
        let giveLabel = m ? `Give to Lethe (+${m.ink})` : 'Give to Lethe';
        if (this.mode === 'protect') giveLabel = 'Name it · protect';
        if (this.mode === 'pact') giveLabel = `Trade to ${this.rival}`;
        if (this.mode === 'browse') giveLabel = 'Only when payment is due';
        if (m && isProtected(s, m)) giveLabel = 'Protected';
        if (gone) giveLabel = 'Already gone';
        const detail = m
            ? [
                  h('div', { class: 'd-a' }, [
                      h('span', { class: 'cap', text: m.cat.toUpperCase() }),
                      h('b', { class: 'title', text: gone ? '· · · · · ·' : m.title }),
                      h('span', {
                          class: 'pinkt',
                          text: isProtected(s, m)
                              ? 'Protected by the Slab of Name'
                              : gone
                                ? 'Gone'
                                : `Pays +${m.ink} Devil Ink`
                      })
                  ]),
                  h('div', { class: 'd-b' }, [
                      h('span', { class: 'cap', text: 'IF HE FORGETS IT' }),
                      h('span', { text: gone ? 'Itsuki has forgotten this. Only Lethe remembers it now.' : m.effect })
                  ]),
                  h('div', { class: 'd-c' }, [
                      h('button', {
                          class: `give ${blocked ? '' : 'on'}`,
                          text: giveLabel,
                          disabled: blocked,
                          on: { click: () => this.give() }
                      }),
                      h('button', {
                          class: 'keep',
                          text: 'Keep it',
                          on: {
                              click: () => {
                                  this.sel = null;
                                  this.lethe = 'Aww. Fine, keep it… for now~';
                                  this.render();
                              }
                          }
                      })
                  ])
              ]
            : [
                  h('div', {
                      class: 'd-empty',
                      text:
                          this.mode === 'browse'
                              ? 'Choose a memory card to see what Itsuki would lose.'
                              : 'Choose a memory card.'
                  })
              ];
        const title =
            this.mode === 'payment'
                ? owed
                    ? `THE CONTRACT · PAYMENT DUE · ${-s.devilInk} INK`
                    : 'THE CONTRACT · PAID'
                : this.mode === 'protect'
                  ? 'SLAB OF NAME · PROTECT ONE'
                  : this.mode === 'pact'
                    ? `PACT WITH ${this.rival.toUpperCase()}`
                    : 'THE CONTRACT';
        const canClose = this.mode === 'browse' || (this.mode === 'payment' && !owed) || this.mode === 'pact';
        const closeLabel = this.mode === 'pact' ? 'Back out' : this.mode === 'payment' ? 'Done' : 'Close [L]';
        this.layer.replaceChildren(
            h('div', { class: 'ledger-glow' }),
            h('div', { class: 'ledger-ring a' }),
            h('div', { class: 'ledger-ring b' }),
            h('div', { class: 'ledger-lethe', html: letheSvg(300) }),
            h('div', { class: 'ledger-bubble' }, [
                h('span', { class: 'who', text: 'LETHE' }),
                h('span', { text: this.lethe })
            ]),
            h('div', { class: 'ledger-kept' }, [
                h('div', { class: 'row' }, [
                    h('span', { class: 'cap', text: 'ITSUKI REMEMBERS' }),
                    h('b', { text: `${kept} / ${total} memories` })
                ]),
                h('div', { class: 'bar' }, [h('div', { style: `width:${Math.round((kept / total) * 100)}%` })]),
                h('div', { class: 'row small' }, [
                    h('span', { html: `Memory streak: <b>${streakLabel(s)}</b>` }),
                    h('span', { html: `Devil Ink: <b class="pinkt">${s.devilInk}</b>` })
                ])
            ]),
            h('div', { class: 'ledger-main' }, [
                h('div', { class: 'l-head' }, [
                    h('div', {}, [
                        h('div', { class: `cap ${owed ? 'pinkt' : 'pinkt'}`, text: title }),
                        h('h2', { text: 'Memory Ledger' })
                    ]),
                    h('p', {
                        text:
                            this.mode === 'protect'
                                ? 'Name one memory. Named things can never be erased — not by Lethe, not by anyone.'
                                : this.mode === 'pact'
                                  ? `Trade a memory to ${this.rival} for the slab. It earns no Devil Ink — it's simply gone.`
                                  : 'Pick a memory to pay for Devil Ink. Sweeter memories pay more — and the world changes around what Itsuki forgets.'
                    })
                ]),
                h('div', { class: 'l-tabs' }, [
                    ...tabs,
                    canClose
                        ? h('button', { class: 'tab close', text: closeLabel, on: { click: () => this.close(null) } })
                        : h('span', { class: 'owed', text: `Pay ${-s.devilInk} more to continue` })
                ]),
                h('div', { class: 'l-grid' }, cards),
                h('div', { class: 'l-detail' }, detail)
            ])
        );
    }

    handleKey(e: KeyboardEvent): boolean {
        if (!this.active) return false;
        if ((e.code === 'KeyL' || e.code === 'Escape') && this.mode === 'browse') this.close(null);
        if (e.code === 'Escape' && this.mode === 'pact') this.close(null);
        return true;
    }
}
