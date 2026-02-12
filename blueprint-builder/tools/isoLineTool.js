import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { snapToEndpoint, snapToIsoAxes } from "../utils/snapping.js";

export class IsoLineTool extends BaseTool {
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

    if (!this.startPoint) {
      this.startPoint = snapToIsoAxes(worldPoint, worldPoint, appState.gridSpacing);
      return;
    }

    const snapped = snapToIsoAxes(this.startPoint, worldPoint, appState.gridSpacing);
    const withEndpoint = snapToEndpoint(snapped, shapeStore.getShapes()).point;

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

    const snapped = snapToIsoAxes(this.startPoint, worldPoint, appState.gridSpacing);
    const layer = layerStore.getActiveLayer();
    appState.previewShape = new Line({
      layerId: layer?.id,
      strokeColor: "#7ce4ad",
      fillColor: "transparent",
      strokeWidth: 1.5,
      opacity: 0.85,
      start: this.startPoint,
      end: snapped,
    });
  }
}
