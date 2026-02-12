import { Shape } from "./shape.js";
import { distancePointToSegment } from "../utils/math.js";

export class Line extends Shape {
  constructor({ start, end, ...rest }) {
    super({ ...rest, type: "line" });
    this.start = { ...start };
    this.end = { ...end };
  }

  draw(ctx, camera) {
    const s = camera.worldToScreen(this.start);
    const e = camera.worldToScreen(this.end);

    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = this.strokeWidth;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
    ctx.stroke();

    if (this.selected) {
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = this.strokeWidth + 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  containsPoint(point, toleranceWorld = 6) {
    return distancePointToSegment(point, this.start, this.end) <= toleranceWorld;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      start: { ...this.start },
      end: { ...this.end },
    };
  }
}
