import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { PolygonShape } from "../models/polygonShape.js";
import { distance } from "../utils/math.js";
import { getLineStyle, getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

const CLOSURE_THRESHOLD_PX = 12;

function createLine(layerId, start, end, lineStyle) {
  return new Line({
    layerId,
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

  commitClosedPolygon(activeLayerId, appState, historyStore, shapeStore) {
    if (this.chainPoints.length < 3) {
      this.finishChain();
      return;
    }

    const polygon = new PolygonShape({
      layerId: activeLayerId,
      pointsWorld: this.chainPoints,
      sourceLineIds: [...this.chainLineIds],
      strokeColor: appState.currentStyle.strokeColor,
      strokeWidth: appState.currentStyle.strokeWidth,
      fillColor: appState.currentStyle.fillColor,
      fillAlpha: appState.currentStyle.fillEnabled ? appState.currentStyle.fillOpacity : 0,
    });

    historyStore.pushState(shapeStore.serialize());
    shapeStore.addShape(polygon);
    this.finishChain();
  }

  onMouseDown({ event, screenPoint }) {
    const { appState, layerStore, historyStore, shapeStore, camera } = this.context;
    const activeLayer = layerStore.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      return;
    }

    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.chainStart) {
      this.chainStart = snapped.pt;
      this.lastPoint = snapped.pt;
      this.chainPoints = [snapped.pt];
      this.chainLineIds = [];
      return;
    }

    const thresholdWorld = CLOSURE_THRESHOLD_PX / camera.zoom;
    const shouldClose = this.chainPoints.length >= 3 && distance(snapped.pt, this.chainStart) <= thresholdWorld;
    if (shouldClose) {
      this.commitClosedPolygon(activeLayer.id, appState, historyStore, shapeStore);
      return;
    }

    if (snapped.pt.x === this.lastPoint.x && snapped.pt.y === this.lastPoint.y) {
      if (event.detail >= 2) {
        this.finishChain();
      }
      return;
    }

    historyStore.pushState(shapeStore.serialize());
    const segment = createLine(activeLayer.id, this.lastPoint, snapped.pt, getLineStyle(appState));
    shapeStore.addShape(segment);
    this.chainLineIds.push(segment.id);
    this.lastPoint = snapped.pt;
    this.chainPoints.push(snapped.pt);

    if (!appState.continuePolyline || event.detail >= 2) {
      this.finishChain();
    }
  }

  onMouseMove({ screenPoint }) {
    const { appState, layerStore } = this.context;
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.lastPoint) {
      appState.previewShape = null;
      return;
    }

    const layer = layerStore.getActiveLayer();
    appState.previewShape = createLine(layer?.id, this.lastPoint, snapped.pt, getLineStyle(appState));
    appState.previewShape.strokeOpacity = Math.min(0.9, appState.currentStyle.strokeOpacity);
  }

  onKeyDown(event) {
    if (event.key === "Escape") {
      this.finishChain();
      return;
    }

    if (event.key === "Enter") {
      this.finishChain();
    }
  }
}
