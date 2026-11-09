// Overworld puzzles: rune gears (Order), echo bells (Echo), name grid (Name), golem lines (Craft).
// The liar signposts (Choice) are solved by walking through an arch in 3D, see Game.
import { bell, sfx } from '../audio';
import { portrait } from '../cast';
import type { SpeakerId } from '../cast';

import { h } from './dom';
import type { Stage } from './dom';

export class Puzzles {
    private layer: HTMLDivElement;
    private done: ((ok: boolean) => void) | null = null;
    private timers: number[] = [];
    active = false;

    constructor(stage: Stage) {
        this.layer = stage.layer('puzzle');
        this.layer.style.display = 'none';
    }

    private open(): Promise<boolean> {
        this.active = true;
        this.layer.style.display = '';
        sfx.open();
        return new Promise((res) => (this.done = res));
    }

    private finish(ok: boolean) {
        for (const t of this.timers) clearTimeout(t);
        this.timers = [];
        this.active = false;
        this.layer.style.display = 'none';
        this.layer.replaceChildren();
        const d = this.done;
        this.done = null;
        d?.(ok);
    }

    private later(ms: number, fn: () => void) {
        this.timers.push(window.setTimeout(fn, ms));
    }

    handleKey(e: KeyboardEvent): boolean {
        if (!this.active) return false;
        if (e.code === 'Escape') {
            sfx.close();
            this.finish(false);
        } else this.keyBells?.(e);
        return true;
    }

    private frame(
        who: SpeakerId,
        kicker: string,
        title: string,
        say: string,
        body: HTMLElement[],
        footer: HTMLElement[]
    ) {
        this.layer.replaceChildren(
            h('div', { class: 'pz-card panel' }, [
                h('div', { class: 'pz-head' }, [
                    h('div', { class: 'pz-portrait', html: portrait(who, 120) }),
                    h('div', { class: 'pz-titles' }, [
                        h('div', { class: 'cap cyan', text: kicker }),
                        h('h2', { text: title }),
                        h('p', { class: 'pz-say', text: say })
                    ])
                ]),
                h('div', { class: 'pz-body' }, body),
                h('div', { class: 'pz-foot' }, [
                    h('button', {
                        class: 'ghost',
                        text: 'Step away [Esc]',
                        on: { click: () => (sfx.close(), this.finish(false)) }
                    }),
                    ...footer
                ])
            ])
        );
    }

    // -----------------------------------------------------------------------------------------
    // I · Order — put the windmill's runes in sequence

    gears(): Promise<boolean> {
        const steps = [
            'Wind fills the sails',
            'Sails turn the windshaft',
            'Windshaft spins the great gear',
            'Great gear turns the millstone',
            'Millstone grinds the grain'
        ];
        const shuffled = [2, 4, 0, 3, 1];
        let seq: number[] = [];
        let say =
            'The mill stopped when its runes were scrambled. First this, then that — restore the order, and it will turn again.';
        let bad = false;
        const render = () => {
            const pool = h(
                'div',
                { class: 'gear-pool' },
                shuffled.map((i) =>
                    h('button', {
                        class: 'gear-card',
                        disabled: seq.includes(i),
                        text: steps[i],
                        on: {
                            click: () => {
                                seq.push(i);
                                sfx.tick();
                                bad = false;
                                render();
                            }
                        }
                    })
                )
            );
            const slots = h(
                'div',
                { class: `gear-slots ${bad ? 'shake' : ''}` },
                steps.map((_, k) =>
                    h('div', { class: `gear-slot ${seq[k] !== undefined ? 'on' : ''}` }, [
                        h('span', { class: 'n', text: String(k + 1) }),
                        h('span', { text: seq[k] !== undefined ? steps[seq[k]] : '…' }),
                        seq[k] !== undefined
                            ? h('button', {
                                  class: 'mini x',
                                  text: '✕',
                                  attrs: { 'aria-label': 'Remove' },
                                  on: {
                                      click: () => {
                                          seq = seq.slice(0, k);
                                          render();
                                      }
                                  }
                              })
                            : null
                    ])
                )
            );
            const full = seq.length === steps.length;
            this.frame(
                'warden',
                'RUNE GATE · SLAB OF ORDER',
                'The Stopped Windmill',
                say,
                [
                    h('div', { class: 'gear-cols' }, [
                        h('div', {}, [h('div', { class: 'cap', text: 'SCRAMBLED RUNES' }), pool]),
                        h('div', {}, [h('div', { class: 'cap', text: 'THE MILL’S SCRIPT · LINE BY LINE' }), slots])
                    ])
                ],
                [
                    h('button', {
                        class: 'primary',
                        text: 'Run the mill',
                        disabled: !full,
                        on: {
                            click: () => {
                                if (seq.every((v, k) => v === k)) {
                                    sfx.success();
                                    say = 'Creak… creak… The great gear turns! Order is restored, small scribe.';
                                    render();
                                    this.later(1100, () => this.finish(true));
                                } else {
                                    sfx.error();
                                    const first = seq.findIndex((v, k) => v !== k);
                                    say = `The mill shudders at line ${first + 1}. A thing cannot happen before the thing that causes it.`;
                                    bad = true;
                                    seq = seq.slice(0, first);
                                    render();
                                }
                            }
                        }
                    })
                ]
            );
        };
        const p = this.open();
        render();
        return p;
    }

    // -----------------------------------------------------------------------------------------
    // III · Echo — echo the Tide Bell's rhythm loop to break it

    bells(): Promise<boolean> {
        const patterns = [
            [0, 2, 1],
            [3, 1, 0, 2],
            [2, 0, 3, 1, 3]
        ];
        let round = 0;
        let input: number[] = [];
        let playing = false;
        let lit = -1;
        let say =
            'The Tide Bell rings the same rhythm over and over — the bay is stuck in a loop. Echo it back to break it.';
        const names = ['Shell', 'Foam', 'Gull', 'Tide'];
        const colors = ['#8FF3FF', '#9DEBF5', '#E9DFC2', '#5ED6E8'];
        const play = () => {
            playing = true;
            input = [];
            render();
            patterns[round].forEach((b, i) => {
                this.later(600 + i * 620, () => {
                    lit = b;
                    bell(b);
                    render();
                    this.later(380, () => {
                        lit = -1;
                        render();
                    });
                });
            });
            this.later(600 + patterns[round].length * 620 + 200, () => {
                playing = false;
                say = 'Your turn — echo it.';
                render();
            });
        };
        const press = (b: number) => {
            if (playing) return;
            bell(b);
            lit = b;
            this.later(200, () => {
                lit = -1;
                render();
            });
            input.push(b);
            const pat = patterns[round];
            if (pat[input.length - 1] !== b) {
                sfx.error();
                say = 'The rhythm slips back into its loop… Listen again.';
                play();
                return;
            }
            if (input.length === pat.length) {
                round += 1;
                if (round >= patterns.length) {
                    sfx.success();
                    say = 'The loop breaks! The bay falls silent… and something big stirs beneath the waves.';
                    playing = true;
                    render();
                    this.later(1300, () => this.finish(true));
                    return;
                }
                sfx.success();
                say = `Loop ${round} of ${patterns.length} broken. The bell answers with a longer rhythm…`;
                this.later(500, play);
            }
            render();
        };
        const render = () => {
            const pat = patterns[round] ?? [];
            this.frame(
                'wade',
                'ECHO BELLS · SLAB OF ECHO',
                'The Tide Bell',
                say,
                [
                    h(
                        'div',
                        { class: 'bells' },
                        names.map((n, i) =>
                            h(
                                'button',
                                {
                                    class: `bell ${lit === i ? 'lit' : ''}`,
                                    disabled: playing,
                                    style: `--c:${colors[i]}`,
                                    attrs: { 'aria-label': `${n} bell` },
                                    on: { click: () => press(i) }
                                },
                                [
                                    h('span', { class: 'bell-shape' }),
                                    h('b', { text: n }),
                                    h('span', { class: 'k', text: String(i + 1) })
                                ]
                            )
                        )
                    ),
                    h('div', { class: 'bell-progress' }, [
                        h('span', {
                            class: 'cap',
                            text: `LOOP ${Math.min(round + 1, patterns.length)} / ${patterns.length}`
                        }),
                        h(
                            'div',
                            { class: 'dots' },
                            pat.map((_, i) => h('span', { class: `d ${i < input.length ? 'on' : ''}` }))
                        )
                    ])
                ],
                [h('button', { class: 'ghost', text: 'Listen again', disabled: playing, on: { click: play } })]
            );
        };
        const p = this.open();
        this.keyBells = (e) => {
            const n = Number(e.key) - 1;
            if (n >= 0 && n < 4) press(n);
        };
        render();
        play();
        return p.finally(() => (this.keyBells = null));
    }

    keyBells: ((e: KeyboardEvent) => void) | null = null;

    // -----------------------------------------------------------------------------------------
    // IV · Name — logic grid

    nameGrid(): Promise<boolean> {
        const people = ['Ada', 'Bram', 'Cleo'];
        const books = ['Book of Loops', 'Book of Names', 'Book of Choices'];
        const answer = [0, 2, 1]; // Ada=Loops, Bram=Choices, Cleo=Names
        const grid: number[][] = people.map(() => books.map(() => 0)); // 0 blank, 1 ✗, 2 ✓
        let say = 'Three scribes wrote three books. Name each author truly, and my riddle releases you.';
        const clues = [
            'Ada never wrote about choices.',
            'The author of the Book of Loops has the shortest name.',
            'Bram did not write the Book of Names.'
        ];
        const render = () => {
            const table = h('div', { class: 'ng-table' }, [
                h('div', { class: 'ng-row head' }, [
                    h('span'),
                    ...books.map((b) => h('span', { class: 'ng-col', text: b }))
                ]),
                ...people.map((p, r) =>
                    h('div', { class: 'ng-row' }, [
                        h('span', { class: 'ng-name', text: p }),
                        ...books.map((_, c) =>
                            h('button', {
                                class: `ng-cell v${grid[r][c]}`,
                                text: grid[r][c] === 2 ? '✓' : grid[r][c] === 1 ? '✗' : '',
                                attrs: { 'aria-label': `${p} wrote ${books[c]}` },
                                on: {
                                    click: () => {
                                        grid[r][c] = (grid[r][c] + 1) % 3;
                                        sfx.tick();
                                        render();
                                    }
                                }
                            })
                        )
                    ])
                )
            ]);
            this.frame(
                'sphinx',
                'NAME GRID · SLAB OF NAME',
                'The Sphinx’s Riddle',
                say,
                [
                    h('div', { class: 'ng-wrap' }, [
                        table,
                        h('div', { class: 'ng-clues' }, [
                            h('div', { class: 'cap', text: 'CLUES' }),
                            ...clues.map((c, i) =>
                                h('div', { class: 'clue' }, [h('b', { text: String(i + 1) }), h('span', { text: c })])
                            ),
                            h('div', { class: 'note', text: 'Click a cell: blank → ✗ → ✓. One ✓ per scribe.' })
                        ])
                    ])
                ],
                [
                    h('button', {
                        class: 'primary',
                        text: 'Speak the names',
                        on: {
                            click: () => {
                                const picks = grid.map((row) => row.indexOf(2));
                                const oneEach = grid.every((row) => row.filter((v) => v === 2).length === 1);
                                if (oneEach && picks.every((p, i) => p === answer[i])) {
                                    sfx.success();
                                    say =
                                        'Ada, of Loops. Bram, of Choices. Cleo, of Names. …Correct. What is named is never lost.';
                                    render();
                                    this.later(1300, () => this.finish(true));
                                } else {
                                    sfx.error();
                                    say = oneEach
                                        ? 'Wrong. A false name is worse than none. Look at the clues again.'
                                        : 'Give every scribe exactly one book first.';
                                    render();
                                }
                            }
                        }
                    })
                ]
            );
        };
        const p = this.open();
        render();
        return p;
    }

    // -----------------------------------------------------------------------------------------
    // V · Craft — program a helper golem with a function

    golem(): Promise<boolean> {
        type Cmd = 'F' | 'L' | 'R' | 'f';
        const W = 6;
        const H = 5;
        const lava = new Set(['2,0', '3,1', '0,2', '1,3', '4,2', '4,4', '5,1']);
        const goal = [3, 3];
        const main: Cmd[] = [];
        const fn: Cmd[] = [];
        let target: 'main' | 'fn' = 'main';
        let gx = 0;
        let gy = 0;
        let dir = 0; // 0 E, 1 S, 2 W, 3 N
        let running = false;
        let say =
            'My helper golem only takes six orders. The forge is far, and the lava is… lava. Teach it a function — def f — and call it.';
        const glyph: Record<Cmd, string> = { F: '↑ step', L: '↺ left', R: '↻ right', f: 'f()' };
        const reset = () => {
            gx = 0;
            gy = 0;
            dir = 0;
        };
        const run = () => {
            if (running) return;
            reset();
            running = true;
            const ops: Cmd[] = [];
            const expand = (list: Cmd[], depth: number): boolean => {
                for (const c of list) {
                    if (ops.length > 40) return false;
                    if (c === 'f') {
                        if (depth > 6 || !expand(fn, depth + 1)) return false;
                    } else ops.push(c);
                }
                return true;
            };
            const ok = expand(main, 0);
            if (!ok) {
                running = false;
                sfx.error();
                say = 'The golem keeps calling f inside f inside f… it sits down, dizzy. (Your function never ends!)';
                render();
                return;
            }
            let i = 0;
            const tick = () => {
                if (i >= ops.length) {
                    running = false;
                    if (gx === goal[0] && gy === goal[1]) {
                        sfx.success();
                        say = 'CLANG! It reached the forge! Make the tool, then the thing — well crafted, scribe.';
                        running = true;
                        render();
                        this.later(1300, () => this.finish(true));
                    } else {
                        sfx.error();
                        say =
                            'The golem stops short of the forge. Six orders aren’t enough on their own — put the repeating part in f.';
                        render();
                    }
                    return;
                }
                const c = ops[i++];
                if (c === 'L') dir = (dir + 3) % 4;
                else if (c === 'R') dir = (dir + 1) % 4;
                else {
                    gx += [1, 0, -1, 0][dir];
                    gy += [0, 1, 0, -1][dir];
                    sfx.move();
                }
                if (gx < 0 || gy < 0 || gx >= W || gy >= H || lava.has(`${gx},${gy}`)) {
                    running = false;
                    sfx.error();
                    say =
                        gx < 0 || gy < 0 || gx >= W || gy >= H
                            ? 'The golem walked off the edge of the workshop! Reset and try again.'
                            : 'Sizzle! The golem stepped in lava. It’s fine. It’s a golem. Try again.';
                    render();
                    return;
                }
                render();
                this.later(330, tick);
            };
            render();
            this.later(300, tick);
        };
        const add = (c: Cmd) => {
            if (running) return;
            const list = target === 'main' ? main : fn;
            const max = target === 'main' ? 6 : 4;
            if (list.length >= max) {
                sfx.error();
                return;
            }
            list.push(c);
            sfx.tick();
            render();
        };
        const render = () => {
            const cells: HTMLElement[] = [];
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    let cls = 'gc';
                    if (lava.has(`${x},${y}`)) cls += ' lava';
                    if (x === goal[0] && y === goal[1]) cls += ' goal';
                    const here = x === gx && y === gy;
                    cells.push(
                        h('div', { class: cls }, [
                            here
                                ? h('span', {
                                      class: 'golem-bot',
                                      style: `transform:rotate(${dir * 90}deg)`,
                                      text: '➤'
                                  })
                                : x === goal[0] && y === goal[1]
                                  ? h('span', { text: '🔥' })
                                  : null
                        ])
                    );
                }
            }
            const prog = (name: 'main' | 'fn', list: Cmd[], max: number, label: string) =>
                h(
                    'div',
                    { class: `gp ${target === name ? 'on' : ''}`, on: { click: () => ((target = name), render()) } },
                    [
                        h('div', { class: 'cap', text: label }),
                        h(
                            'div',
                            { class: 'gp-slots' },
                            Array.from({ length: max }, (_, i) =>
                                h('button', {
                                    class: `gp-slot ${list[i] ? (list[i] === 'f' ? 'call' : 'on') : ''}`,
                                    text: list[i] ? glyph[list[i]] : '',
                                    disabled: running,
                                    on: {
                                        click: (e: Event) => {
                                            e.stopPropagation();
                                            if (list[i]) {
                                                list.splice(i, 1);
                                                render();
                                            } else {
                                                target = name;
                                                render();
                                            }
                                        }
                                    }
                                })
                            )
                        )
                    ]
                );
            this.frame(
                'smith',
                'GOLEM LINES · SLAB OF CRAFT',
                'The Helper Golem',
                say,
                [
                    h('div', { class: 'golem-wrap' }, [
                        h('div', { class: 'golem-grid', style: `grid-template-columns:repeat(${W}, 64px)` }, cells),
                        h('div', { class: 'golem-side' }, [
                            prog('main', main, 6, 'MAIN · 6 ORDERS'),
                            prog('fn', fn, 4, 'def f(): · 4 ORDERS'),
                            h('div', { class: 'cap', text: `ADD TO ${target === 'main' ? 'MAIN' : 'f'}` }),
                            h(
                                'div',
                                { class: 'gp-palette' },
                                (['F', 'L', 'R', 'f'] as Cmd[]).map((c) =>
                                    h('button', {
                                        class: `rune ${c === 'f' ? 'construct' : 'basic'}`,
                                        disabled: running,
                                        text: glyph[c],
                                        on: { click: () => add(c) }
                                    })
                                )
                            ),
                            h('div', {
                                class: 'note',
                                text: 'Click a filled slot to remove it. The golem starts top-left, facing right.'
                            })
                        ])
                    ])
                ],
                [
                    h('button', {
                        class: 'ghost',
                        text: 'Reset golem',
                        disabled: running,
                        on: {
                            click: () => {
                                reset();
                                render();
                            }
                        }
                    }),
                    h('button', {
                        class: 'primary',
                        text: 'Run golem',
                        disabled: running || main.length === 0,
                        on: { click: run }
                    })
                ]
            );
        };
        const p = this.open();
        render();
        return p;
    }
}
