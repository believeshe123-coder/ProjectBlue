import { drawGrid } from "./grid.js";
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
    this.ctx.fillStyle = "#2f6f86";
    this.ctx.fillRect(0, 0, width, height);

    if (this.appState.currentMode === "ISO") {
      drawIsoGrid(this.ctx, this.camera, { width, height, spacing: this.appState.gridSpacing });
    } else {
      drawGrid(this.ctx, this.camera, { width, height, spacing: this.appState.gridSpacing });
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

    if (this.appState.previewShape && this.appState.snapIndicator?.point) {
      const p = this.camera.worldToScreen(this.appState.snapIndicator.point);
      this.ctx.save();
      this.ctx.globalAlpha = 0.95;
      this.ctx.strokeStyle = this.appState.snapIndicator.kind === "grid" ? "#ffe27a" : "#9ef4ff";
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(p.x - 6, p.y);
      this.ctx.lineTo(p.x + 6, p.y);
      this.ctx.moveTo(p.x, p.y - 6);
      this.ctx.lineTo(p.x, p.y + 6);
      this.ctx.stroke();
      this.ctx.restore();
    }

    if (this.appState.previewShape && this.appState.snapDebugStatus) {
      this.ctx.save();
      this.ctx.fillStyle = "rgba(14, 22, 30, 0.74)";
      this.ctx.fillRect(width - 132, 8, 124, 28);
      this.ctx.fillStyle = this.appState.snapDebugStatus === "SNAP: GRID" ? "#ffe27a" : "#f0f4f8";
      this.ctx.font = "bold 13px Inter, system-ui, sans-serif";
      this.ctx.textAlign = "right";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(this.appState.snapDebugStatus, width - 12, 22);
      this.ctx.restore();
    }
  }
}
