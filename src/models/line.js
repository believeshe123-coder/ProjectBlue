import { Shape } from "./shape.js";
import { distancePointToSegment } from "../utils/math.js";
import { worldToIsoUV } from "../core/isoGrid.js";
import { buildDistanceLabel } from "../utils/measurement.js";

export class Line extends Shape {
  constructor({ start, end, ...rest }) {
    super({ ...rest, type: "line" });
    this.start = { ...start };
    this.end = { ...end };
  }

  drawDimensionLabel(ctx, appState, midScreen) {
    const { unitPerCell = 1, unitName = "ft" } = appState;
    const isoStart = worldToIsoUV(this.start);
    const isoEnd = worldToIsoUV(this.end);
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

  draw(ctx, camera, appState = {}) {
    const s = camera.worldToScreen(this.start);
    const e = camera.worldToScreen(this.end);

    ctx.save();
    ctx.globalAlpha = this.strokeOpacity;
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

    if (appState.showDimensions) {
      const midScreen = {
        x: (s.x + e.x) / 2,
        y: (s.y + e.y) / 2,
      };
      this.drawDimensionLabel(ctx, appState, midScreen);
    }
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
