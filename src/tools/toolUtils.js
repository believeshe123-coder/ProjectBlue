import { isoUVToWorld, snapWorldToIso, snapWorldToIsoAxis, worldToIsoUV } from "../core/isoGrid.js";

const SNAP_PIXELS = 14;
const INTERSECTION_EPSILON = 1e-9;
const SNAP_KIND_PRIORITY = { intersection: 0, endpoint: 1, axis: 2, grid: 3, midpoint: 4 };

function cross2D(a, b) {
  return a.x * b.y - a.y * b.x;
}

function getSegmentIntersection(aStart, aEnd, bStart, bEnd) {
  const r = { x: aEnd.x - aStart.x, y: aEnd.y - aStart.y };
  const s = { x: bEnd.x - bStart.x, y: bEnd.y - bStart.y };
  const denom = cross2D(r, s);
  if (Math.abs(denom) < INTERSECTION_EPSILON) return null;

  const delta = { x: bStart.x - aStart.x, y: bStart.y - aStart.y };
  const t = cross2D(delta, s) / denom;
  const u = cross2D(delta, r) / denom;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return {
    x: aStart.x + r.x * t,
    y: aStart.y + r.y * t,
  };
}

function getLineSnapPoints(shapeStore) {
  const snapPoints = [];
  const lines = shapeStore
    .getShapes()
    .filter((shape) => shape?.type === "line" && shape.visible !== false);

  for (const line of lines) {
    snapPoints.push({ point: line.start, kind: "endpoint" });
    snapPoints.push({ point: line.end, kind: "endpoint" });
    snapPoints.push({
      point: {
        x: (line.start.x + line.end.x) / 2,
        y: (line.start.y + line.end.y) / 2,
      },
      kind: "midpoint",
    });
  }

  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      const intersection = getSegmentIntersection(lines[i].start, lines[i].end, lines[j].start, lines[j].end);
      if (!intersection) continue;
      snapPoints.push({ point: intersection, kind: "intersection" });
    }
  }

  return snapPoints;
}

export function getSnappedPoint(context, screenPoint) {
  const { appState, camera, shapeStore } = context;
  const raw = camera.screenToWorld(screenPoint);
  const thresholdWorld = SNAP_PIXELS / camera.zoom;
  const candidates = [];

  if (appState.snapToGrid) {
    const snappedGrid = snapWorldToIso(raw);
    const gridDistance = Math.hypot(raw.x - snappedGrid.point.x, raw.y - snappedGrid.point.y);
    candidates.push({
      point: snappedGrid.point,
      kind: "grid",
      u: snappedGrid.u,
      v: snappedGrid.v,
      distance: gridDistance,
    });

    const snappedAxis = snapWorldToIsoAxis(raw);
    const axisDistance = Math.hypot(raw.x - snappedAxis.point.x, raw.y - snappedAxis.point.y);
    candidates.push({
      point: snappedAxis.point,
      kind: "axis",
      u: snappedAxis.u,
      v: snappedAxis.v,
      d: snappedAxis.d,
      axis: snappedAxis.axis,
      distance: axisDistance,
    });
  }

  if (appState.snapToMidpoints) {
    const uv = worldToIsoUV(raw);
    const uMid = Math.floor(uv.u) + 0.5;
    const vMid = Math.floor(uv.v) + 0.5;
    const midpoint = isoUVToWorld(uMid, vMid);
    const midpointDistance = Math.hypot(raw.x - midpoint.x, raw.y - midpoint.y);
    candidates.push({
      point: midpoint,
      kind: "midpoint",
      u: uMid,
      v: vMid,
      distance: midpointDistance,
    });

    for (const snapPoint of getLineSnapPoints(shapeStore)) {
      const distance = Math.hypot(raw.x - snapPoint.point.x, raw.y - snapPoint.point.y);
      candidates.push({
        point: snapPoint.point,
        kind: snapPoint.kind,
        distance,
      });
    }
  }

  const winner = candidates
    .filter((candidate) => candidate.distance <= thresholdWorld)
    .sort((a, b) => {
      const aPriority = SNAP_KIND_PRIORITY[a.kind] ?? 10;
      const bPriority = SNAP_KIND_PRIORITY[b.kind] ?? 10;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.distance - b.distance;
    })[0];

  if (winner) {
    return {
      raw,
      pt: winner.point,
      snapped: true,
      kind: winner.kind,
      u: winner.u,
      v: winner.v,
      d: winner.d,
      axis: winner.axis,
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
    d: uv.u - uv.v,
  };
}

export function updateSnapIndicator(appState, snapped) {
  appState.snapIndicator = {
    rawPoint: snapped.raw,
    point: snapped.snapped ? snapped.pt : null,
    kind: snapped.kind,
    u: snapped.snapped ? snapped.u : null,
    v: snapped.snapped ? snapped.v : null,
    d: snapped.snapped ? snapped.d ?? null : null,
    axis: snapped.snapped ? snapped.axis ?? null : null,
  };
  if (!snapped.snapped) {
    appState.snapDebugStatus = "SNAP: OFF";
    return;
  }

  if (snapped.kind === "axis") {
    const axisLabel = (snapped.axis || "d").toUpperCase();
    appState.snapDebugStatus = `SNAP: AXIS-${axisLabel}`;
    return;
  }

  appState.snapDebugStatus = `SNAP: ${snapped.kind.toUpperCase()} (u=${snapped.u}, v=${snapped.v})`;
}

export function getCurrentStyle(appState) {
  return {
    strokeColor: appState.currentStyle.strokeColor,
    strokeOpacity: appState.currentStyle.strokeOpacity,
    strokeWidth: appState.currentStyle.strokeWidth,
    fillEnabled: appState.currentStyle.fillEnabled,
    fillColor: appState.currentStyle.fillColor,
    fillOpacity: appState.currentStyle.fillOpacity,
  };
}

export function getLineStyle(appState) {
  const style = getCurrentStyle(appState);
  return {
    strokeColor: style.strokeColor,
    strokeOpacity: style.strokeOpacity,
    strokeWidth: style.strokeWidth,
    fillColor: "transparent",
    fillOpacity: 0,
    fillEnabled: false,
  };
}

export function getActiveLayerBlockReason(context) {
  const { shapeStore } = context;
  if (!shapeStore?.getActiveLayerId || !shapeStore?.getLayerNode) return null;
  const activeLayerId = shapeStore.getActiveLayerId();
  const activeLayer = shapeStore.getLayerNode(activeLayerId);
  if (!activeLayer) return "hidden";
  if (activeLayer.visible === false) return "hidden";
  if (activeLayer.locked === true) return "locked";
  return null;
}

export function ensureActiveLayerWritable(context, { notify = true } = {}) {
  const reason = getActiveLayerBlockReason(context);
  if (!reason) return true;
  if (notify) {
    const message = reason === "locked" ? "Layer is locked" : "Layer is hidden";
    context.appState.notifyStatus?.(message, 1500);
  }
  return false;
}
