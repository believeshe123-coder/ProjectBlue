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
  if (selected) {
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
  }
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
    drawIsoGrid(this.ctx, this.camera, canvasCssW, canvasCssH, { gridColor: this.appState.theme?.gridColor });

    const selectedIds = this.appState.selectedIds instanceof Set ? [...this.appState.selectedIds] : [];
    const selectionSet = new Set(selectedIds);

    const stabilityMode = this.appState.stabilityMode === true;
    let computedRegions = [];

    if (stabilityMode) {
      const lines = Object.values(this.shapeStore.nodes)
        .filter((node) => node?.kind === "shape" && node.shapeType === "line" && node.style?.visible !== false)
        .map((node) => this.shapeStore.toShapeView(node.id))
        .filter(Boolean);
      for (const line of lines) drawLine(this.ctx, this.camera, line, selectionSet.has(line.id));
    } else {
      const shapes = this.shapeStore.getRenderableShapesSorted().filter((shape) => shape.visible !== false);
      const fillRegions = this.shapeStore.getFillRegions();
      const faces = shapes.filter((shape) => shape.type === "face");
      const lines = shapes.filter((shape) => shape.type === "line");

      computedRegions = this.shapeStore.getComputedRegions();
      for (const fillRegion of fillRegions) fillRegion.drawFill?.(this.ctx, this.camera, this.appState);
      for (const face of faces) drawFace(this.ctx, this.camera, face, selectionSet.has(face.id));
      for (const line of lines) drawLine(this.ctx, this.camera, line, selectionSet.has(line.id));

      if (this.appState.selectedRegionKey) {
        const selectedRegion = computedRegions.find((region) => region.id === this.appState.selectedRegionKey);
        drawSelectedRegionOutline(this.ctx, this.camera, selectedRegion);
      }
    }

    if (this.appState.previewShape) {
      this.appState.previewShape.draw(this.ctx, this.camera, { ...this.appState, forceMeasurements: true });
    }

    if (!stabilityMode && this.appState.debugRegions === true) drawRegionDebugOverlay(this.ctx, this.camera, computedRegions);

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
