import { Shape } from "./shape.js";
import { isoUVToWorld } from "../core/isoGrid.js";

export class FillRegion extends Shape {
  constructor({ id, regionId, uvCycle = [], color = "#4aa3ff", alpha = 1, createdAt, zIndex = -1000, ...rest }) {
    super({
      id: id ?? `fill:${regionId}`,
      ...rest,
      type: "fillRegion",
      strokeColor: "transparent",
      strokeWidth: 0,
      fillColor: color,
      fillOpacity: alpha,
      fillEnabled: true,
      zIndex,
    });

    this.regionId = regionId ?? id ?? null;
    this.uvCycle = uvCycle.map((point) => ({ ...point }));
    this.color = color;
    this.alpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    this.createdAt = createdAt ?? Date.now();
    this.zIndex = Number.isFinite(zIndex) ? zIndex : -1000;
    this.syncWorldFromUV();
  }

  setRegionCycle(uvCycle = []) {
    this.uvCycle = uvCycle.map((point) => ({ ...point }));
    this.syncWorldFromUV();
  }

  syncWorldFromUV() {
    this.pointsWorld = this.uvCycle.map((point) => isoUVToWorld(point.u, point.v));
    this.updateBounds();
  }

  updateBounds() {
    if (!this.pointsWorld.length) {
      this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      return;
    }

    const xs = this.pointsWorld.map((point) => point.x);
    const ys = this.pointsWorld.map((point) => point.y);
    this.bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }

  drawFill(ctx, camera) {
    if (this.pointsWorld.length < 3) return;
    ctx.save();
    ctx.beginPath();
    const first = camera.worldToScreen(this.pointsWorld[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < this.pointsWorld.length; i += 1) {
      const p = camera.worldToScreen(this.pointsWorld[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.color;
    ctx.fill();
    ctx.restore();
  }

  draw(_ctx, _camera) {
    // Drawn by renderer in a fill pass.
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: "fillRegion",
      regionId: this.regionId,
      uvCycle: this.uvCycle.map((point) => ({ ...point })),
      color: this.color,
      alpha: this.alpha,
      createdAt: this.createdAt,
      zIndex: this.zIndex,
    };
  }

  static fromJSON(serialized) {
    return new FillRegion({
      ...serialized,
      regionId: serialized.regionId ?? serialized.id,
      uvCycle: serialized.uvCycle ?? [],
      color: serialized.color ?? serialized.fillColor ?? "#4aa3ff",
      alpha: serialized.alpha ?? serialized.fillOpacity ?? 1,
    });
  }
}
