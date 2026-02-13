import { Shape } from "./shape.js";
import { distance, isPointInPolygon } from "../utils/math.js";

export class Polygon extends Shape {
  constructor({ points = [], closed = true, ...rest }) {
    super({ ...rest, type: "polygon" });
    this.points = points.map((point) => ({ ...point }));
    this.closed = closed;
  }

  draw(ctx, camera) {
    if (this.points.length < 2) {
      return;
    }

    const screenPoints = this.points.map((point) => camera.worldToScreen(point));

    ctx.save();
    ctx.globalAlpha = this.fillOpacity;
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);

    for (let index = 1; index < screenPoints.length; index += 1) {
      ctx.lineTo(screenPoints[index].x, screenPoints[index].y);
    }

    if (this.closed) {
      ctx.closePath();
      if (this.fillEnabled && this.fillColor !== "transparent") {
        ctx.fillStyle = this.fillColor;
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = this.strokeWidth;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (this.selected) {
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = this.strokeWidth + 2;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
    }

    ctx.restore();
  }

  containsPoint(point, toleranceWorld = 0) {
    if (this.closed && isPointInPolygon(point, this.points)) {
      return true;
    }

    for (const polygonPoint of this.points) {
      if (distance(point, polygonPoint) <= toleranceWorld) {
        return true;
      }
    }

    return false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      points: this.points.map((point) => ({ ...point })),
      closed: this.closed,
    };
  }
}
