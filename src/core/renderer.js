import { drawIsoGrid, isoUVToWorld, worldToIsoUV } from "./isoGrid.js";

function zSorted(shapes) {
  return [...shapes].sort((a, b) => {
    const zDiff = (a.zIndex ?? 0) - (b.zIndex ?? 0);
    if (zDiff !== 0) return zDiff;
    const createdDiff = (a.createdAt ?? 0) - (b.createdAt ?? 0);
    if (createdDiff !== 0) return createdDiff;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
}

function drawPolygonDebugOutlines(ctx, camera, polygons, { strokeStyle = "#ff3cf7", lineWidth = 2, alpha = 1 } = {}) {
  if (!Array.isArray(polygons) || polygons.length === 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash([8, 5]);

  for (const polygon of polygons) {
    if (!polygon?.pointsWorld || polygon.pointsWorld.length < 2) continue;
    const screenPoints = polygon.pointsWorld.map((point) => camera.worldToScreen(point));
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i += 1) {
      ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  ctx.restore();
}

function drawRegionDebugOverlay(ctx, camera, regions = []) {
  if (!Array.isArray(regions) || regions.length === 0) return;

  ctx.save();
  ctx.setLineDash([10, 6]);
  ctx.lineWidth = 2;
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    if (!region?.uvCycle || region.uvCycle.length < 3) continue;

    const color = `hsl(${(index * 41) % 360} 95% 60%)`;
    const worldPoints = region.uvCycle.map((point) => isoUVToWorld(point.u, point.v));
    const screenPoints = worldPoints.map((point) => camera.worldToScreen(point));

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i += 1) {
      ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    const center = screenPoints.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    center.x /= screenPoints.length;
    center.y /= screenPoints.length;

    const label = `${index} | ${Math.abs(region.area).toFixed(2)}`;
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(center.x - 44, center.y - 10, 88, 20);
    ctx.fillStyle = color;
    ctx.fillText(label, center.x, center.y + 0.5);
  }

  ctx.restore();
}



function drawSelectedRegionOutline(ctx, camera, region) {
  if (!region?.uvCycle || region.uvCycle.length < 3) return;
  const worldPoints = region.uvCycle.map((point) => isoUVToWorld(point.u, point.v));
  const first = camera.worldToScreen(worldPoints[0]);
  ctx.save();
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < worldPoints.length; i += 1) {
    const point = camera.worldToScreen(worldPoints[i]);
    ctx.lineTo(point.x, point.y);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
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
    this.ctx.globalAlpha = 1;
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

    const shapes = zSorted(this.shapeStore.getRenderableShapesSorted().filter((shape) => shape.visible !== false));
    const selectedIds = Array.isArray(this.appState.selectedIds) ? this.appState.selectedIds : [];
    const selectionSet = new Set(selectedIds);
    const measurementMode = this.appState.measurementMode ?? "smart";
    const currentlyDrawing = !!this.appState.previewShape;
    const shouldHideMeasurements = measurementMode === "off";

    const polygons = shapes.filter((shape) => shape.type === "polygon");
    const fillRegions = shapes.filter((shape) => shape.type === "fillRegion");
    const faces = shapes.filter((shape) => shape.type === "face");
    const lines = shapes.filter((shape) => shape.type === "line");
    const measurements = shapes.filter((shape) => shape.type === "measurement");
    const others = shapes.filter((shape) => !["polygon", "fillRegion", "face", "line", "measurement"].includes(shape.type));

    const computedRegions = this.shapeStore.getComputedRegions();
    for (const fillRegion of fillRegions) fillRegion.drawFill?.(this.ctx, this.camera, this.appState);
    for (const face of faces) face.drawFill?.(this.ctx, this.camera, this.appState);
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

    if (this.appState.selectedRegionKey) {
      const selectedRegion = computedRegions.find((region) => region.id === this.appState.selectedRegionKey);
      drawSelectedRegionOutline(this.ctx, this.camera, selectedRegion);
    }

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

    const shouldDrawPolygonDebug = this.appState.debugPolygons === true || this.appState.flashPolygonDebugOutlines === true;
    if (shouldDrawPolygonDebug) {
      drawPolygonDebugOutlines(this.ctx, this.camera, polygons, {
        strokeStyle: this.appState.debugPolygonStrokeColor ?? "#ff3cf7",
        lineWidth: 2,
        alpha: this.appState.debugPolygons === true ? 1 : 0.95,
      });
      if (this.appState.flashPolygonDebugOutlines === true) {
        this.appState.flashPolygonDebugOutlines = false;
      }
    }

    if (this.appState.debugRegions === true) {
      drawRegionDebugOverlay(this.ctx, this.camera, computedRegions);
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
