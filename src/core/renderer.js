import { drawIsoGrid, isoUVToWorld, worldToIsoUV } from "./isoGrid.js";

function zSorted(shapes) {
  return [...shapes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
}

export class Renderer {
  constructor({ ctx, camera, shapeStore, layerStore, appState, getCanvasMetrics, ensureCanvasSize }) {
    this.ctx = ctx;
    this.camera = camera;
    this.shapeStore = shapeStore;
    this.layerStore = layerStore;
    this.appState = appState;
    this.getCanvasMetrics = getCanvasMetrics;
    this.ensureCanvasSize = ensureCanvasSize;
  }

  renderFrame() {
    this.ensureCanvasSize?.();

    const { canvasCssW, canvasCssH, currentDpr } = this.getCanvasMetrics();

    this.ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    this.ctx.clearRect(0, 0, canvasCssW, canvasCssH);
    drawIsoGrid(this.ctx, this.camera, canvasCssW, canvasCssH, {
      gridColor: this.appState.theme?.gridColor,
    });

    if (this.appState.debugSnap && this.appState.snapIndicator?.rawPoint) {
      const centerUV = worldToIsoUV(this.appState.snapIndicator.rawPoint);
      const centerURounded = Math.round(centerUV.u);
      const centerVRounded = Math.round(centerUV.v);

      this.ctx.save();
      this.ctx.fillStyle = "rgba(255, 226, 122, 0.35)";
      for (let du = -4; du <= 4; du += 1) {
        for (let dv = -4; dv <= 4; dv += 1) {
          const latticePoint = isoUVToWorld(centerURounded + du, centerVRounded + dv);
          const dot = this.camera.worldToScreen(latticePoint);
          this.ctx.beginPath();
          this.ctx.arc(dot.x, dot.y, 1.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }
      this.ctx.restore();
    }

    const layers = this.layerStore.getLayers();
    const shapes = this.shapeStore.getShapes();
    const selectedId = this.appState.selected?.id;
    const smartMeasurements = this.appState.smartMeasurements !== false;

    for (const layer of layers) {
      if (!layer.visible) continue;

      const layerShapes = zSorted(shapes.filter((shape) => shape.layerId === layer.id && shape.visible !== false));
      const polygons = layerShapes.filter((shape) => shape.type === "polygon-shape");
      const lines = layerShapes.filter((shape) => shape.type === "line");
      const measurements = layerShapes.filter((shape) => shape.type === "measurement");
      const others = layerShapes.filter((shape) => !["polygon-shape", "line", "measurement"].includes(shape.type));

      for (const polygon of polygons) polygon.drawFill?.(this.ctx, this.camera, this.appState);
      for (const polygon of polygons) polygon.drawStroke?.(this.ctx, this.camera, this.appState);
      for (const line of lines) line.drawStroke?.(this.ctx, this.camera, this.appState) ?? line.draw(this.ctx, this.camera, this.appState);

      if (smartMeasurements) {
        for (const polygon of polygons) {
          if (polygon.id === selectedId || polygon.pinnedMeasure === true) {
            polygon.drawDimensions?.(this.ctx, this.camera, this.appState);
          }
        }

        for (const line of lines) {
          if (line.id === selectedId || line.pinnedMeasure === true) {
            line.drawDimensions?.(this.ctx, this.camera, this.appState);
          }
        }
      }

      for (const measurement of measurements) measurement.draw(this.ctx, this.camera, this.appState);
      for (const other of others) other.draw(this.ctx, this.camera, this.appState);

      for (const polygon of polygons) polygon.drawSelectionOverlay?.(this.ctx, this.camera, this.appState);
      for (const line of lines) line.drawSelectionOverlay?.(this.ctx, this.camera, this.appState);
    }

    if (this.appState.previewShape) {
      this.appState.previewShape.draw(this.ctx, this.camera, {
        ...this.appState,
        smartMeasurements: true,
      });
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
