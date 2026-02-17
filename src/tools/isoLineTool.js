import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { getLineStyle, getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

export class IsoLineTool extends BaseTool {
  constructor(context) {
    super(context);
    this.startPoint = null;
  }

  onActivate() {
    this.startPoint = null;
    this.context.appState.previewShape = null;
  }

  onDeactivate() {
    this.startPoint = null;
    this.context.appState.previewShape = null;
    this.context.appState.snapIndicator = null;
    this.context.appState.snapDebugStatus = "SNAP: OFF";
  }

  onMouseDown({ screenPoint }) {
    const { appState, historyStore, shapeStore } = this.context;
    const snapped = getSnappedPoint(this.context, screenPoint);

    if (!this.startPoint) {
      this.startPoint = snapped.pt;
      updateSnapIndicator(appState, snapped);
      return;
    }

    const lineStyle = getLineStyle(appState);
    const line = new Line({
      ...lineStyle,
      start: this.startPoint,
      end: snapped.pt,
    });

    this.context.pushHistoryState?.() ?? historyStore.pushState(shapeStore.serialize());
    shapeStore.addShape(line);
    this.startPoint = null;
    appState.previewShape = null;
    appState.snapIndicator = null;
    appState.snapDebugStatus = "SNAP: OFF";
  }

  onKeyDown(event) {
    if (event.key === "Escape" || event.key === "Enter") {
      this.startPoint = null;
      this.context.appState.previewShape = null;
    }
  }

  onMouseMove({ screenPoint }) {
    const { appState } = this.context;
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.startPoint) {
      return;
    }


    const lineStyle = getLineStyle(appState);
    appState.previewShape = new Line({
      ...lineStyle,
      strokeOpacity: Math.min(0.9, appState.currentStyle.strokeOpacity),
      start: this.startPoint,
      end: snapped.pt,
    });
  }
}
