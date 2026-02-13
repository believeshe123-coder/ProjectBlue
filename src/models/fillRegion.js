import { Shape } from "./shape.js";
import { isPointInPolygon } from "../utils/math.js";

export class FillRegion extends Shape {
  constructor({ points = [], ...rest }) {
    super({ ...rest, type: "fill-region" });
    this.points = points.map((point) => ({ ...point }));
  }

  draw(ctx, camera) {
    if (this.points.length < 3) {
      return;
    }

    const screenPoints = this.points.map((point) => camera.worldToScreen(point));

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    for (let i = 1; i < screenPoints.length; i += 1) {
      ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
    }
    ctx.closePath();
    if (this.fillEnabled && this.fillColor && this.fillColor !== "transparent") {
      ctx.globalAlpha = this.fillOpacity;
      ctx.fillStyle = this.fillColor;
      ctx.fill();
    }

    if (this.strokeWidth > 0 && this.strokeColor && this.strokeColor !== "transparent") {
      ctx.globalAlpha = this.strokeOpacity;
      ctx.strokeStyle = this.strokeColor;
      ctx.lineWidth = this.strokeWidth;
      ctx.stroke();
    }

    if (this.selected) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = Math.max(1, this.strokeWidth + 2);
      ctx.setLineDash([8, 6]);
      ctx.stroke();
    }

    ctx.restore();
  }

  containsPoint(point) {
    return isPointInPolygon(point, this.points);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      points: this.points.map((point) => ({ ...point })),
    };
  }
}
