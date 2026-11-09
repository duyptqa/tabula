import {
    AppBase,
    AppOptions,
    BatchManager,
    CameraComponentSystem,
    FILLMODE_FILL_WINDOW,
    LightComponentSystem,
    RESOLUTION_AUTO,
    RenderComponentSystem,
    createGraphicsDevice
} from 'playcanvas';

import { Game } from './game/Game';
import './game/game.css';

const canvas = document.getElementById('application-canvas') as HTMLCanvasElement;

const device = await createGraphicsDevice(canvas);
device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

// Everything is built from primitives in code, so the app needs no asset resource handlers.
const createOptions = new AppOptions();
createOptions.graphicsDevice = device;
createOptions.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem];
createOptions.resourceHandlers = [];
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

new Game(app, canvas);
