# AGENTS.md

A PlayCanvas Engine app in TypeScript, built with Vite. The scene is built in code with the `playcanvas` package's API. `README.md` describes the starter this project began from and how to control it.

## Commands

- `pnpm install` installs dependencies.
- `pnpm run dev` starts the dev server, usually at <http://localhost:5173>, with hot reload and the PlayCanvas Inspector.
- `pnpm run typecheck` checks types.
- `pnpm run lint` runs ESLint, and `pnpm run lint:fix` fixes what it can.
- `pnpm run fmt` checks formatting, and `pnpm run fmt:fix` applies Prettier.
- `pnpm run build` builds the production site into `dist/`, and `pnpm run start` serves it.
- `pnpm run dev` and `pnpm run start` open the page in the default browser.

## Layout

- `index.html` is the page, with the `<canvas id="application-canvas">` the app draws into.
- `src/main.ts` is the entry point. It creates the graphics device and the app, then the scene.
- `src/game/` holds the game: `Game.ts` owns state, modes and story; `world/` builds the isles and the player; `duel/` is the code-duel engine and screen; `ui/` holds the DOM overlays; `game.css` styles them.
- `src/inspector.ts` loads the Inspector. `vite.config.ts` adds it in the dev server only, so production builds leave it out.
- `public/` holds files copied into the build as they are, such as models and textures.
- `art/blender/` holds the Blender sources of every model in `public/models/`. `characters.py` builds the anime cast, `props.py` builds the buildings and props, and `anime_env.py` builds the painted environment (island, trees, bushes, grass, flowers, clouds and the cloud sea, exported with vertex colours), all on top of `tabula_lib.py`. The `.blend` files are saved snapshots of those builds. To rebuild a model, run Blender with this folder on `sys.path`, then call `import characters; characters.build('lethe')`, `import props; props.build('house')` or `import anime_env; anime_env.build('tree_round')`. Exports are Draco-compressed GLBs. `src/game/world/assets.ts` loads them, gives them cel shading and outlines, and retints material roles per instance; a model that fails to load falls back to its primitive builder.

## Conventions

- The app is an `AppBase` given only the component systems and resource handlers it uses, which keeps the bundle small. To use another component or asset type, add its system to `componentSystems`, such as `SoundComponentSystem` for `addComponent('sound')`, or its handler to `resourceHandlers`, such as `AudioHandler` for audio assets. Without its system, `addComponent()` returns `null`, and the default build logs no error.
- Builds use relative URLs (`base: './'` in `vite.config.ts`), so they run from any folder. Load files in `public/` with relative paths such as `./model.glb`, not `/model.glb`.
- The engine ships ready-made scripts, such as camera controls and character controllers, under `playcanvas/scripts/esm/`. Use one before writing the same behavior yourself.
- `node_modules/playcanvas/build/playcanvas.d.ts` documents the installed engine's API.
- TypeScript is strict, and unused locals and parameters are errors.

## Checking your work

- Run `pnpm run typecheck`, `pnpm run lint` and `pnpm run build` before you finish. All three must pass.
- To see the result, run `pnpm run dev` and open the page in a browser. The console should show `Powered by PlayCanvas` and no errors. Press the backquote key for the Inspector, which shows the hierarchy, assets, materials, textures, frame graph and physics. <kbd>F9</kbd> pauses and <kbd>F10</kbd> steps a frame.

## Agent skills

`.claude/skills/` and `.agents/skills/` hold PlayCanvas skills for coding agents. Use them rather than working from memory: `build-app` when restructuring the app, `find-examples` for a feature the project doesn't use yet, `reuse-scripts` before writing a behavior, `inspect-glb` before placing a model, `inspect-runtime` to read state from the running app, and `verify-pixels` to prove a refactor leaves the image unchanged.
