import { Shape } from "./shape.js";
import { distancePointToSegment } from "../utils/math.js";
import { isoUVToWorld, worldToIsoUV } from "../core/isoGrid.js";
import { buildDistanceLabel } from "../utils/measurement.js";

export class Line extends Shape {
  constructor({ start, end, startUV, endUV, ...rest }) {
    super({ ...rest, type: "line" });
    this.startUV = startUV ? { ...startUV } : worldToIsoUV(start);
    this.endUV = endUV ? { ...endUV } : worldToIsoUV(end);
    this.syncWorldFromUV();
  }

  syncWorldFromUV() {
    this.start = isoUVToWorld(this.startUV.u, this.startUV.v);
    this.end = isoUVToWorld(this.endUV.u, this.endUV.v);
  }

  syncUVFromWorld() {
    this.startUV = worldToIsoUV(this.start);
    this.endUV = worldToIsoUV(this.end);
  }

  setUVPoints(startUV, endUV) {
    this.startUV = { ...startUV };
    this.endUV = { ...endUV };
    this.syncWorldFromUV();
  }

  drawDimensionLabel(ctx, appState, midScreen) {
    const { unitPerCell = 1, unitName = "ft" } = appState;
    const isoStart = this.startUV;
    const isoEnd = this.endUV;
    const label = buildDistanceLabel({
      startUV: isoStart,
      endUV: isoEnd,
      unitPerCell,
      unitName,
      showGridUnits: appState.showGridUnits,
    });

    ctx.save();
    ctx.font = "11px Tahoma, Verdana, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const textWidth = ctx.measureText(label).width;
    const padX = 6;
    const padY = 3;
    const boxW = textWidth + padX * 2;
    const boxH = 18;

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(midScreen.x - boxW / 2, midScreen.y - boxH / 2, boxW, boxH);

    ctx.fillStyle = "#ecf8ff";
    ctx.fillText(label, midScreen.x, midScreen.y + padY * 0.15);
    ctx.restore();
  }

  drawStroke(ctx, camera) {
    const s = camera.worldToScreen(this.start);
    const e = camera.worldToScreen(this.end);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = this.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.restore();
  }

  drawDimensions(ctx, camera, appState = {}) {
    const s = camera.worldToScreen(this.start);
    const e = camera.worldToScreen(this.end);
    const midScreen = {
      x: (s.x + e.x) / 2,
      y: (s.y + e.y) / 2,
    };
    this.drawDimensionLabel(ctx, appState, midScreen);
  }

  drawSelectionOverlay(ctx, camera) {
    if (!this.selected) {
      return;
    }

    const s = camera.worldToScreen(this.start);
    const e = camera.worldToScreen(this.end);

    ctx.save();
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = this.strokeWidth + 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx, camera, appState = {}) {
    this.drawStroke(ctx, camera, appState);
    this.drawDimensions(ctx, camera, appState);
    this.drawSelectionOverlay(ctx, camera, appState);
  }

  containsPoint(point, toleranceWorld = 6) {
    return distancePointToSegment(point, this.start, this.end) <= toleranceWorld;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      start: { ...this.start },
      end: { ...this.end },
      startUV: { ...this.startUV },
      endUV: { ...this.endUV },
    };
  }
}
