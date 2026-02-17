import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { Measurement } from "../models/measurement.js";
import { getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

export class MeasureTool extends BaseTool {
  constructor(context) {
    super(context);
    this.a = null;
  }

  onActivate() {
    this.a = null;
    this.context.appState.previewShape = null;
  }

  onDeactivate() {
    this.a = null;
    this.context.appState.previewShape = null;
  }

  onMouseDown({ screenPoint }) {
    const { appState, historyStore, shapeStore } = this.context;

    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.a) {
      this.a = snapped.pt;
      return;
    }

    this.context.pushHistoryState?.() ?? historyStore.pushState(shapeStore.serialize());
    shapeStore.addShape(
      new Measurement({
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

    this.context.appState.previewShape = new Line({
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
    if (event.key === "Escape" || event.key === "Enter") {
      this.a = null;
      this.context.appState.previewShape = null;
    }
  }
}
