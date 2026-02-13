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
    this.ctx.fillStyle = "#244a60";
    this.ctx.fillRect(0, 0, width, height);

    drawIsoGrid(this.ctx, this.camera, width, height);

    const layers = this.layerStore.getLayers();
    const shapes = this.shapeStore.getShapes();

    for (const layer of layers) {
      if (!layer.visible) continue;
      for (const shape of shapes) {
        if (shape.layerId === layer.id) {
          shape.draw(this.ctx, this.camera, this.appState);
        }
      }
    }

    if (this.appState.previewShape) {
      this.appState.previewShape.draw(this.ctx, this.camera, this.appState);
    }

    if (this.appState.debugSnap && this.appState.snapIndicator?.rawPoint) {
      const raw = this.camera.worldToScreen(this.appState.snapIndicator.rawPoint);
      this.ctx.save();
      this.ctx.fillStyle = "#ff7676";
      this.ctx.beginPath();
      this.ctx.arc(raw.x, raw.y, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }

    if (this.appState.debugSnap && this.appState.snapIndicator?.point) {
      const p = this.camera.worldToScreen(this.appState.snapIndicator.point);
      this.ctx.save();
      this.ctx.strokeStyle = "#ffe27a";
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(p.x - 5, p.y);
      this.ctx.lineTo(p.x + 5, p.y);
      this.ctx.moveTo(p.x, p.y - 5);
      this.ctx.lineTo(p.x, p.y + 5);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }
}
