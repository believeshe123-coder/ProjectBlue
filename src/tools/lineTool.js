import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { snapToEndpoint, snapToGrid } from "../utils/snapping.js";

export class LineTool extends BaseTool {
  constructor(context) {
    super(context);
    this.startPoint = null;
  }

  onDeactivate() {
    this.startPoint = null;
    this.context.appState.previewShape = null;
  }

  onMouseDown({ worldPoint }) {
    const { appState, layerStore, historyStore, shapeStore } = this.context;
    const activeLayer = layerStore.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      return;
    }

    const snapped = snapToGrid(worldPoint, appState.gridSpacing);
    const withEndpoint = snapToEndpoint(snapped, shapeStore.getShapes()).point;

    if (!this.startPoint) {
      this.startPoint = withEndpoint;
      return;
    }

    const line = new Line({
      layerId: activeLayer.id,
      strokeColor: activeLayer.defaultStrokeColor,
      fillColor: activeLayer.defaultFillColor,
      strokeWidth: 2,
      start: this.startPoint,
      end: withEndpoint,
    });

    historyStore.pushState(shapeStore.serialize());
    shapeStore.addShape(line);
    this.startPoint = null;
    appState.previewShape = null;
  }

  onMouseMove({ worldPoint }) {
    const { appState, layerStore } = this.context;
    if (!this.startPoint) {
      return;
    }

    const snapped = snapToGrid(worldPoint, appState.gridSpacing);
    const layer = layerStore.getActiveLayer();
    appState.previewShape = new Line({
      layerId: layer?.id,
      strokeColor: "#9bc8ff",
      fillColor: "transparent",
      strokeWidth: 1.5,
      opacity: 0.8,
      start: this.startPoint,
      end: snapped,
    });
  }
}
