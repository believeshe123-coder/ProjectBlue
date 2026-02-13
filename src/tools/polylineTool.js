import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { getLineStyle, getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

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
    this.committedInChain = false;
  }

  onDeactivate() {
    this.chainStart = null;
    this.lastPoint = null;
    this.committedInChain = false;
    this.context.appState.previewShape = null;
    this.context.appState.snapIndicator = null;
    this.context.appState.snapDebugStatus = "SNAP: OFF";
  }

  finishChain() {
    this.chainStart = null;
    this.lastPoint = null;
    this.committedInChain = false;
    this.context.appState.previewShape = null;
  }

  onMouseDown({ event, screenPoint }) {
    const { appState, layerStore, historyStore, shapeStore } = this.context;
    const activeLayer = layerStore.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      return;
    }

    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.chainStart) {
      this.chainStart = snapped.pt;
      this.lastPoint = snapped.pt;
      this.committedInChain = false;
      return;
    }

    if (snapped.pt.x === this.lastPoint.x && snapped.pt.y === this.lastPoint.y) {
      if (event.detail >= 2) {
        this.finishChain();
      }
      return;
    }

    if (!this.committedInChain) {
      historyStore.pushState(shapeStore.serialize());
      this.committedInChain = true;
    }

    shapeStore.addShape(createLine(activeLayer.id, this.lastPoint, snapped.pt, getLineStyle(appState)));

    this.lastPoint = snapped.pt;

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
