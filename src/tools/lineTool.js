import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { snapWorldPoint } from "../utils/snapping.js";

export class LineTool extends BaseTool {
  constructor(context) {
    super(context);
    this.startPoint = null;
  }

  onDeactivate() {
    this.startPoint = null;
    this.context.appState.previewShape = null;
    this.context.appState.snapIndicator = null;
  }

  getSnappedPoint(worldPoint) {
    const { appState, camera, shapeStore } = this.context;
    return snapWorldPoint(worldPoint, {
      camera,
      mode: "2D",
      gridSize: appState.gridSpacing,
      isoSpacing: appState.gridSpacing,
      shapes: shapeStore.getShapes(),
      snapGridEnabled: appState.snapToGrid,
      snapMidEnabled: appState.snapToMidpoints,
    });
  }

  onMouseDown({ worldPoint }) {
    const { appState, layerStore, historyStore, shapeStore } = this.context;
    const activeLayer = layerStore.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      return;
    }

    const snapped = this.getSnappedPoint(worldPoint);

    if (!this.startPoint) {
      this.startPoint = snapped.pt;
      appState.snapIndicator = snapped.snapped ? { point: snapped.pt, kind: snapped.kind } : null;
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
  }

  onMouseMove({ worldPoint }) {
    const { appState, layerStore } = this.context;
    const snapped = this.getSnappedPoint(worldPoint);
    appState.snapIndicator = snapped.snapped ? { point: snapped.pt, kind: snapped.kind } : null;

    if (!this.startPoint) {
      return;
    }
    const layer = layerStore.getActiveLayer();
    appState.previewShape = new Line({
      layerId: layer?.id,
      strokeColor: "#dbe9ff",
      fillColor: "transparent",
      strokeWidth: 1.5,
      opacity: 0.8,
      start: this.startPoint,
      end: snapped.pt,
    });
  }
}
