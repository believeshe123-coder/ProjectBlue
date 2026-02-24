import { isoUVToWorld, snapWorldToIso, snapWorldToIsoAxis, worldToIsoUV } from "../core/isoGrid.js";

const SNAP_PIXELS = 14;

export function getSnappedPoint(context, screenPoint) {
  const { appState, camera } = context;
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
  }

  const winner = candidates
    .filter((candidate) => candidate.distance <= thresholdWorld)
    .sort((a, b) => a.distance - b.distance)[0];

  if (winner) {
    return {
      raw,
      pt: winner.point,
      snapped: true,
      kind: winner.kind,
      u: winner.u,
      v: winner.v,
      d: winner.d,
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
  };
  if (!snapped.snapped) {
    appState.snapDebugStatus = "SNAP: OFF";
    return;
  }

  if (snapped.kind === "axis") {
    appState.snapDebugStatus = `SNAP: AXIS (d=${snapped.d})`;
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
