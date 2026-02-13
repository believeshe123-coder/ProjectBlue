import { Shape } from "./shape.js";
import { distance, isPointInPolygon } from "../utils/math.js";
import { isoUVToWorld, worldToIsoUV } from "../core/isoGrid.js";
import { buildDistanceLabel } from "../utils/measurement.js";

export class PolygonShape extends Shape {
  constructor({ id, pointsWorld = [], pointsUV = [], sourceLineIds = [], strokeColor, strokeWidth = 1, fillColor, fillAlpha = 1, zIndex = 0, createdAt, ...rest }) {
    super({
      id,
      ...rest,
      type: "polygon-shape",
      strokeColor,
      strokeWidth,
      fillColor,
      fillOpacity: fillAlpha,
      fillEnabled: fillAlpha > 0 && fillColor !== "transparent",
    });

    this.pointsUV = (pointsUV.length ? pointsUV : pointsWorld.map((point) => worldToIsoUV(point))).map((point) => ({ ...point }));
    this.syncWorldFromUV();
    this.sourceLineIds = Array.isArray(sourceLineIds) ? [...sourceLineIds] : [];
    this.fillAlpha = Number.isFinite(fillAlpha) ? fillAlpha : 1;
    this.zIndex = zIndex;
    this.createdAt = createdAt ?? Date.now();
  }



  syncWorldFromUV() {
    this.pointsWorld = this.pointsUV.map((point) => isoUVToWorld(point.u, point.v));
  }

  syncUVFromWorld() {
    this.pointsUV = this.pointsWorld.map((point) => worldToIsoUV(point));
  }

  setUVPoints(pointsUV) {
    this.pointsUV = pointsUV.map((point) => ({ ...point }));
    this.syncWorldFromUV();
  }

  get isClosed() {
    return true;
  }

  getBounds() {
    if (this.pointsWorld.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = this.pointsWorld[0].x;
    let maxX = this.pointsWorld[0].x;
    let minY = this.pointsWorld[0].y;
    let maxY = this.pointsWorld[0].y;

    for (const point of this.pointsWorld) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    return { minX, minY, maxX, maxY };
  }

  containsPoint(point, toleranceWorld = 0) {
    if (isPointInPolygon(point, this.pointsWorld)) {
      return true;
    }

    if (toleranceWorld <= 0) {
      return false;
    }

    return this.pointsWorld.some((polygonPoint) => distance(point, polygonPoint) <= toleranceWorld);
  }

  drawFill(ctx, camera) {
    if (this.pointsWorld.length < 3 || !this.fillEnabled || this.fillAlpha <= 0 || this.fillColor === "transparent") {
      return;
    }

    const screenPoints = this.pointsWorld.map((point) => camera.worldToScreen(point));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i += 1) {
      ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
    ctx.closePath();
    ctx.globalAlpha = this.fillAlpha;
    ctx.fillStyle = this.fillColor;
    ctx.fill();
    ctx.restore();
  }

  drawStroke(ctx, camera) {
    if (this.pointsWorld.length < 2) {
      return;
    }

    const screenPoints = this.pointsWorld.map((point) => camera.worldToScreen(point));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i += 1) {
      ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
    ctx.closePath();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = this.strokeWidth;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    ctx.stroke();
    ctx.restore();
  }

  drawSelectionOverlay(ctx, camera) {
    if (!this.selected || this.pointsWorld.length < 2) {
      return;
    }

    const screenPoints = this.pointsWorld.map((point) => camera.worldToScreen(point));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i += 1) {
      ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
  }

  drawDimensions(ctx, camera, appState) {
    if (this.pointsWorld.length < 2) {
      return;
    }

    const { unitPerCell = 1, unitName = "ft" } = appState;

    for (let i = 0; i < this.pointsWorld.length; i += 1) {
      const start = this.pointsWorld[i];
      const end = this.pointsWorld[(i + 1) % this.pointsWorld.length];
      const startScreen = camera.worldToScreen(start);
      const endScreen = camera.worldToScreen(end);
      const midScreen = {
        x: (startScreen.x + endScreen.x) / 2,
        y: (startScreen.y + endScreen.y) / 2,
      };

      const label = buildDistanceLabel({
        startUV: this.pointsUV[i],
        endUV: this.pointsUV[(i + 1) % this.pointsUV.length],
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
      const boxW = textWidth + padX * 2;
      const boxH = 18;
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(midScreen.x - boxW / 2, midScreen.y - boxH / 2, boxW, boxH);
      ctx.fillStyle = "#ecf8ff";
      ctx.fillText(label, midScreen.x, midScreen.y);
      ctx.restore();
    }
  }

  draw(ctx, camera, appState = {}) {
    this.drawFill(ctx, camera);
    this.drawStroke(ctx, camera);
    this.drawDimensions(ctx, camera, appState);
    this.drawSelectionOverlay(ctx, camera);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: "polygon-shape",
      pointsWorld: this.pointsWorld.map((point) => ({ ...point })),
      pointsUV: this.pointsUV.map((point) => ({ ...point })),
      sourceLineIds: [...this.sourceLineIds],
      fillAlpha: this.fillAlpha,
      zIndex: this.zIndex,
      createdAt: this.createdAt,
    };
  }

  static fromJSON(serialized) {
    return new PolygonShape(serialized);
  }
}
