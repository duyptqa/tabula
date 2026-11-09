// Minimal tween runner driven by the app update loop.

export const ease = {
    linear: (k: number) => k,
    out: (k: number) => 1 - Math.pow(1 - k, 3),
    inOut: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    pop: (k: number) => Math.sin(k * Math.PI)
};

const noop = (): void => undefined;

interface Tween {
    t: number;
    delay: number;
    dur: number;
    fn: (k: number) => void;
    done?: () => void;
    ease: (k: number) => number;
}

export class Tweens {
    private list: Tween[] = [];

    add(
        dur: number,
        fn: (k: number) => void,
        o: { delay?: number; done?: () => void; ease?: (k: number) => number } = {}
    ) {
        this.list.push({
            t: 0,
            delay: o.delay ?? 0,
            dur: Math.max(0.0001, dur),
            fn,
            done: o.done,
            ease: o.ease ?? ease.inOut
        });
    }

    wait(sec: number, done: () => void) {
        this.add(sec, noop, { done });
    }

    update(dt: number) {
        const list = this.list;
        this.list = [];
        const keep: Tween[] = [];
        for (const tw of list) {
            if (tw.delay > 0) {
                tw.delay -= dt;
                keep.push(tw);
                continue;
            }
            tw.t += dt;
            const k = Math.min(1, tw.t / tw.dur);
            tw.fn(tw.ease(k));
            if (k >= 1) tw.done?.();
            else keep.push(tw);
        }
        this.list = keep.concat(this.list);
    }

    clear() {
        this.list = [];
    }

    get busy() {
        return this.list.length > 0;
    }
}
