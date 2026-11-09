// Tiny WebAudio synth for sound effects, bells and the lullaby. No audio assets needed.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

function ac(): AudioContext | null {
    if (!enabled) return null;
    try {
        if (!ctx) {
            ctx = new AudioContext();
            master = ctx.createGain();
            master.gain.value = 0.5;
            master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') void ctx.resume();
        return ctx;
    } catch {
        return null;
    }
}

export function setSound(on: boolean) {
    enabled = on;
    if (master) master.gain.value = on ? 0.5 : 0;
}

export function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, when = 0, slideTo?: number) {
    const a = ac();
    if (!a || !master) return;
    const t0 = a.currentTime + when;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
}

function noise(dur: number, vol = 0.15, when = 0, hp = 800) {
    const a = ac();
    if (!a || !master) return;
    const t0 = a.currentTime + when;
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    const g = a.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
}

export const sfx = {
    click: () => tone(880, 0.06, 'triangle', 0.08),
    tick: () => tone(1320, 0.04, 'square', 0.03),
    open: () => {
        tone(523, 0.1, 'triangle', 0.08);
        tone(784, 0.14, 'triangle', 0.08, 0.06);
    },
    close: () => {
        tone(784, 0.08, 'triangle', 0.07);
        tone(523, 0.12, 'triangle', 0.07, 0.05);
    },
    talk: () => tone(600 + Math.random() * 200, 0.035, 'square', 0.02),
    move: () => tone(330, 0.12, 'sine', 0.08, 0, 440),
    strike: () => {
        noise(0.12, 0.2, 0, 1500);
        tone(220, 0.12, 'sawtooth', 0.08, 0, 110);
    },
    bolt: () => tone(1200, 0.25, 'sawtooth', 0.07, 0, 300),
    guard: () => {
        tone(660, 0.18, 'triangle', 0.1);
        tone(990, 0.2, 'sine', 0.06, 0.02);
    },
    charge: () => {
        tone(110, 0.3, 'sawtooth', 0.12, 0, 330);
        noise(0.3, 0.1, 0.05, 400);
    },
    hit: () => {
        noise(0.15, 0.25, 0, 300);
        tone(140, 0.18, 'square', 0.1, 0, 70);
    },
    hellflare: () => {
        noise(0.6, 0.25, 0, 200);
        tone(180, 0.6, 'sawtooth', 0.12, 0, 60);
        tone(720, 0.4, 'sine', 0.06, 0.1, 1440);
    },
    glitch: () => {
        for (let i = 0; i < 6; i++) tone(200 + Math.random() * 1600, 0.04, 'square', 0.05, i * 0.04);
    },
    focus: () => tone(523, 0.3, 'sine', 0.08, 0, 1046),
    sneeze: () => {
        tone(500, 0.1, 'triangle', 0.08, 0, 800);
        noise(0.2, 0.18, 0.12, 2000);
    },
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'triangle', 0.12, i * 0.12)),
    lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'triangle', 0.1, i * 0.15)),
    slab: () => [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.6, 'sine', 0.09, i * 0.09)),
    devil: () => {
        tone(311, 0.4, 'sine', 0.1);
        tone(466, 0.5, 'sine', 0.08, 0.12);
        tone(622, 0.6, 'sine', 0.06, 0.24);
    },
    chomp: () => {
        tone(300, 0.08, 'square', 0.08);
        tone(250, 0.08, 'square', 0.08, 0.12);
        tone(400, 0.2, 'triangle', 0.1, 0.26, 800);
    },
    splash: () => noise(0.4, 0.15, 0, 600),
    error: () => tone(160, 0.25, 'square', 0.08),
    success: () => [659, 880, 1175].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, i * 0.09))
};

export const BELL_NOTES = [523.25, 659.25, 783.99, 987.77];

export function bell(i: number) {
    const f = BELL_NOTES[i % BELL_NOTES.length];
    tone(f, 1.1, 'sine', 0.16);
    tone(f * 2.01, 0.6, 'sine', 0.05);
}

type Note = [number, number];

const LULLABY: Note[] = [
    [392, 1],
    [440, 1],
    [392, 1],
    [330, 2],
    [392, 1],
    [440, 1],
    [392, 1],
    [330, 2],
    [587, 2],
    [587, 1],
    [494, 3],
    [523, 2],
    [523, 1],
    [392, 3]
];

const STRANGE: Note[] = [
    [466, 1],
    [370, 1],
    [415, 2],
    [311, 1],
    [349, 1],
    [277, 2],
    [466, 1],
    [523, 3],
    [311, 3]
];

export function playMelody(which: 'lullaby' | 'strange', bpm = 96) {
    const notes = which === 'lullaby' ? LULLABY : STRANGE;
    const beat = 60 / bpm;
    let t = 0;
    for (const [f, b] of notes) {
        tone(f, b * beat * 0.95, 'triangle', 0.1, t);
        tone(f * 2, b * beat * 0.6, 'sine', 0.03, t);
        t += b * beat;
    }
}
