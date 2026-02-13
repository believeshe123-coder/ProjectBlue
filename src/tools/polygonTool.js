import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { Polygon } from "../models/polygon.js";
import { distance } from "../utils/math.js";
import { getCurrentStyle, getLineStyle, updateSnapIndicator, getSnappedPoint } from "./toolUtils.js";

export class PolygonTool extends BaseTool {
  constructor(context) {
    super(context);
    this.points = [];
    this.cursorPoint = null;
  }

  onDeactivate() {
    this.points = [];
    this.cursorPoint = null;
    this.context.appState.previewShape = null;
  }

  tryCommitPolygon() {
    const { shapeStore, historyStore, appState } = this.context;
    if (this.points.length < 3) {
      return;
    }

    this.context.pushHistoryState?.() ?? historyStore.pushState(shapeStore.serialize());
    shapeStore.addShape(
      new Polygon({
        points: this.points,
        closed: true,
        ...getCurrentStyle(appState),
      }),
    );

    this.points = [];
    this.cursorPoint = null;
    appState.previewShape = null;
  }

  onMouseDown({ screenPoint }) {
    const { appState } = this.context;
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(appState, snapped);

    if (this.points.length >= 3) {
      const closeDistance = distance(snapped.pt, this.points[0]);
      const closeThreshold = 12 / this.context.camera.zoom;
      if (closeDistance <= closeThreshold) {
        this.tryCommitPolygon();
        return;
      }
    }

    this.points.push(snapped.pt);
  }

  onMouseMove({ screenPoint }) {
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(this.context.appState, snapped);
    this.cursorPoint = snapped.pt;

    if (this.points.length === 0) {
      this.context.appState.previewShape = null;
      return;
    }

    const points = [...this.points, this.cursorPoint];
    this.context.appState.previewShape = new Polygon({
      points,
      closed: false,
      ...getLineStyle(this.context.appState),
      strokeOpacity: Math.min(0.9, this.context.appState.currentStyle.strokeOpacity),
    });

    if (this.points.length === 1) {
      this.context.appState.previewShape = new Line({
        start: this.points[0],
        end: this.cursorPoint,
        ...getLineStyle(this.context.appState),
        strokeOpacity: Math.min(0.9, this.context.appState.currentStyle.strokeOpacity),
      });
    }
  }

  onKeyDown(event) {
    if (event.key === "Enter") {
      this.tryCommitPolygon();
      return;
    }

    if (event.key === "Escape") {
      this.points = [];
      this.cursorPoint = null;
      this.context.appState.previewShape = null;
    }
  }
}
