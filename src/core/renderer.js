import { drawIsoGrid, isoUVToWorld, worldToIsoUV } from "./isoGrid.js";

function zSorted(shapes) {
  return [...shapes].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
}

export class Renderer {
  constructor({ ctx, camera, shapeStore, appState, getCanvasMetrics, ensureCanvasSize }) {
    this.ctx = ctx;
    this.camera = camera;
    this.shapeStore = shapeStore;
    this.appState = appState;
    this.getCanvasMetrics = getCanvasMetrics;
    this.ensureCanvasSize = ensureCanvasSize;
  }

  renderFrame() {
    this.ensureCanvasSize?.();
    this.appState.shapeStore = this.shapeStore;

    const { canvasCssW, canvasCssH, currentDpr } = this.getCanvasMetrics();

    this.ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    this.ctx.clearRect(0, 0, canvasCssW, canvasCssH);
    drawIsoGrid(this.ctx, this.camera, canvasCssW, canvasCssH, {
      gridColor: this.appState.theme?.gridColor,
    });



    if (this.appState.marqueeRect) {
      const { x, y, width, height } = this.appState.marqueeRect;
      this.ctx.save();
      this.ctx.fillStyle = "rgba(79, 153, 255, 0.16)";
      this.ctx.strokeStyle = "rgba(79, 153, 255, 0.9)";
      this.ctx.lineWidth = 1;
      this.ctx.fillRect(x, y, width, height);
      this.ctx.strokeRect(x, y, width, height);
      this.ctx.restore();
    }

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

    const shapes = zSorted(this.shapeStore.getShapes().filter((shape) => shape.visible !== false));
    const selectedIds = Array.isArray(this.appState.selectedIds) ? this.appState.selectedIds : [];
    const selectionSet = new Set(selectedIds);
    const measurementMode = this.appState.measurementMode ?? "smart";
    const currentlyDrawing = !!this.appState.previewShape;
    const shouldHideMeasurements = measurementMode === "off";

    const polygons = shapes.filter((shape) => shape.type === "polygon");
    const lines = shapes.filter((shape) => shape.type === "line");
    const measurements = shapes.filter((shape) => shape.type === "measurement");
    const others = shapes.filter((shape) => !["polygon", "line", "measurement"].includes(shape.type));

    for (const polygon of polygons) polygon.drawFill?.(this.ctx, this.camera, this.appState);
    for (const polygon of polygons) polygon.drawStroke?.(this.ctx, this.camera, this.appState);
    for (const line of lines) line.drawStroke?.(this.ctx, this.camera, this.appState) ?? line.draw(this.ctx, this.camera, this.appState);

    if (!shouldHideMeasurements) {
      if (measurementMode === "on") {
        for (const polygon of polygons) polygon.drawDimensions?.(this.ctx, this.camera, this.appState);
        for (const line of lines) line.drawDimensions?.(this.ctx, this.camera, this.appState);
      } else if (measurementMode === "smart" && selectionSet.size > 0) {
        for (const polygon of polygons) {
          if (selectionSet.has(polygon.id)) {
            polygon.drawDimensions?.(this.ctx, this.camera, this.appState);
          }
        }

        for (const line of lines) {
          if (selectionSet.has(line.id)) {
            line.drawDimensions?.(this.ctx, this.camera, this.appState);
          }
        }
      }
    }



    const erasePreview = this.appState.erasePreview;
    if (erasePreview?.affectedLineIds?.length) {
      const affected = new Set(erasePreview.affectedLineIds);
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(255, 118, 118, 0.9)";
      this.ctx.lineWidth = 3;
      this.ctx.setLineDash([6, 4]);
      for (const line of lines) {
        if (!affected.has(line.id)) continue;
        const s = this.camera.worldToScreen(line.start);
        const e = this.camera.worldToScreen(line.end);
        this.ctx.beginPath();
        this.ctx.moveTo(s.x, s.y);
        this.ctx.lineTo(e.x, e.y);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    if (erasePreview?.point && Number.isFinite(erasePreview.sizePx)) {
      const center = this.camera.worldToScreen(erasePreview.point);
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(255, 118, 118, 0.95)";
      this.ctx.fillStyle = "rgba(255, 118, 118, 0.16)";
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(center.x, center.y, erasePreview.sizePx, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    for (const measurement of measurements) measurement.draw(this.ctx, this.camera, this.appState);
    for (const other of others) other.draw(this.ctx, this.camera, this.appState);

    for (const id of selectedIds) {
      const selectedShape = this.shapeStore.getShapeById(id);
      if (!selectedShape || selectedShape.visible === false) continue;
      selectedShape.drawSelectionOverlay?.(this.ctx, this.camera, this.appState);
    }

    if (this.appState.previewShape) {
      this.appState.previewShape.draw(this.ctx, this.camera, {
        ...this.appState,
        currentlyDrawing,
        forceMeasurements: measurementMode !== "off",
      });
    }


    if (this.appState.marqueeRect) {
      const { x, y, width, height } = this.appState.marqueeRect;
      this.ctx.save();
      this.ctx.fillStyle = "rgba(79, 153, 255, 0.16)";
      this.ctx.strokeStyle = "rgba(79, 153, 255, 0.9)";
      this.ctx.lineWidth = 1;
      this.ctx.fillRect(x, y, width, height);
      this.ctx.strokeRect(x, y, width, height);
      this.ctx.restore();
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
