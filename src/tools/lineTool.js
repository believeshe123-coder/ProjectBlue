import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { ensureActiveLayerWritable, getLineStyle, getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

export class LineTool extends BaseTool {
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

  onMouseDown({ screenPoint }) {
    const { appState, historyStore, shapeStore } = this.context;
    if (!this.startPoint && !ensureActiveLayerWritable(this.context)) return;
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.startPoint) {
      this.startPoint = snapped.pt;
      return;
    }

    if (!ensureActiveLayerWritable(this.context)) {
      this.startPoint = null;
      appState.previewShape = null;
      return;
    }

    const line = new Line({
      ...getLineStyle(appState),
      start: this.startPoint,
      end: snapped.pt,
    });

    if (this.context.pushHistoryState) this.context.pushHistoryState();
    else historyStore.pushState(shapeStore.serialize());
    shapeStore.addShape(line);
    this.startPoint = null;
    appState.previewShape = null;
    appState.snapIndicator = null;
    appState.snapDebugStatus = null;
  }

  onMouseMove({ screenPoint }) {
    const { appState } = this.context;
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (!this.startPoint) {
      return;
    }

    appState.previewShape = new Line({
      ...getLineStyle(appState),
      strokeOpacity: Math.min(0.9, appState.currentStyle.strokeOpacity),
      start: this.startPoint,
      end: snapped.pt,
    });
  }
}
