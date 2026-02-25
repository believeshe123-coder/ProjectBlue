import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { getLineStyle, getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

const CURVE_SEGMENTS = 24;

function evaluateQuadraticBezier(start, control, end, t) {
  const oneMinusT = 1 - t;
  const x = (oneMinusT * oneMinusT * start.x)
    + (2 * oneMinusT * t * control.x)
    + (t * t * end.x);
  const y = (oneMinusT * oneMinusT * start.y)
    + (2 * oneMinusT * t * control.y)
    + (t * t * end.y);
  return { x, y };
}

function createCurveSegments(start, control, end, lineStyle) {
  const segments = [];
  let previousPoint = start;
  for (let index = 1; index <= CURVE_SEGMENTS; index += 1) {
    const t = index / CURVE_SEGMENTS;
    const currentPoint = evaluateQuadraticBezier(start, control, end, t);
    segments.push(new Line({
      ...lineStyle,
      start: previousPoint,
      end: currentPoint,
    }));
    previousPoint = currentPoint;
  }
  return segments;
}

export class CurveTool extends BaseTool {
  constructor(context) {
    super(context);
    this.startPoint = null;
    this.controlPoint = null;
  }

  resetCurve() {
    this.startPoint = null;
    this.controlPoint = null;
    this.context.appState.previewShape = null;
  }

  onActivate() {
    this.resetCurve();
  }

  onDeactivate() {
    this.resetCurve();
    this.context.appState.snapIndicator = null;
    this.context.appState.snapDebugStatus = "SNAP: OFF";
  }

  onMouseDown({ screenPoint }) {
    const { appState, shapeStore } = this.context;
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.startPoint) {
      this.startPoint = snapped.pt;
      return;
    }

    if (!this.controlPoint) {
      this.controlPoint = snapped.pt;
      return;
    }

    this.context.pushHistoryState?.();
    const segments = createCurveSegments(this.startPoint, this.controlPoint, snapped.pt, getLineStyle(appState));
    for (const segment of segments) {
      shapeStore.addShape(segment);
    }
    this.resetCurve();
    appState.snapIndicator = null;
    appState.snapDebugStatus = "SNAP: OFF";
  }

  onMouseMove({ screenPoint }) {
    const { appState } = this.context;
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.startPoint) {
      appState.previewShape = null;
      return;
    }

    const style = getLineStyle(appState);
    if (!this.controlPoint) {
      appState.previewShape = new Line({
        ...style,
        strokeOpacity: Math.min(0.9, appState.currentStyle.strokeOpacity),
        start: this.startPoint,
        end: snapped.pt,
      });
      return;
    }

    appState.previewShape = new Line({
      ...style,
      strokeOpacity: Math.min(0.9, appState.currentStyle.strokeOpacity),
      start: this.controlPoint,
      end: snapped.pt,
    });
  }

  onKeyDown(event) {
    if (event.key === "Escape" || event.key === "Enter") {
      this.resetCurve();
    }
  }
}
