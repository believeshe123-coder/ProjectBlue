import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { getLineStyle, getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

const MIN_CURVE_SEGMENTS = 32;
const MAX_CURVE_SEGMENTS = 192;
const CURVE_SEGMENT_LENGTH = 12;

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

function distance(pointA, pointB) {
  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  return Math.hypot(dx, dy);
}

function getCurveSegmentCount(start, control, end) {
  const controlPathLength = distance(start, control) + distance(control, end);
  const estimatedSegments = Math.ceil(controlPathLength / CURVE_SEGMENT_LENGTH);
  return Math.max(MIN_CURVE_SEGMENTS, Math.min(MAX_CURVE_SEGMENTS, estimatedSegments));
}

function createCurveSegments(start, control, end, lineStyle) {
  const segmentCount = getCurveSegmentCount(start, control, end);
  const segments = [];
  let previousPoint = start;
  for (let index = 1; index <= segmentCount; index += 1) {
    const t = index / segmentCount;
    const currentPoint = evaluateQuadraticBezier(start, control, end, t);
    segments.push(new Line({
      ...lineStyle,
      snapToGrid: false,
      start: previousPoint,
      end: currentPoint,
    }));
    previousPoint = currentPoint;
  }
  return segments;
}

class CurvePreviewShape {
  constructor({ start, control, end, style }) {
    this.start = start;
    this.control = control;
    this.end = end;
    this.style = style;
  }

  draw(ctx, camera) {
    const startScreen = camera.worldToScreen(this.start);
    const controlScreen = camera.worldToScreen(this.control);
    const endScreen = camera.worldToScreen(this.end);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.style.strokeColor;
    ctx.lineWidth = this.style.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.quadraticCurveTo(controlScreen.x, controlScreen.y, endScreen.x, endScreen.y);
    ctx.stroke();
    ctx.restore();
  }
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

    appState.previewShape = new CurvePreviewShape({
      start: this.startPoint,
      control: this.controlPoint,
      end: snapped.pt,
      style: {
        ...style,
        strokeOpacity: Math.min(0.9, appState.currentStyle.strokeOpacity),
      },
    });
  }

  onKeyDown(event) {
    if (event.key === "Escape" || event.key === "Enter") {
      this.resetCurve();
    }
  }
}

export { createCurveSegments };
