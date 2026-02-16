import { Shape } from "./shape.js";
import { isPointInPolygon } from "../utils/math.js";

export class FaceShape extends Shape {
  constructor({ id, pointsWorld = [], fillColor = "#4aa3ff", fillAlpha = 1, regionKey = null, ...rest }) {
    super({
      id,
      ...rest,
      type: "face",
      fillColor,
      fillOpacity: fillAlpha,
      fillEnabled: true,
      strokeColor: rest.strokeColor ?? "transparent",
      strokeWidth: rest.strokeWidth ?? 0,
    });

    this.pointsWorld = Array.isArray(pointsWorld) ? pointsWorld.map((point) => ({ ...point })) : [];
    this.fillAlpha = Number.isFinite(fillAlpha) ? Math.max(0, Math.min(1, fillAlpha)) : 1;
    this.regionKey = typeof regionKey === "string" ? regionKey : null;
  }

  drawFill(ctx, camera) {
    if (this.pointsWorld.length < 3) return;
    ctx.save();
    ctx.globalAlpha = this.fillAlpha;
    ctx.fillStyle = this.fillColor;
    const first = camera.worldToScreen(this.pointsWorld[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < this.pointsWorld.length; i += 1) {
      const point = camera.worldToScreen(this.pointsWorld[i]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  draw(_ctx, _camera) {
    // Drawn in renderer face pass.
  }

  containsPoint(point, _toleranceWorld = 0) {
    return isPointInPolygon(point, this.pointsWorld);
  }

  getBounds() {
    if (!this.pointsWorld.length) return null;
    const xs = this.pointsWorld.map((point) => point.x);
    const ys = this.pointsWorld.map((point) => point.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }

  drawSelectionOverlay(ctx, camera) {
    if (!this.selected || this.pointsWorld.length < 3) return;
    ctx.save();
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    const first = camera.worldToScreen(this.pointsWorld[0]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < this.pointsWorld.length; i += 1) {
      const point = camera.worldToScreen(this.pointsWorld[i]);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: "face",
      pointsWorld: this.pointsWorld.map((point) => ({ ...point })),
      fillAlpha: this.fillAlpha,
      regionKey: this.regionKey,
    };
  }

  static fromJSON(serialized) {
    return new FaceShape({
      ...serialized,
      fillAlpha: serialized.fillAlpha ?? serialized.fillOpacity ?? 1,
      regionKey: serialized.regionKey ?? null,
    });
  }
}
