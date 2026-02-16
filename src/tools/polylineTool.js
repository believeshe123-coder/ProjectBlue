import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { getLineStyle, getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

function createLine(start, end, lineStyle) {
  return new Line({
    ...lineStyle,
    start,
    end,
  });
}

export class PolylineTool extends BaseTool {
  constructor(context) {
    super(context);
    this.chainStart = null;
    this.lastPoint = null;
  }

  onDeactivate() {
    this.finishChain();
    this.context.appState.snapIndicator = null;
    this.context.appState.snapDebugStatus = "SNAP: OFF";
  }

  finishChain() {
    this.chainStart = null;
    this.lastPoint = null;
    this.context.appState.previewShape = null;
  }

  onMouseDown({ event, screenPoint }) {
    const { appState, shapeStore } = this.context;

    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.chainStart) {
      this.chainStart = snapped.pt;
      this.lastPoint = snapped.pt;
      return;
    }

    if (snapped.pt.x === this.lastPoint.x && snapped.pt.y === this.lastPoint.y) {
      if (event.detail >= 2) this.finishChain();
      return;
    }

    this.context.pushHistoryState?.();
    const segment = createLine(this.lastPoint, snapped.pt, getLineStyle(appState));
    shapeStore.addShape(segment);
    this.lastPoint = snapped.pt;

    if (!appState.continuePolyline || event.detail >= 2) {
      this.finishChain();
    }
  }

  onMouseMove({ screenPoint }) {
    const { appState } = this.context;
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.lastPoint) {
      appState.previewShape = null;
      return;
    }

    appState.previewShape = createLine(this.lastPoint, snapped.pt, getLineStyle(appState));
    appState.previewShape.strokeOpacity = Math.min(0.9, appState.currentStyle.strokeOpacity);
  }

  onKeyDown(event) {
    if (event.key === "Escape" || event.key === "Enter") {
      this.finishChain();
    }
  }
}
