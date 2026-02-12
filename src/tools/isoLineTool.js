import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { snapWorldToIso, worldToIsoUV } from "../core/isoGrid.js";

const SNAP_PIXELS = 14;

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

  getSnappedPoint(screenPoint) {
    const { appState, camera } = this.context;
    const raw = camera.screenToWorld(screenPoint);
    const thresholdWorld = SNAP_PIXELS / camera.zoom;
    const snappedCandidate = snapWorldToIso(raw);
    const gridDistance = Math.hypot(raw.x - snappedCandidate.point.x, raw.y - snappedCandidate.point.y);

    if (appState.snapToGrid && gridDistance <= thresholdWorld) {
      return {
        raw,
        pt: snappedCandidate.point,
        snapped: true,
        kind: "grid",
        u: snappedCandidate.u,
        v: snappedCandidate.v,
      };
    }

    const uv = worldToIsoUV(raw);
    return {
      raw,
      pt: raw,
      snapped: false,
      kind: null,
      u: uv.u,
      v: uv.v,
    };
  }

  onMouseDown({ screenPoint }) {
    const { appState, layerStore, historyStore, shapeStore } = this.context;
    const activeLayer = layerStore.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      return;
    }

    const snapped = this.getSnappedPoint(screenPoint);

    if (!this.startPoint) {
      this.startPoint = snapped.pt;
      appState.snapIndicator = {
        rawPoint: snapped.raw,
        point: snapped.snapped ? snapped.pt : null,
        kind: snapped.kind,
        u: snapped.snapped ? snapped.u : null,
        v: snapped.snapped ? snapped.v : null,
      };
      appState.snapDebugStatus = snapped.snapped ? `SNAP: GRID (u=${snapped.u}, v=${snapped.v})` : "SNAP: OFF";
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
    const snapped = this.getSnappedPoint(screenPoint);
    appState.snapIndicator = {
      rawPoint: snapped.raw,
      point: snapped.snapped ? snapped.pt : null,
      kind: snapped.kind,
      u: snapped.snapped ? snapped.u : null,
      v: snapped.snapped ? snapped.v : null,
    };
    appState.snapDebugStatus = snapped.snapped ? `SNAP: GRID (u=${snapped.u}, v=${snapped.v})` : "SNAP: OFF";

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
