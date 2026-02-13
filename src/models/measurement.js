import { Shape } from "./shape.js";
import { distancePointToSegment } from "../utils/math.js";
import { worldToIsoUV } from "../core/isoGrid.js";
import { buildDistanceLabel } from "../utils/measurement.js";

export class Measurement extends Shape {
  constructor({ a, b, ...rest }) {
    super({ ...rest, type: "measurement" });
    this.a = { ...a };
    this.b = { ...b };
  }

  buildLabel(appState) {
    const uvA = worldToIsoUV(this.a);
    const uvB = worldToIsoUV(this.b);
    const u1 = Math.round(uvA.u);
    const v1 = Math.round(uvA.v);
    const u2 = Math.round(uvB.u);
    const v2 = Math.round(uvB.v);

    return buildDistanceLabel({
      startUV: { u: u1, v: v1 },
      endUV: { u: u2, v: v2 },
      unitPerCell: appState.unitPerCell,
      unitName: appState.unitName,
    });
  }

  draw(ctx, camera, appState) {
    const start = camera.worldToScreen(this.a);
    const end = camera.worldToScreen(this.b);
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const label = this.buildLabel(appState);

    ctx.save();
    ctx.globalAlpha = this.strokeOpacity;
    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = this.strokeWidth;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.font = "12px Tahoma, Verdana, Arial, sans-serif";
    const metrics = ctx.measureText(label);
    const padX = 6;
    const padY = 4;
    const boxX = mid.x - metrics.width / 2 - padX;
    const boxY = mid.y - 12 - padY;
    const boxW = metrics.width + padX * 2;
    const boxH = 18 + padY;

    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, mid.x - metrics.width / 2, mid.y + 2);

    if (this.selected) {
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = this.strokeWidth + 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  containsPoint(point, toleranceWorld = 6) {
    return distancePointToSegment(point, this.a, this.b) <= toleranceWorld;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      a: { ...this.a },
      b: { ...this.b },
    };
  }
}
