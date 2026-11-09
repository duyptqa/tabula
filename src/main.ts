import {
    AppBase,
    AppOptions,
    BatchManager,
    CameraComponentSystem,
    ContainerHandler,
    DEVICETYPE_WEBGL2,
    FILLMODE_FILL_WINDOW,
    LightComponentSystem,
    RESOLUTION_AUTO,
    RenderComponentSystem,
    TextureHandler,
    createGraphicsDevice
} from 'playcanvas';

import { Game } from './game/Game';
import { loadModels } from './game/world/assets';
import './game/game.css';

const canvas = document.getElementById('application-canvas') as HTMLCanvasElement;

// WebGL2 only: the cel-shading chunk overrides in world/toon.ts are written in GLSL.
const device = await createGraphicsDevice(canvas, { deviceTypes: [DEVICETYPE_WEBGL2] });
device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

// Characters are anime-style GLBs built in Blender (art/blender); the rest is built in code.
const createOptions = new AppOptions();
createOptions.graphicsDevice = device;
createOptions.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem];
createOptions.resourceHandlers = [ContainerHandler, TextureHandler];
// The isles are hundreds of small primitives; the batcher merges them to keep draw calls down.
createOptions.batchManager = BatchManager;

const app = new AppBase(canvas);
app.init(createOptions);
app.start();

app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);

const resize = () => app.resizeCanvas();
window.addEventListener('resize', resize);
app.on('destroy', () => {
    window.removeEventListener('resize', resize);
});

const loading = document.createElement('div');
loading.className = 'boot-loading';
loading.textContent = 'Unrolling the scrolls…';
document.body.append(loading);
await loadModels(app, undefined, (k) => {
    loading.textContent = `Unrolling the scrolls… ${Math.round(k * 100)}%`;
});
loading.remove();

new Game(app, canvas);
