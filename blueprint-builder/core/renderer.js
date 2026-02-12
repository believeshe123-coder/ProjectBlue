import { draw2DGrid } from "./grid.js";
import { drawIsoGrid } from "./isoGrid.js";

export class Renderer {
  constructor({ canvas, ctx, camera, shapeStore, layerStore, appState }) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.camera = camera;
    this.shapeStore = shapeStore;
    this.layerStore = layerStore;
    this.appState = appState;
  }

  renderFrame() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, width, height);

    if (this.appState.currentMode === "ISO") {
      drawIsoGrid(this.ctx, this.camera, { width, height }, this.appState.gridSpacing);
    } else {
      draw2DGrid(this.ctx, this.camera, { width, height }, this.appState.gridSpacing);
    }

    const layers = this.layerStore.getLayers();
    const shapes = this.shapeStore.getShapes();

    for (const layer of layers) {
      if (!layer.visible) continue;
      for (const shape of shapes) {
        if (shape.layerId === layer.id) {
          shape.draw(this.ctx, this.camera);
        }
      }
    }

    if (this.appState.previewShape) {
      this.appState.previewShape.draw(this.ctx, this.camera);
    }
  }
}
