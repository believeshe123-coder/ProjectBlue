import { drawIsoGrid, isoUVToWorld, worldToIsoUV } from "./isoGrid.js";

function drawRegionDebugOverlay(ctx, camera, regions = []) {
  if (!Array.isArray(regions) || regions.length === 0) return;
  ctx.save();
  ctx.setLineDash([10, 6]);
  ctx.lineWidth = 2;
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    if (!region?.uvCycle || region.uvCycle.length < 3) continue;
    const color = `hsl(${(index * 41) % 360} 95% 60%)`;
    const worldPoints = region.uvCycle.map((point) => isoUVToWorld(point.u, point.v));
    const screenPoints = worldPoints.map((point) => camera.worldToScreen(point));
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i += 1) ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    ctx.closePath();
    ctx.stroke();
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

function drawFace(ctx, camera, face, selected) {
  if (!face.pointsWorld?.length) return;
  const pts = face.pointsWorld.map((p) => camera.worldToScreen(p));
  ctx.save();
  ctx.globalAlpha = face.fillAlpha ?? 1;
  ctx.fillStyle = face.fillColor ?? "#4aa3ff";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
  if (selected) drawFaceSelectionOutline(ctx, camera, face);
  ctx.restore();
}

function drawFaceSelectionOutline(ctx, camera, face) {
  if (!face.pointsWorld?.length) return;
  const pts = face.pointsWorld.map((p) => camera.worldToScreen(p));
  ctx.save();
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}


export function drawErasePreview(ctx, camera, erasePreview) {
  if (!erasePreview?.point) return;
  const points = Array.isArray(erasePreview.pathPoints) && erasePreview.pathPoints.length
    ? erasePreview.pathPoints
    : [erasePreview.point];

  const baseStrokeWidth = Math.max(1, erasePreview.strokeWidthPx ?? 2);
  const outerStrokeWidth = baseStrokeWidth + 4;
  const innerStrokeWidth = Math.max(1, outerStrokeWidth - 3);

  const strokePath = () => {
    if (points.length >= 2) {
      const first = camera.worldToScreen(points[0]);
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < points.length; i += 1) {
        const p = camera.worldToScreen(points[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      return;
    }

    const center = camera.worldToScreen(points[0]);
    const halfLen = 10;
    ctx.beginPath();
    ctx.moveTo(center.x - halfLen, center.y);
    ctx.lineTo(center.x + halfLen, center.y);
    ctx.stroke();
  };

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = outerStrokeWidth;
  strokePath();

  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = innerStrokeWidth;
  strokePath();
  ctx.restore();
}


export function drawCursorMagnifier(ctx, camera, canvasCssW, canvasCssH, cursorPreview, sourceCanvas = ctx.canvas) {
  if (!cursorPreview?.screenPoint || !cursorPreview?.worldPoint) return;

  const radius = 68;
  const padding = 16;
  const centerX = canvasCssW - radius - padding;
  const centerY = canvasCssH - radius - padding;
  const magnification = 6.5;
  const focusScreen = cursorPreview.screenPoint;
  const focusWorld = cursorPreview.worldPoint;

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.translate(centerX, centerY);
  ctx.scale(magnification, magnification);
  ctx.translate(-focusScreen.x, -focusScreen.y);
  ctx.drawImage(sourceCanvas, 0, 0);

  const focusPoint = camera.worldToScreen(focusWorld);
  ctx.save();
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 1 / magnification;
  const crossLen = 7;
  ctx.beginPath();
  ctx.moveTo(focusPoint.x - crossLen, focusPoint.y);
  ctx.lineTo(focusPoint.x + crossLen, focusPoint.y);
  ctx.moveTo(focusPoint.x, focusPoint.y - crossLen);
  ctx.lineTo(focusPoint.x, focusPoint.y + crossLen);
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 1.5, 0, Math.PI * 2);
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2, true);
  ctx.fillStyle = "#0d1117";
  ctx.fill("evenodd");

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255, 209, 102, 0.95)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.fillText(`cursor x${magnification.toFixed(1)}`, centerX, centerY + radius + 14);
  ctx.restore();
}

function drawLine(ctx, camera, line, selected) {
  const s = camera.worldToScreen(line.start);
  const e = camera.worldToScreen(line.end);
  ctx.save();
  ctx.strokeStyle = line.strokeColor ?? "#fff";
  ctx.lineWidth = line.strokeWidth ?? 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(e.x, e.y);
  ctx.stroke();
  if (selected) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = (line.strokeWidth ?? 2) + 2;
    ctx.setLineDash([8, 6]);
    ctx.stroke();
  }
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
    this.renderFrameId = 0;
    this.cursorPreviewSnapshotCanvas = null;
  }

  getCursorPreviewSourceCanvas() {
    if (typeof document === "undefined") return this.ctx.canvas;
    const sourceCanvas = this.ctx.canvas;
    if (!sourceCanvas) return sourceCanvas;

    const snapshot = this.cursorPreviewSnapshotCanvas ?? document.createElement("canvas");
    if (snapshot.width !== sourceCanvas.width || snapshot.height !== sourceCanvas.height) {
      snapshot.width = sourceCanvas.width;
      snapshot.height = sourceCanvas.height;
    }

    const snapshotCtx = snapshot.getContext("2d");
    if (!snapshotCtx) return sourceCanvas;

    snapshotCtx.setTransform(1, 0, 0, 1, 0, 0);
    snapshotCtx.clearRect(0, 0, snapshot.width, snapshot.height);
    snapshotCtx.drawImage(sourceCanvas, 0, 0);
    this.cursorPreviewSnapshotCanvas = snapshot;
    return snapshot;
  }

  renderFrame() {
    this.ensureCanvasSize?.();
    this.appState.shapeStore = this.shapeStore;

    const { canvasCssW, canvasCssH, currentDpr } = this.getCanvasMetrics();
    this.renderFrameId += 1;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    this.ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = this.appState.theme?.bgColor ?? "#183547";
    this.ctx.fillRect(0, 0, canvasCssW, canvasCssH);
    drawIsoGrid(this.ctx, this.camera, canvasCssW, canvasCssH, { gridColor: this.appState.theme?.gridColor });

    const selectedIds = this.appState.selectedIds instanceof Set ? [...this.appState.selectedIds] : [];
    const selectionSet = new Set(selectedIds);
    if (this.appState.selectedType === "object" && selectedIds.length) {
      for (const objectId of selectedIds) {
        for (const childId of this.shapeStore.getDescendantIds?.(objectId) ?? []) {
          selectionSet.add(childId);
        }
      }
    }

    const disableSceneGraph = this.appState.disableSceneGraph === true;
    let computedRegions = [];

    if (disableSceneGraph) {
      const lines = this.shapeStore
        .getShapes()
        .filter((shape) => shape.type === "line" && shape.visible !== false);
      const fillRegions = this.shapeStore.getFillRegions();
      if (fillRegions?.length) console.log("[RENDER] fillRegions", fillRegions.length);
      computedRegions = this.shapeStore.getComputedRegions();
      if (this.appState.enableFill) {
        for (const fillRegion of fillRegions) fillRegion.drawFill?.(this.ctx, this.camera, this.appState);
      }
      for (const line of lines) drawLine(this.ctx, this.camera, line, selectionSet.has(line.id));

      if (this.appState.selectedRegionKey) {
        const selectedRegion = computedRegions.find((region) => region.id === this.appState.selectedRegionKey);
        drawSelectedRegionOutline(this.ctx, this.camera, selectedRegion);
      }
    } else {
      const shapes = this.shapeStore.getRenderableShapesSorted().filter((shape) => shape.visible !== false);
      const fillRegions = this.shapeStore.getFillRegions();
      if (fillRegions?.length) console.log("[RENDER] fillRegions", fillRegions.length);
      const faces = shapes.filter((shape) => shape.type === "face");
      const lines = shapes.filter((shape) => shape.type === "line");

      computedRegions = this.shapeStore.getComputedRegions();
      for (const fillRegion of fillRegions) fillRegion.drawFill?.(this.ctx, this.camera, this.appState);
      for (const face of faces) drawFace(this.ctx, this.camera, face, selectionSet.has(face.id));
      for (const line of lines) drawLine(this.ctx, this.camera, line, selectionSet.has(line.id));
      for (const face of faces) {
        if (!selectionSet.has(face.id)) continue;
        drawFaceSelectionOutline(this.ctx, this.camera, face);
      }

      if (this.appState.selectedRegionKey) {
        const selectedRegion = computedRegions.find((region) => region.id === this.appState.selectedRegionKey);
        drawSelectedRegionOutline(this.ctx, this.camera, selectedRegion);
      }
    }

    if (this.appState.marqueeRect) {
      const rect = this.appState.marqueeRect;
      this.ctx.save();
      this.ctx.fillStyle = "rgba(255, 209, 102, 0.15)";
      this.ctx.strokeStyle = "#ffd166";
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([6, 4]);
      this.ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      this.ctx.restore();
    }

    if (this.appState.previewShape) {
      this.appState.previewShape.draw(this.ctx, this.camera, { ...this.appState, forceMeasurements: true });
    }

    if (!disableSceneGraph && this.appState.debugRegions === true) drawRegionDebugOverlay(this.ctx, this.camera, computedRegions);

    if (this.appState.erasePreview) drawErasePreview(this.ctx, this.camera, this.appState.erasePreview);

    if (this.appState.cursorPreview) {
      const sourceCanvas = this.getCursorPreviewSourceCanvas();
      drawCursorMagnifier(this.ctx, this.camera, canvasCssW, canvasCssH, this.appState.cursorPreview, sourceCanvas);
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

    this.ctx.save();
    this.ctx.fillStyle = "rgba(255,255,255,0.7)";
    this.ctx.font = "11px monospace";
    this.ctx.textAlign = "right";
    this.ctx.fillText(`frame:${this.renderFrameId}`, canvasCssW - 8, canvasCssH - 8);
    this.ctx.restore();
  }
}
