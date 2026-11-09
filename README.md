# TABULA — and the Devil Who Ate My Memories

An open-world 3D chibi RPG built with the PlayCanvas Engine, TypeScript and Vite. Itsuki, a scribe's apprentice, signs a contract with Lethe, a devil princess whose help he pays for with his own memories. Together they sail between six floating isles to recover the six stone slabs that wrote the world.

## How to play

- **Explore.** Each isle has a puzzle, a guardian or rival, and a slab. Sail between isles from the docks at their edges, or open the map and travel by Inkwell once you've found one.
- **Code duels.** Fights are 1v1 on a 5×3 grid. Write up to six lines on your Slate, then press RUN, and both scripts execute tick by tick. You can read some of the foe's lines in advance (their Tells). Use Script mode to type the lines Python-style instead, as in `loop 2: bolt()`. Typos become sneezes.
- **New syntax.** Each slab teaches a construct: if / else, loops, a crafted function, a protected Name, and recursion with `fractal(n)`.
- **The contract.** Lethe's devil runes and Devil's Edit cost Devil Ink. Pay off debt by feeding her memories in the Memory Ledger. Each forgotten memory changes the world: a friend's name, how to swim, the way home.
- **The race.** After the first slab, two rival hunters set out on a clock. If a rival reaches a slab first, duel them for it or trade a memory in a pact.
- **Three endings.** Your bond with Lethe and how much of Itsuki is left decide how the story ends.

Progress autosaves to the browser's local storage.

### Controls

| Input                                    | Action                                 |
| ---------------------------------------- | -------------------------------------- |
| <kbd>W A S D</kbd>                       | Move                                   |
| <kbd>Shift</kbd>                         | Sprint                                 |
| <kbd>Space</kbd>                         | Jump; hold in the air to glide         |
| Drag, <kbd>Q</kbd> / <kbd>R</kbd>, wheel | Orbit and zoom the camera              |
| <kbd>E</kbd>                             | Talk, interact, sail, advance dialogue |
| <kbd>1</kbd>–<kbd>4</kbd>                | Pick a dialogue choice                 |
| <kbd>M</kbd>                             | Map                                    |
| <kbd>L</kbd>                             | Memory Ledger                          |
| <kbd>Esc</kbd>                           | Menu                                   |
| <kbd>Enter</kbd>                         | RUN / NEXT ROUND in a duel             |

## Prerequisites

Node.js 22.23.2 or later.

## Getting started

```bash
pnpm install
pnpm run dev
```

The game opens in your browser at <http://localhost:5173>. The code lives under `src/game/`: `Game.ts` runs the modes and story, `world/` builds the isles and the player, `duel/` holds the code-duel engine and screen, and `ui/` holds the HTML overlays.

## Inspector

`pnpm run dev` loads the [PlayCanvas Inspector](https://github.com/playcanvas/inspector), a debug panel for the hierarchy, assets, materials, textures, frame graph and physics. Press the backquote key (<kbd>&#96;</kbd>) to show or hide it, <kbd>F9</kbd> to pause and <kbd>F10</kbd> to step a frame. It is wired up in `vite.config.ts` and `src/inspector.ts` and is left out of production builds.

## Scripts

Run these with `pnpm run <script>`:

| Script      | Description                                        |
| ----------- | -------------------------------------------------- |
| `dev`       | Start the Vite development server and open the app |
| `build`     | Build for production                               |
| `start`     | Preview the production build and open the app      |
| `lint`      | Run ESLint                                         |
| `fmt`       | Check formatting                                   |
| `typecheck` | Run TypeScript checks                              |

Run `pnpm run build` to generate a deployable static site in `dist/`. Its paths are relative, so it runs from any folder, such as a GitHub Pages project site or an itch.io upload.

## Coding agents

`AGENTS.md` gives coding agents such as Claude Code, Codex and Cursor this project's commands, layout, conventions and checks. `CLAUDE.md` imports it for Claude Code.

## Agent skills

This project includes [`@playcanvas/skills`](https://github.com/playcanvas/skills) under `.claude/skills/` and `.agents/skills/`, so Claude Code, Codex and Cursor pick up PlayCanvas-specific workflows automatically.

## Further reading

- [PlayCanvas Engine manual](https://developer.playcanvas.com/user-manual/engine/)
- [PlayCanvas examples](https://playcanvas.github.io/)
- [Vite documentation](https://vite.dev/)
- [TypeScript documentation](https://www.typescriptlang.org/docs/)
