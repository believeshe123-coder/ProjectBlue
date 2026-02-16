import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { PolygonShape } from "../models/polygonShape.js";
import { distance } from "../utils/math.js";
import { getIsoSpacingWorld } from "../core/isoGrid.js";
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
    this.chainPoints = [];
    this.chainLineIds = [];
  }

  onDeactivate() {
    this.chainStart = null;
    this.lastPoint = null;
    this.chainPoints = [];
    this.chainLineIds = [];
    this.context.appState.previewShape = null;
    this.context.appState.snapIndicator = null;
    this.context.appState.snapDebugStatus = "SNAP: OFF";
  }

  finishChain() {
    this.chainStart = null;
    this.lastPoint = null;
    this.chainPoints = [];
    this.chainLineIds = [];
    this.context.appState.previewShape = null;
  }

  hasClosableLoop() {
    return this.chainPoints.length >= 3 && this.chainStart && this.lastPoint;
  }

  sanitizePolygonPoints(points = []) {
    const deduped = [];
    for (const point of points) {
      if (!deduped.length) {
        deduped.push({ ...point });
        continue;
      }

      const prev = deduped[deduped.length - 1];
      if (prev.x === point.x && prev.y === point.y) continue;
      deduped.push({ ...point });
    }

    if (deduped.length >= 2) {
      const first = deduped[0];
      const last = deduped[deduped.length - 1];
      if (first.x === last.x && first.y === last.y) {
        deduped.pop();
      }
    }

    return deduped;
  }

  commitClosedPolygon() {
    const { appState, shapeStore } = this.context;
    if (!this.hasClosableLoop()) {
      this.finishChain();
      return false;
    }

    const pointsWorld = this.sanitizePolygonPoints(this.chainPoints);
    const uniquePointCount = new Set(pointsWorld.map((point) => `${point.x}:${point.y}`)).size;
    if (uniquePointCount < 3) {
      this.finishChain();
      appState.notifyStatus?.("Need at least 3 unique points to close shape", 1400);
      return false;
    }

    const polygon = new PolygonShape({
      pointsWorld,
      sourceLineIds: [...this.chainLineIds],
      strokeColor: appState.currentStyle.strokeColor,
      strokeWidth: appState.currentStyle.strokeWidth,
      fillColor: appState.currentStyle.fillColor,
      fillAlpha: 1,
      zIndex: appState.currentStyle.zIndex ?? 0,
      createdAt: Date.now(),
    });

    if (appState.debugFillWorkflow) {
      const bounds = polygon.getBounds();
      console.debug("[close-shape] polygon created", {
        pointsCount: pointsWorld.length,
        bounds,
      });
    }

    this.context.pushHistoryState?.();
    shapeStore.addShape(polygon);
    console.log("[CLOSE] committed polygon", polygon.id, "polygons now:", shapeStore.getPolygons().length);
    for (const lineId of this.chainLineIds) {
      const line = shapeStore.getShapeById(lineId);
      if (line?.type === "line") {
        line.sourceForPolygonId = polygon.id;
      }
    }
    this.finishChain();
    return true;
  }

  closeShapeNow() {
    if (!this.hasClosableLoop()) {
      this.context.appState.notifyStatus?.("Need at least 3 points to close shape", 1200);
      return false;
    }
    const committed = this.commitClosedPolygon();
    if (committed) {
      this.context.appState.notifyStatus?.("Shape closed", 1000);
    }
    return committed;
  }

  onMouseDown({ event, screenPoint }) {
    const { appState, shapeStore } = this.context;

    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.chainStart) {
      this.chainStart = snapped.pt;
      this.lastPoint = snapped.pt;
      this.chainPoints = [snapped.pt];
      this.chainLineIds = [];
      return;
    }

    const thresholdWorld = getIsoSpacingWorld() * 0.35;
    const shouldClose = this.chainPoints.length >= 3 && distance(snapped.pt, this.chainStart) <= thresholdWorld;
    if (shouldClose) {
      this.commitClosedPolygon();
      return;
    }

    if (snapped.pt.x === this.lastPoint.x && snapped.pt.y === this.lastPoint.y) {
      if (event.detail >= 2) {
        this.finishChain();
      }
      return;
    }

    this.context.pushHistoryState?.();
    const segment = createLine(this.lastPoint, snapped.pt, getLineStyle(appState));
    shapeStore.addShape(segment);
    this.chainLineIds.push(segment.id);
    this.lastPoint = snapped.pt;
    this.chainPoints.push(snapped.pt);

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
    if (event.key === "Escape") {
      this.finishChain();
      return;
    }

    if (event.key === "Enter" || event.key.toLowerCase() === "c") {
      this.closeShapeNow();
    }
  }
}
