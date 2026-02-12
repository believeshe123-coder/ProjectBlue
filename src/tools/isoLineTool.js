import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

export class IsoLineTool extends BaseTool {
  constructor(context) {
    super(context);
    this.startPoint = null;
  }

  onDeactivate() {
    this.startPoint = null;
    this.context.appState.previewShape = null;
    this.context.appState.snapIndicator = null;
    this.context.appState.snapDebugStatus = "SNAP: OFF";
  }

  onMouseDown({ screenPoint }) {
    const { appState, layerStore, historyStore, shapeStore } = this.context;
    const activeLayer = layerStore.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      return;
    }

    const snapped = getSnappedPoint(this.context, screenPoint);

    if (!this.startPoint) {
      this.startPoint = snapped.pt;
      updateSnapIndicator(appState, snapped);
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
    appState.snapDebugStatus = "SNAP: OFF";
  }

  onMouseMove({ screenPoint }) {
    const { appState, layerStore } = this.context;
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

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
