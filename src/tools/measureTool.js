import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { Measurement } from "../models/measurement.js";
import { ensureActiveDrawableLayer, getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

export class MeasureTool extends BaseTool {
  constructor(context) {
    super(context);
    this.a = null;
  }

  onDeactivate() {
    this.a = null;
    this.context.appState.previewShape = null;
  }

  onMouseDown({ screenPoint }) {
    const { appState, layerStore, historyStore, shapeStore } = this.context;
    const activeLayer = ensureActiveDrawableLayer(this.context);
    if (!activeLayer) return;

    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.a) {
      this.a = snapped.pt;
      return;
    }

    this.context.pushHistoryState?.() ?? historyStore.pushState(shapeStore.serialize());
    shapeStore.addShape(
      new Measurement({
        layerId: activeLayer.id,
        strokeColor: "#f8fcff",
        strokeOpacity: 1,
        strokeWidth: 2,
        fillColor: "transparent",
        fillEnabled: false,
        fillOpacity: 0,
        a: this.a,
        b: snapped.pt,
      }),
    );

    this.a = null;
    appState.previewShape = null;
  }

  onMouseMove({ screenPoint }) {
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(this.context.appState, snapped);

    if (!this.a) {
      return;
    }

    const layer = this.context.layerStore.getActiveLayer();
    if (!layer || layer.visible === false || layer.locked === true) {
      this.context.appState.previewShape = null;
      return;
    }

    this.context.appState.previewShape = new Line({
      layerId: layer.id,
      start: this.a,
      end: snapped.pt,
      strokeColor: "#f8fcff",
      strokeOpacity: 0.9,
      strokeWidth: 1.5,
      fillColor: "transparent",
      fillEnabled: false,
      fillOpacity: 0,
    });
  }

  onKeyDown(event) {
    if (event.key === "Escape") {
      this.a = null;
      this.context.appState.previewShape = null;
    }
  }
}
