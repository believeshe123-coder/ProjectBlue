import { snapWorldToIso, worldToIsoUV } from "../core/isoGrid.js";

const SNAP_PIXELS = 14;

export function getSnappedPoint(context, screenPoint) {
  const { appState, camera } = context;
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

export function updateSnapIndicator(appState, snapped) {
  appState.snapIndicator = {
    rawPoint: snapped.raw,
    point: snapped.snapped ? snapped.pt : null,
    kind: snapped.kind,
    u: snapped.snapped ? snapped.u : null,
    v: snapped.snapped ? snapped.v : null,
  };
  appState.snapDebugStatus = snapped.snapped ? `SNAP: GRID (u=${snapped.u}, v=${snapped.v})` : "SNAP: OFF";
}
