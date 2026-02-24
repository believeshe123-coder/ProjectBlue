import { BaseTool } from "./baseTool.js";
import { Line } from "../models/line.js";
import { isoUVToWorld, snapIsoUV, worldToIsoUV } from "../core/isoGrid.js";
import { normalizeEraseMode } from "../state/eraseMode.js";
import { getSnappedPoint, updateSnapIndicator } from "./toolUtils.js";

const MIN_REMAINING_T = 0.0005;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function addScaled(a, b, t) {
  return { x: a.x + b.x * t, y: a.y + b.y * t };
}

function distSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function snapToIsoGrid(point) {
  const uv = snapIsoUV(worldToIsoUV(point), 0.5);
  return isoUVToWorld(uv.u, uv.v);
}

function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = intervals
    .map(([start, end]) => [Math.max(0, start), Math.min(1, end)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  if (sorted.length === 0) return [];

  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i += 1) {
    const [start, end] = sorted[i];
    const last = merged[merged.length - 1];
    if (start <= last[1] + 1e-6) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

function subtractIntervals(base, cuts) {
  let remaining = [base];
  for (const [cutStart, cutEnd] of cuts) {
    const next = [];
    for (const [start, end] of remaining) {
      if (cutEnd <= start || cutStart >= end) {
        next.push([start, end]);
        continue;
      }
      if (cutStart > start) next.push([start, cutStart]);
      if (cutEnd < end) next.push([cutEnd, end]);
    }
    remaining = next;
  }
  return remaining.filter(([start, end]) => end - start > MIN_REMAINING_T);
}

function solveQuadraticLeq(a, b, c) {
  const eps = 1e-9;
  if (Math.abs(a) < eps) {
    if (Math.abs(b) < eps) {
      return c <= 0 ? [[-Infinity, Infinity]] : [];
    }
    const root = -c / b;
    return b > 0 ? [[-Infinity, root]] : [[root, Infinity]];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return a < 0 ? [[-Infinity, Infinity]] : [];
  }

  const sqrtD = Math.sqrt(Math.max(0, discriminant));
  const r1 = (-b - sqrtD) / (2 * a);
  const r2 = (-b + sqrtD) / (2 * a);
  const lo = Math.min(r1, r2);
  const hi = Math.max(r1, r2);

  if (a > 0) return [[lo, hi]];
  return [[-Infinity, lo], [hi, Infinity]];
}

function intersectIntervals(aIntervals, bIntervals) {
  const out = [];
  for (const [aStart, aEnd] of aIntervals) {
    for (const [bStart, bEnd] of bIntervals) {
      const start = Math.max(aStart, bStart);
      const end = Math.min(aEnd, bEnd);
      if (end > start) out.push([start, end]);
    }
  }
  return out;
}

function linearConstraintIntervals(offset, slope, operator) {
  const eps = 1e-9;
  if (Math.abs(slope) < eps) {
    if ((operator === "le" && offset <= 0) || (operator === "ge" && offset >= 0)) {
      return [[-Infinity, Infinity]];
    }
    return [];
  }

  const root = -offset / slope;
  if (operator === "le") {
    return slope > 0 ? [[-Infinity, root]] : [[root, Infinity]];
  }
  return slope > 0 ? [[root, Infinity]] : [[-Infinity, root]];
}

function intervalWithin01(intervals) {
  return intervals
    .map(([start, end]) => [clamp01(start), clamp01(end)])
    .filter(([start, end]) => end > start);
}

function capsuleIntervalsOnLine(A, B, P0, P1, radius) {
  const D = sub(B, A);
  const lineLenSq = dot(D, D);
  if (lineLenSq < 1e-9) return [];

  const radiusSq = radius * radius;
  const S = sub(P1, P0);
  const sLenSq = dot(S, S);

  if (sLenSq < 1e-9) {
    const AP0 = sub(A, P0);
    const a = dot(D, D);
    const b = 2 * dot(AP0, D);
    const c = dot(AP0, AP0) - radiusSq;
    return intervalWithin01(solveQuadraticLeq(a, b, c));
  }

  const A0 = sub(A, P0);
  const k0 = dot(A0, S) / sLenSq;
  const k1 = dot(D, S) / sLenSq;

  const aMid = dot(D, D) - (dot(D, S) * dot(D, S)) / sLenSq;
  const bMid = 2 * (dot(A0, D) - (dot(A0, S) * dot(D, S)) / sLenSq);
  const cMid = dot(A0, A0) - (dot(A0, S) * dot(A0, S)) / sLenSq - radiusSq;
  const midIntervals = intersectIntervals(
    solveQuadraticLeq(aMid, bMid, cMid),
    intersectIntervals(linearConstraintIntervals(k0, k1, "ge"), linearConstraintIntervals(k0 - 1, k1, "le")),
  );

  const AP0 = sub(A, P0);
  const a0 = dot(D, D);
  const b0 = 2 * dot(AP0, D);
  const c0 = dot(AP0, AP0) - radiusSq;
  const p0Intervals = intersectIntervals(
    solveQuadraticLeq(a0, b0, c0),
    linearConstraintIntervals(k0, k1, "le"),
  );

  const AP1 = sub(A, P1);
  const a1 = dot(D, D);
  const b1 = 2 * dot(AP1, D);
  const c1 = dot(AP1, AP1) - radiusSq;
  const p1Intervals = intersectIntervals(
    solveQuadraticLeq(a1, b1, c1),
    linearConstraintIntervals(k0 - 1, k1, "ge"),
  );

  return mergeIntervals(intervalWithin01([...midIntervals, ...p0Intervals, ...p1Intervals]));
}

function buildLineSegmentsAfterErase(line, strokePoints, radius) {
  if (!line || strokePoints.length < 2) return null;

  const cutIntervals = [];
  for (let i = 1; i < strokePoints.length; i += 1) {
    cutIntervals.push(...capsuleIntervalsOnLine(line.start, line.end, strokePoints[i - 1], strokePoints[i], radius));
  }

  const mergedCuts = mergeIntervals(cutIntervals);
  if (mergedCuts.length === 0) return null;

  const remaining = subtractIntervals([0, 1], mergedCuts);
  const direction = sub(line.end, line.start);

  const newSegments = [];
  for (const [startT, endT] of remaining) {
    const start = snapToIsoGrid(addScaled(line.start, direction, startT));
    const end = snapToIsoGrid(addScaled(line.start, direction, endT));
    if (distSq(start, end) < 1e-9) continue;

    newSegments.push(new Line({
      start,
      end,
      strokeColor: line.strokeColor,
      fillColor: line.fillColor,
      strokeWidth: line.strokeWidth,
      opacity: line.opacity,
      strokeOpacity: line.strokeOpacity,
      fillOpacity: line.fillOpacity,
      fillEnabled: line.fillEnabled,
      pinnedMeasure: line.pinnedMeasure,
      visible: line.visible,
      locked: line.locked,
      zIndex: line.zIndex,
      groupId: line.groupId,
      sourceForPolygonId: line.sourceForPolygonId,
      ownedByFaceIds: [...(line.ownedByFaceIds ?? [])],
      selected: false,
    }));
  }

  return newSegments;
}

export class EraseTool extends BaseTool {
  constructor(context) {
    super(context);
    this.isPointerDown = false;
    this.isSegmentErasing = false;
    this.strokePoints = [];
    this.lineEraseStartPoint = null;
    this.didDragErase = false;
  }

  onActivate() {
    this.context.appState.erasePreview = null;
    this.context.appState.snapIndicator = null;
    this.context.appState.snapDebugStatus = "SNAP: OFF";
  }

  onDeactivate() {
    this.isPointerDown = false;
    this.isSegmentErasing = false;
    this.strokePoints = [];
    this.lineEraseStartPoint = null;
    this.didDragErase = false;
    this.context.appState.erasePreview = null;
  }

  getEraseStrokeWidthPx() {
    const strokeWidth = this.context.appState.currentStyle?.strokeWidth;
    return Number.isFinite(strokeWidth) ? Math.max(1, strokeWidth) : 2;
  }

  getEraseRadiusWorld() {
    const strokeWidthPx = this.getEraseStrokeWidthPx();
    return (strokeWidthPx / 2) / this.context.camera.zoom;
  }

  getActiveMode() {
    return normalizeEraseMode(this.context.appState.eraseMode);
  }

  getTargetTypeSet(mode = this.getActiveMode()) {
    return mode === "fill"
      ? new Set(["fillRegion", "face", "polygon"])
      : new Set(["line"]);
  }

  isShapeErasableInMode(shape, mode = this.getActiveMode()) {
    return this.getTargetTypeSet(mode).has(shape?.type);
  }

  getObjectEraseCandidate(worldPoint, mode = this.getActiveMode()) {
    const { shapeStore, camera } = this.context;
    const toleranceWorld = 8 / camera.zoom;
    const allowedTypes = [...this.getTargetTypeSet(mode)];
    return shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false, allowedTypes });
  }

  eraseObject(worldPoint, mode = this.getActiveMode()) {
    const { shapeStore, historyStore } = this.context;
    const hit = this.getObjectEraseCandidate(worldPoint, mode);

    if (!hit || !this.isShapeErasableInMode(hit, mode)) return false;

    if (this.context.pushHistoryState) this.context.pushHistoryState();
    else historyStore.pushState(shapeStore.serialize());
    shapeStore.removeShape(hit.id);
    return true;
  }

  getSegmentEraseCandidates(strokePoints, worldRadius, mode = this.getActiveMode()) {
    if (mode !== "line") return [];
    const { shapeStore } = this.context;
    const affectedLineIds = [];

    for (const shape of shapeStore.getShapes()) {
      if (shape.type !== "line" || shape.visible === false || shape.locked === true) continue;
      const result = buildLineSegmentsAfterErase(shape, strokePoints, worldRadius);
      if (result && (result.length !== 1 || result[0].start.x !== shape.start.x || result[0].start.y !== shape.start.y || result[0].end.x !== shape.end.x || result[0].end.y !== shape.end.y)) {
        affectedLineIds.push(shape.id);
      }
    }

    return affectedLineIds;
  }

  collectSweepEraseCandidateIds(mode = this.getActiveMode()) {
    if (mode !== "fill") return [];
    const targetIds = new Set();
    for (const point of this.strokePoints) {
      const hit = this.getObjectEraseCandidate(point, mode);
      if (hit?.id) targetIds.add(hit.id);
    }
    return [...targetIds];
  }

  applySegmentErase(mode = this.getActiveMode()) {
    const { shapeStore } = this.context;
    if (this.strokePoints.length < 2) return false;

    if (mode === "fill") {
      const targetIds = this.collectSweepEraseCandidateIds(mode);
      if (!targetIds.length) return false;
      for (const id of targetIds) shapeStore.removeShape(id);
      return true;
    }

    const worldRadius = this.getEraseRadiusWorld();
    const updates = [];

    for (const shape of shapeStore.getShapes()) {
      if (shape.type !== "line" || shape.visible === false || shape.locked === true) continue;
      const segments = buildLineSegmentsAfterErase(shape, this.strokePoints, worldRadius);
      if (!segments) continue;
      updates.push({ lineId: shape.id, segments });
    }

    if (updates.length === 0) return false;

    const lineIdsToReplace = new Set(updates.map((item) => item.lineId));
    for (const lineId of lineIdsToReplace) shapeStore.removeShape(lineId);
    for (const update of updates) {
      for (const segment of update.segments) {
        shapeStore.addShape(segment);
      }
    }

    return true;
  }

  getLineModePoint(screenPoint, fallbackWorldPoint) {
    if (!screenPoint) return fallbackWorldPoint;
    const snapped = getSnappedPoint(this.context, screenPoint);
    updateSnapIndicator(this.context.appState, snapped);
    return snapped.pt;
  }

  onKeyDown(event) {
    if (event.key === "Escape") {
      this.isPointerDown = false;
      this.isSegmentErasing = false;
      this.strokePoints = [];
      this.lineEraseStartPoint = null;
      this.context.appState.erasePreview = null;
      this.context.appState.snapIndicator = null;
      this.context.appState.snapDebugStatus = "SNAP: OFF";
    }
  }

  onMouseDown({ worldPoint, screenPoint }) {
    const { appState } = this.context;
    const mode = this.getActiveMode();
    const effectivePoint = mode === "line"
      ? this.getLineModePoint(screenPoint, worldPoint)
      : worldPoint;

    if (mode === "line") {
      if (!this.lineEraseStartPoint) {
        this.lineEraseStartPoint = effectivePoint;
        this.strokePoints = [effectivePoint];
        appState.erasePreview = {
          point: effectivePoint,
          strokeWidthPx: this.getEraseStrokeWidthPx(),
          mode,
          pathPoints: [effectivePoint],
          affectedLineIds: [],
          targetObjectId: null,
          targetObjectType: null,
        };
        return;
      }

      this.isPointerDown = true;
      this.isSegmentErasing = true;
      this.strokePoints = [this.lineEraseStartPoint, effectivePoint];
      appState.erasePreview = {
        point: effectivePoint,
        strokeWidthPx: this.getEraseStrokeWidthPx(),
        mode,
        pathPoints: [...this.strokePoints],
        affectedLineIds: this.getSegmentEraseCandidates(this.strokePoints, this.getEraseRadiusWorld(), mode),
        targetObjectId: null,
        targetObjectType: null,
      };
      return;
    }

    const objectCandidate = this.getObjectEraseCandidate(effectivePoint, mode);

    this.isPointerDown = true;
    this.isSegmentErasing = false;
    this.didDragErase = false;
    this.strokePoints = [effectivePoint];
    appState.erasePreview = {
      point: effectivePoint,
      strokeWidthPx: this.getEraseStrokeWidthPx(),
      mode,
      pathPoints: [effectivePoint],
      affectedLineIds: [],
      targetObjectId: objectCandidate?.id ?? null,
      targetObjectType: objectCandidate?.type ?? null,
    };
  }

  onMouseMove({ worldPoint, screenPoint }) {
    const { appState } = this.context;
    const mode = this.getActiveMode();
    const effectivePoint = mode === "line"
      ? this.getLineModePoint(screenPoint, worldPoint)
      : worldPoint;

    if (mode === "line" && this.lineEraseStartPoint) {
      const pathPoints = [this.lineEraseStartPoint, effectivePoint];
      this.strokePoints = pathPoints;
      appState.erasePreview = {
        point: effectivePoint,
        strokeWidthPx: this.getEraseStrokeWidthPx(),
        mode,
        pathPoints,
        affectedLineIds: this.getSegmentEraseCandidates(pathPoints, this.getEraseRadiusWorld(), mode),
        targetObjectId: null,
        targetObjectType: null,
      };
      return;
    }

    const objectCandidate = this.getObjectEraseCandidate(effectivePoint, mode);
    appState.erasePreview = {
      point: effectivePoint,
      strokeWidthPx: this.getEraseStrokeWidthPx(),
      mode,
      pathPoints: this.isPointerDown && this.strokePoints.length ? [...this.strokePoints] : [effectivePoint],
      affectedLineIds: this.isSegmentErasing ? (appState.erasePreview?.affectedLineIds ?? []) : [],
      targetObjectId: objectCandidate?.id ?? null,
      targetObjectType: objectCandidate?.type ?? null,
    };

    if (!this.isPointerDown) return;

    const last = this.strokePoints[this.strokePoints.length - 1];
    if (!last || distSq(last, effectivePoint) < 1e-6) return;

    if (mode === "line") {
      const startPoint = this.strokePoints[0];
      if (!startPoint || distSq(startPoint, effectivePoint) < 1e-6) return;
      this.strokePoints = [startPoint, effectivePoint];
    } else {
      this.strokePoints.push(effectivePoint);
    }
    appState.erasePreview.pathPoints = [...this.strokePoints];

    if (!this.isSegmentErasing && this.strokePoints.length >= 2) {
      this.isSegmentErasing = true;
      this.didDragErase = true;
    }

    if (!this.isSegmentErasing) return;

    const worldRadius = this.getEraseRadiusWorld();
    appState.erasePreview.affectedLineIds = this.getSegmentEraseCandidates(this.strokePoints, worldRadius, mode);
  }

  onMouseUp({ worldPoint, screenPoint }) {
    const { appState, historyStore, shapeStore } = this.context;
    const mode = this.getActiveMode();
    const effectivePoint = mode === "line"
      ? this.getLineModePoint(screenPoint, worldPoint)
      : worldPoint;

    if (mode === "line") {
      if (!this.isPointerDown || !this.lineEraseStartPoint) return;
      this.strokePoints = [this.lineEraseStartPoint, effectivePoint];
      if (distSq(this.strokePoints[0], this.strokePoints[1]) >= 1e-6) {
        if (this.context.pushHistoryState) this.context.pushHistoryState();
        else historyStore.pushState(shapeStore.serialize());
        this.applySegmentErase(mode);
      }

      this.isPointerDown = false;
      this.isSegmentErasing = false;
      this.strokePoints = [];
      this.lineEraseStartPoint = null;
      appState.erasePreview = null;
      appState.snapIndicator = null;
      appState.snapDebugStatus = "SNAP: OFF";
      return;
    }

    if (this.didDragErase && this.isSegmentErasing && this.strokePoints.length >= 2) {
      if (this.context.pushHistoryState) this.context.pushHistoryState();
      else historyStore.pushState(shapeStore.serialize());
      this.applySegmentErase(mode);
    } else if (this.isPointerDown) {
      this.eraseObject(effectivePoint, mode);
    }

    this.isPointerDown = false;
    this.isSegmentErasing = false;
    this.strokePoints = [];
    appState.erasePreview = null;
    if (mode === "line") {
      appState.snapIndicator = null;
      appState.snapDebugStatus = "SNAP: OFF";
    }
  }
}
