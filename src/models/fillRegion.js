import { Shape } from "./shape.js";
import { isPointInPolygon } from "../utils/math.js";
import { worldToIsoUV, isoUVToWorld } from "../core/isoGrid.js";

function normalizeContour(contour = []) {
  return contour
    .filter((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point) => ({ x: point.x, y: point.y }));
}

function normalizeContours(pointsWorld = [], contoursWorld = null) {
  if (Array.isArray(contoursWorld) && contoursWorld.length > 0) {
    return contoursWorld.map((contour) => normalizeContour(contour)).filter((contour) => contour.length >= 3);
  }

  const single = normalizeContour(pointsWorld);
  return single.length >= 3 ? [single] : [];
}

export class FillRegion extends Shape {
  constructor({ id, pointsWorld = [], contoursWorld = null, contoursUV = null, color = "#4aa3ff", alpha = 1, createdAt, zIndex = -1000, ...rest }) {
    super({
      id,
      ...rest,
      type: "fillRegion",
      strokeColor: "transparent",
      strokeWidth: 0,
      fillColor: color,
      fillOpacity: alpha,
      fillEnabled: true,
      zIndex,
    });

    this.contoursUV = Array.isArray(contoursUV) && contoursUV.length > 0
      ? contoursUV.map((contour) => contour.map((point) => ({ ...point })))
      : normalizeContours(pointsWorld, contoursWorld).map((contour) => contour.map((point) => worldToIsoUV(point)));

    this.syncWorldFromUV();
    this.color = color;
    this.alpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    this.fillColor = this.color;
    this.fillOpacity = this.alpha;
    this.createdAt = createdAt ?? Date.now();
    this.zIndex = Number.isFinite(zIndex) ? zIndex : -1000;
  }

  syncWorldFromUV() {
    this.contoursWorld = this.contoursUV
      .map((contour) => contour.map((point) => isoUVToWorld(point.u, point.v)))
      .filter((contour) => contour.length >= 3);

    this.pointsWorld = this.contoursWorld[0] ? this.contoursWorld[0].map((point) => ({ ...point })) : [];
  }

  setUVContours(contoursUV = []) {
    this.contoursUV = contoursUV.map((contour) => contour.map((point) => ({ ...point })));
    this.syncWorldFromUV();
  }

  drawFill(ctx, camera) {
    if (!this.contoursWorld.length) return;

    ctx.save();
    ctx.beginPath();
    for (const contour of this.contoursWorld) {
      const first = camera.worldToScreen(contour[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < contour.length; i += 1) {
        const point = camera.worldToScreen(contour[i]);
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
    }
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.fill("evenodd");
    ctx.restore();
  }

  drawSelectionOverlay(ctx, camera) {
    if (!this.selected || !this.contoursWorld.length) return;

    ctx.save();
    ctx.beginPath();
    for (const contour of this.contoursWorld) {
      const first = camera.worldToScreen(contour[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < contour.length; i += 1) {
        const point = camera.worldToScreen(contour[i]);
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
    }
    ctx.strokeStyle = "rgba(255, 209, 102, 0.95)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
  }

  draw(_ctx, _camera) {
    // FillRegions are drawn in a dedicated fill pass in the renderer.
  }

  containsPoint(point) {
    let inside = false;
    for (const contour of this.contoursWorld) {
      if (isPointInPolygon(point, contour)) inside = !inside;
    }
    return inside;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: "fillRegion",
      pointsWorld: this.pointsWorld.map((point) => ({ ...point })),
      contoursWorld: this.contoursWorld.map((contour) => contour.map((point) => ({ ...point }))),
      contoursUV: this.contoursUV.map((contour) => contour.map((point) => ({ ...point }))),
      color: this.color,
      alpha: this.alpha,
      createdAt: this.createdAt,
      zIndex: this.zIndex,
    };
  }

  static fromJSON(serialized) {
    return new FillRegion({
      ...serialized,
      color: serialized.color ?? serialized.fillColor ?? "#4aa3ff",
      alpha: serialized.alpha ?? serialized.fillOpacity ?? 1,
      pointsWorld: serialized.pointsWorld ?? [],
      contoursWorld: serialized.contoursWorld ?? null,
      contoursUV: serialized.contoursUV ?? null,
    });
  }
}
