// Anime-RPG conversation subtitles: the speaker's name between gold rules over a centred line, a
// typewriter effect and choices stacked at the right. The game frames the speaker's 3D model with
// the camera (onSpeak), so there are no 2D portraits.
import { sfx } from '../audio';
import { CAST } from '../cast';
import type { SpeakerId } from '../cast';

import { h } from './dom';
import type { Stage } from './dom';

export type DLine = [SpeakerId, string];

export interface ChoiceOpt {
    label: string;
    note?: string;
    disabled?: boolean;
    devil?: boolean;
}

export class Dialog {
    private layer: HTMLDivElement;
    private box: HTMLDivElement;
    private resolveAdvance: (() => void) | null = null;
    private typing = false;
    private full = '';
    private textEl: HTMLDivElement | null = null;
    private timer = 0;
    streak = 1;
    active = false;
    private lastWho: SpeakerId | null = null;
    /** Called with each new speaker, and null when the conversation closes. */
    onSpeak: ((who: SpeakerId | null) => void) | null = null;

    constructor(stage: Stage) {
        this.layer = stage.layer('dialog');
        this.box = h('div', { class: 'dlg' });
        this.layer.append(this.box);
        this.layer.style.display = 'none';
        this.layer.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.choice')) return;
            this.advance();
        });
    }

    private show(on: boolean) {
        this.layer.style.display = on ? '' : 'none';
        this.layer.parentElement?.classList.toggle('talking', on);
        this.active = on;
        if (!on) {
            this.lastWho = null;
            this.onSpeak?.(null);
        }
    }

    private frame(who: SpeakerId, body: HTMLElement[]): void {
        const sp = CAST[who];
        const isNarr = who === 'narrator' || who === 'sign';
        this.box.className = `dlg ${isNarr ? 'narr' : ''} ${who === 'sign' ? 'sign' : ''} ${who !== this.lastWho ? 'pop' : ''}`;
        const kids: HTMLElement[] = [];
        if (who !== this.lastWho) this.onSpeak?.(who);
        this.lastWho = who;
        const inner = h('div', { class: 'dlg-inner' }, [
            !isNarr
                ? h('div', { class: 'dlg-name' }, [
                      h('span', { class: 'who', text: sp.name, style: `--accent:${sp.accent}` }),
                      sp.role ? h('span', { class: 'role', text: sp.role }) : null
                  ])
                : null,
            who === 'sign' ? h('div', { class: 'dlg-name', style: 'color:#E9DFC2', text: 'SIGNPOST' }) : null,
            ...body
        ]);
        kids.push(inner);
        this.box.replaceChildren(...kids);
    }

    /** Show lines one by one; resolves when the last is dismissed. */
    async say(lines: DLine[]): Promise<void> {
        this.show(true);
        for (const [who, text] of lines) {
            this.textEl = h('div', { class: 'dlg-text' });
            const hint = h('div', { class: 'dlg-hint', text: '▼  E / Space' });
            this.frame(who, [this.textEl, hint]);
            await this.type(text, who);
            await new Promise<void>((res) => (this.resolveAdvance = res));
        }
        this.show(false);
    }

    private finishType: (() => void) | null = null;

    private type(text: string, who: SpeakerId): Promise<void> {
        this.full = text;
        this.typing = true;
        let i = 0;
        const el = this.textEl!;
        return new Promise((res) => {
            this.finishType = () => {
                clearTimeout(this.timer);
                this.typing = false;
                this.finishType = null;
                el.textContent = this.full;
                res();
            };
            const step = () => {
                i += 2;
                el.textContent = text.slice(0, i);
                if (i % 6 === 0 && who !== 'narrator' && who !== 'sign') sfx.talk();
                if (i >= text.length) {
                    this.finishType?.();
                    return;
                }
                this.timer = window.setTimeout(step, 22);
            };
            step();
        });
    }

    advance() {
        if (!this.active) return;
        if (this.typing) {
            this.finishType?.();
            return;
        }
        const r = this.resolveAdvance;
        this.resolveAdvance = null;
        if (r) {
            sfx.tick();
            r();
        }
    }

    /** Ask a question with options. Resolves with the chosen index. */
    async choose(who: SpeakerId, text: string, opts: ChoiceOpt[]): Promise<number> {
        this.show(true);
        this.textEl = h('div', { class: 'dlg-text' });
        const list = h('div', { class: 'choices' });
        this.frame(who, [this.textEl, list]);
        await this.type(text, who);
        return new Promise((res) => {
            const buttons = opts.map((o, i) =>
                h(
                    'button',
                    {
                        class: `choice ${o.devil ? 'devil' : ''}`,
                        disabled: o.disabled,
                        on: {
                            click: (e: Event) => {
                                e.stopPropagation();
                                sfx.click();
                                this.show(false);
                                this.keyHandler = null;
                                res(i);
                            }
                        }
                    },
                    [
                        h('span', { class: 'k', text: String(i + 1) }),
                        h('span', { class: 'l', text: o.label }),
                        o.note ? h('span', { class: 'note', text: o.note }) : null
                    ]
                )
            );
            list.replaceChildren(...buttons);
            this.keyHandler = (e: KeyboardEvent) => {
                const n = Number(e.key) - 1;
                if (n >= 0 && n < opts.length && !opts[n].disabled) buttons[n].click();
            };
        });
    }

    keyHandler: ((e: KeyboardEvent) => void) | null = null;

    handleKey(e: KeyboardEvent): boolean {
        if (!this.active) return false;
        if (this.keyHandler) {
            this.keyHandler(e);
            return true;
        }
        if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') this.advance();
        return true;
    }
}
