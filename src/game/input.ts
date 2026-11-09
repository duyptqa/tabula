// Keyboard + mouse state for the overworld. DOM overlays stop propagation for their own keys.

export class Input {
    keys = new Set<string>();
    private pressed = new Set<string>();
    dragX = 0;
    dragY = 0;
    wheel = 0;
    private dragging = false;
    private lastX = 0;
    private lastY = 0;
    onKey: ((e: KeyboardEvent) => void) | null = null;

    private kd = (e: KeyboardEvent) => {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
        if (!e.repeat) this.pressed.add(e.code);
        this.keys.add(e.code);
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
        this.onKey?.(e);
    };
    private ku = (e: KeyboardEvent) => this.keys.delete(e.code);
    private blur = () => this.keys.clear();
    private pd = (e: PointerEvent) => {
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
    };
    private pm = (e: PointerEvent) => {
        if (!this.dragging) return;
        this.dragX += e.clientX - this.lastX;
        this.dragY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
    };
    private pu = () => {
        this.dragging = false;
    };
    private wh = (e: WheelEvent) => {
        this.wheel += Math.sign(e.deltaY);
    };
    private cm = (e: Event) => e.preventDefault();

    private canvas: HTMLCanvasElement;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        window.addEventListener('keydown', this.kd);
        window.addEventListener('keyup', this.ku);
        window.addEventListener('blur', this.blur);
        canvas.addEventListener('pointerdown', this.pd);
        window.addEventListener('pointermove', this.pm);
        window.addEventListener('pointerup', this.pu);
        canvas.addEventListener('wheel', this.wh, { passive: true });
        canvas.addEventListener('contextmenu', this.cm);
    }

    down(...codes: string[]) {
        return codes.some((c) => this.keys.has(c));
    }

    hit(...codes: string[]) {
        return codes.some((c) => this.pressed.has(c));
    }

    /** Call once per frame after the game has read input. */
    endFrame() {
        this.pressed.clear();
        this.dragX = 0;
        this.dragY = 0;
        this.wheel = 0;
    }

    clear() {
        this.keys.clear();
        this.pressed.clear();
    }

    destroy() {
        window.removeEventListener('keydown', this.kd);
        window.removeEventListener('keyup', this.ku);
        window.removeEventListener('blur', this.blur);
        this.canvas.removeEventListener('pointerdown', this.pd);
        window.removeEventListener('pointermove', this.pm);
        window.removeEventListener('pointerup', this.pu);
        this.canvas.removeEventListener('wheel', this.wh);
        this.canvas.removeEventListener('contextmenu', this.cm);
    }
}
