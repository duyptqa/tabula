// A 1600 × 900 stage, scaled to fit the window, so screens can follow the design boards' layout.

export const STAGE_W = 1600;
export const STAGE_H = 900;

type Child = Node | string | number | null | undefined | false;

export interface HProps {
    class?: string;
    style?: string;
    text?: string;
    html?: string;
    title?: string;
    disabled?: boolean;
    attrs?: Record<string, string>;
    on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: HProps = {},
    children: Child[] = []
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (props.class) el.className = props.class;
    if (props.style) el.setAttribute('style', props.style);
    if (props.text !== undefined) el.textContent = props.text;
    if (props.html !== undefined) el.innerHTML = props.html;
    if (props.title) el.title = props.title;
    if (props.disabled !== undefined && 'disabled' in el) (el as HTMLButtonElement).disabled = props.disabled;
    if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
    if (props.on) {
        for (const [k, fn] of Object.entries(props.on)) {
            if (fn) el.addEventListener(k, fn as EventListener);
        }
    }
    for (const c of children) {
        if (c === null || c === undefined || c === false) continue;
        el.append(typeof c === 'number' ? String(c) : c);
    }
    return el;
}

/** Replace an element's children, skipping null / false entries. */
export function fill(el: HTMLElement, children: Child[]): void {
    el.replaceChildren();
    for (const c of children) {
        if (c === null || c === undefined || c === false) continue;
        el.append(typeof c === 'number' ? String(c) : c);
    }
}

export function icon(d: string, size = 20, extra = ''): string {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;${extra}"><path d="${d}"></path></svg>`;
}

export class Stage {
    root: HTMLDivElement;
    stage: HTMLDivElement;
    scale = 1;
    private onResize = () => this.layout();

    constructor() {
        this.root = h('div', { class: 'ui-root' });
        this.stage = h('div', { class: 'stage' });
        this.root.append(this.stage);
        document.body.append(this.root);
        window.addEventListener('resize', this.onResize);
        this.layout();
    }

    layout() {
        const w = window.innerWidth;
        const hh = window.innerHeight;
        this.scale = Math.min(w / STAGE_W, hh / STAGE_H);
        const left = (w - STAGE_W * this.scale) / 2;
        const top = (hh - STAGE_H * this.scale) / 2;
        this.stage.style.transform = `translate(${left}px, ${top}px) scale(${this.scale})`;
    }

    layer(cls: string): HTMLDivElement {
        const l = h('div', { class: `layer ${cls}` });
        this.stage.append(l);
        return l;
    }

    /** Convert window pixel coordinates to stage coordinates. */
    toStage(x: number, y: number): [number, number] {
        const left = (window.innerWidth - STAGE_W * this.scale) / 2;
        const top = (window.innerHeight - STAGE_H * this.scale) / 2;
        return [(x - left) / this.scale, (y - top) / this.scale];
    }

    destroy() {
        window.removeEventListener('resize', this.onResize);
        this.root.remove();
    }
}
