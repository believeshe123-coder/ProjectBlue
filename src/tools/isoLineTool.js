import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { snapWorldToIso } from "../core/isoGrid.js";
import { SNAP_PIXELS, getLineSnapPoints } from "../utils/snapping.js";

export class IsoLineTool extends BaseTool {
  constructor(context) {
    super(context);
    this.startPoint = null;
  }

  onDeactivate() {
    this.startPoint = null;
    this.context.appState.previewShape = null;
    this.context.appState.snapIndicator = null;
    this.context.appState.snapDebugStatus = null;
  }

  getSnappedPoint(screenPoint) {
    const { appState, camera, shapeStore } = this.context;
    const worldPoint = camera.screenToWorld(screenPoint);
    const thresholdWorld = SNAP_PIXELS / camera.zoom;
    const candidates = [];

    if (appState.snapToGrid) {
      const gridCandidate = snapWorldToIso(worldPoint);
      const gridDistance = Math.hypot(worldPoint.x - gridCandidate.x, worldPoint.y - gridCandidate.y);
      if (gridDistance <= thresholdWorld) {
        candidates.push({ pt: gridCandidate, kind: "grid", distance: gridDistance });
      }
    }

    if (appState.snapToMidpoints) {
      for (const snapPoint of getLineSnapPoints(shapeStore.getShapes())) {
        const point = { x: snapPoint.x, y: snapPoint.y };
        const dist = Math.hypot(worldPoint.x - point.x, worldPoint.y - point.y);
        if (dist <= thresholdWorld) {
          candidates.push({ pt: point, kind: snapPoint.type, distance: dist });
        }
      }
    }

    if (!candidates.length) {
      return { pt: worldPoint, snapped: false, kind: null };
    }

    candidates.sort((a, b) => a.distance - b.distance);
    const winner = candidates[0];
    return { pt: winner.pt, snapped: true, kind: winner.kind };
  }

  onMouseDown({ screenPoint }) {
    const { appState, layerStore, historyStore, shapeStore } = this.context;
    const activeLayer = layerStore.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      return;
    }

    const snapped = this.getSnappedPoint(screenPoint);

    if (!this.startPoint) {
      this.startPoint = snapped.pt;
      appState.snapIndicator = snapped.snapped ? { point: snapped.pt, kind: snapped.kind } : null;
      appState.snapDebugStatus = snapped.kind === "grid" ? "SNAP: GRID" : "SNAP: OFF";
      return;
    }

    const line = new Line({
      layerId: activeLayer.id,
      strokeColor: activeLayer.defaultStrokeColor,
      fillColor: activeLayer.defaultFillColor,
      strokeWidth: 2,
      start: this.startPoint,
      end: snapped.pt,
    });

    historyStore.pushState(shapeStore.serialize());
    shapeStore.addShape(line);
    this.startPoint = null;
    appState.previewShape = null;
    appState.snapIndicator = null;
    appState.snapDebugStatus = null;
  }

  onMouseMove({ screenPoint }) {
    const { appState, layerStore } = this.context;
    const snapped = this.getSnappedPoint(screenPoint);
    appState.snapIndicator = snapped.snapped ? { point: snapped.pt, kind: snapped.kind } : null;
    appState.snapDebugStatus = snapped.kind === "grid" ? "SNAP: GRID" : "SNAP: OFF";

    if (!this.startPoint) {
      return;
    }
    const layer = layerStore.getActiveLayer();
    appState.previewShape = new Line({
      layerId: layer?.id,
      strokeColor: "#d5ffe8",
      fillColor: "transparent",
      strokeWidth: 1.5,
      opacity: 0.85,
      start: this.startPoint,
      end: snapped.pt,
    });
  }
}
