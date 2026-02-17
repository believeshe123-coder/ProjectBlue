import { FillRegion } from "../models/fillRegion.js";
import { buildRegionsFromLines } from "../core/regionBuilder.js";
import { isoUVToWorld, worldToIsoUV } from "../core/isoGrid.js";
import { distancePointToSegment, isPointInPolygon } from "../utils/math.js";
import { IDENTITY_TRANSFORM, applyTransformPoint, composeTransform, pointToLocal } from "../utils/transform.js";

function makeId(prefix = "node") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRect(rect) {
  if (!rect) return null;
  return {
    minX: Math.min(rect.minX, rect.maxX), minY: Math.min(rect.minY, rect.maxY),
    maxX: Math.max(rect.minX, rect.maxX), maxY: Math.max(rect.minY, rect.maxY),
  };
}

function rectsIntersect(a, b) {
  if (!a || !b) return false;
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function uvKey(point) { return `${Math.round(point.u)},${Math.round(point.v)}`; }
function edgeKey(a, b) { const ak = uvKey(a); const bk = uvKey(b); return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`; }

function regionCentroid(uvCycle = []) {
  if (!Array.isArray(uvCycle) || uvCycle.length < 3) return null;
  const worldPoints = uvCycle.map((point) => isoUVToWorld(point.u, point.v));
  const avg = worldPoints.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: avg.x / worldPoints.length, y: avg.y / worldPoints.length };
}

export class ShapeStore {
  constructor() {
    this.nodes = {};
    this.parentById = {};
    this.rootIds = [];
    this.cachedRegions = [];
    this.cachedRegionDebug = { totalEdges: 0, totalVertices: 0, totalRegions: 0, outerArea: 0 };
    this.cachedLinesHash = "";
  }

  invalidateDerivedData() { this.cachedLinesHash = ""; }

  ensureNodeTransform(node) {
    if (!node.nodeTransform) node.nodeTransform = { ...IDENTITY_TRANSFORM };
  }

  addShape(shape) {
    if (!shape) return null;
    if (shape.type === "fillRegion") {
      this.nodes[shape.id] = {
        id: shape.id, kind: "shape", shapeType: "fillRegion", localGeom: { uvCycle: shape.uvCycle ?? [] },
        nodeTransform: { ...IDENTITY_TRANSFORM }, style: shape.toJSON(), createdAt: shape.createdAt ?? Date.now(),
      };
      this.rootIds.push(shape.id);
      this.invalidateDerivedData();
      return shape;
    }

    if (shape.type === "line") {
      this.nodes[shape.id] = {
        id: shape.id, kind: "shape", shapeType: "line",
        localGeom: { a: { ...shape.startUV }, b: { ...shape.endUV }, ownedByFaceIds: [...(shape.ownedByFaceIds ?? [])] },
        nodeTransform: { x: 0, y: 0, rot: 0 },
        style: shape.toJSON(), createdAt: shape.createdAt ?? Date.now(),
      };
      this.rootIds.push(shape.id);
      this.invalidateDerivedData();
      return shape;
    }

    if (shape.type === "face") {
      this.nodes[shape.id] = {
        id: shape.id, kind: "shape", shapeType: "face",
        localGeom: { points: (shape.pointsWorld ?? []).map((p) => ({ ...p })) },
        nodeTransform: { x: 0, y: 0, rot: 0 },
        style: shape.toJSON(), createdAt: shape.createdAt ?? Date.now(),
      };
      this.rootIds.push(shape.id);
      return shape;
    }
    return shape;
  }

  createObjectFromIds(ids = [], { name = "Object" } = {}) {
    const objectId = makeId("object");
    const validIds = ids.filter((id) => this.nodes[id]);
    const rootIndices = validIds.map((id) => this.rootIds.indexOf(id)).filter((i) => i >= 0);
    const insertAt = rootIndices.length ? Math.min(...rootIndices) : this.rootIds.length;

    this.rootIds = this.rootIds.filter((id) => !validIds.includes(id));
    this.nodes[objectId] = {
      id: objectId,
      kind: "object",
      name,
      transform: { ...IDENTITY_TRANSFORM },
      children: [...validIds],
      createdAt: Date.now(),
    };
    for (const childId of validIds) this.parentById[childId] = objectId;
    this.rootIds.splice(insertAt, 0, objectId);
    return objectId;
  }

  getNodeById(id) { return this.nodes[id] ?? null; }

  getWorldTransform(nodeId) {
    let current = this.nodes[nodeId];
    if (!current) return { ...IDENTITY_TRANSFORM };
    let acc = { ...IDENTITY_TRANSFORM };
    while (current) {
      const local = current.kind === "object" ? (current.transform ?? IDENTITY_TRANSFORM) : (current.nodeTransform ?? IDENTITY_TRANSFORM);
      acc = composeTransform(local, acc);
      const parentId = this.parentById[current.id];
      current = parentId ? this.nodes[parentId] : null;
    }
    return acc;
  }

  getDrawList() {
    const out = [];
    const visit = (id) => {
      const node = this.nodes[id];
      if (!node) return;
      if (node.kind === "shape") { out.push(id); return; }
      for (const childId of node.children ?? []) visit(childId);
    };
    for (const id of this.rootIds) visit(id);
    return out;
  }

  toShapeView(id) {
    const node = this.nodes[id];
    if (!node || node.kind !== "shape") return null;
    if (node.shapeType === "fillRegion") {
      return FillRegion.fromJSON(node.style);
    }

    const worldTx = this.getWorldTransform(id);
    if (node.shapeType === "line") {
      const aLocal = isoUVToWorld(node.localGeom.a.u, node.localGeom.a.v);
      const bLocal = isoUVToWorld(node.localGeom.b.u, node.localGeom.b.v);
      const start = applyTransformPoint(worldTx, aLocal);
      const end = applyTransformPoint(worldTx, bLocal);
      const startUV = worldToIsoUV(start);
      const endUV = worldToIsoUV(end);
      return {
        id, type: "line", start, end, startUV, endUV, visible: node.style.visible !== false,
        locked: node.style.locked === true, selected: node.style.selected === true,
        strokeColor: node.style.strokeColor, strokeWidth: node.style.strokeWidth,
        ownedByFaceIds: node.localGeom.ownedByFaceIds ?? [], createdAt: node.createdAt ?? 0,
      };
    }

    if (node.shapeType === "face") {
      const pointsWorld = node.localGeom.points.map((p) => applyTransformPoint(worldTx, p));
      return {
        id, type: "face", pointsWorld, visible: node.style.visible !== false, locked: node.style.locked === true,
        selected: node.style.selected === true, fillColor: node.style.fillColor, fillAlpha: node.style.fillAlpha ?? node.style.fillOpacity ?? 1,
        sourceRegionKey: node.style.sourceRegionKey ?? null, createdAt: node.createdAt ?? 0,
      };
    }

    return null;
  }

  getShapes() {
    return this.getDrawList().map((id) => this.toShapeView(id)).filter(Boolean);
  }

  getShapeById(id) { return this.toShapeView(id); }

  setNodeSelected(id, selected) {
    const node = this.nodes[id];
    if (!node?.style) return;
    node.style.selected = selected;
  }

  clearSelection() {
    for (const id of Object.keys(this.nodes)) this.setNodeSelected(id, false);
  }

  getTopmostHitShape(point, toleranceWorld = 6) {
    const drawList = this.getDrawList();
    for (let i = drawList.length - 1; i >= 0; i -= 1) {
      const id = drawList[i];
      const node = this.nodes[id];
      if (!node || node.kind !== "shape") continue;
      if (node.style?.visible === false || node.style?.locked === true) continue;
      const worldTx = this.getWorldTransform(id);
      const localPt = pointToLocal(point, worldTx);
      if (node.shapeType === "face") {
        if (isPointInPolygon(localPt, node.localGeom.points)) return this.toShapeView(id);
      } else if (node.shapeType === "line") {
        const a = isoUVToWorld(node.localGeom.a.u, node.localGeom.a.v);
        const b = isoUVToWorld(node.localGeom.b.u, node.localGeom.b.v);
        if (distancePointToSegment(localPt, a, b) <= toleranceWorld) return this.toShapeView(id);
      }
    }
    return null;
  }

  getShapeBounds(shapeOrNode) {
    const shape = shapeOrNode?.type ? shapeOrNode : this.toShapeView(shapeOrNode?.id ?? shapeOrNode);
    if (!shape) return null;
    if (shape.type === "line") {
      return { minX: Math.min(shape.start.x, shape.end.x), minY: Math.min(shape.start.y, shape.end.y), maxX: Math.max(shape.start.x, shape.end.x), maxY: Math.max(shape.start.y, shape.end.y) };
    }
    if (shape.type === "face") {
      const xs = shape.pointsWorld.map((p) => p.x); const ys = shape.pointsWorld.map((p) => p.y);
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    if (shape.type === "fillRegion") return shape.bounds ?? null;
    return null;
  }

  getShapesIntersectingRect(rect) {
    const normalized = normalizeRect(rect);
    if (!normalized) return [];
    return this.getShapes().filter((shape) => {
      if (shape.visible === false || shape.locked === true) return false;
      const bounds = this.getShapeBounds(shape);
      return rectsIntersect(bounds, normalized);
    });
  }

  getShapeTargetsForMove(ids = []) {
    return ids.map((id) => this.toShapeView(id)).filter(Boolean);
  }

  applyWorldDeltaToNode(id, delta) {
    const node = this.nodes[id];
    if (!node) return;
    if (node.kind === "object") {
      node.transform.x += delta.x;
      node.transform.y += delta.y;
      return;
    }
    node.nodeTransform.x += delta.x;
    node.nodeTransform.y += delta.y;
    this.invalidateDerivedData();
  }

  removeShape(id) {
    const node = this.nodes[id];
    if (!node) return false;
    const parentId = this.parentById[id];
    if (parentId) {
      const parent = this.nodes[parentId];
      if (parent?.kind === "object") parent.children = parent.children.filter((cid) => cid !== id);
      delete this.parentById[id];
    }
    if (node.kind === "object") {
      for (const childId of node.children ?? []) delete this.parentById[childId];
    }
    delete this.nodes[id];
    this.rootIds = this.rootIds.filter((rid) => rid !== id);
    this.invalidateDerivedData();
    return true;
  }

  getRenderableShapesSorted() { return this.getShapes().filter((shape) => shape.type !== "fillRegion"); }

  getSelectionTargetId(shapeId) { return shapeId; }

  getComputedRegions() {
    const lines = this.getShapes().filter((shape) => shape.type === "line" && shape.visible !== false);
    const nextHash = lines.map((line) => {
      const a = `${line.startUV.u},${line.startUV.v}`;
      const b = `${line.endUV.u},${line.endUV.v}`;
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    }).sort().join(";");
    if (nextHash === this.cachedLinesHash) return this.cachedRegions;
    const result = buildRegionsFromLines(lines);
    this.cachedRegions = result.boundedFaces;
    this.cachedRegionDebug = result.debug;
    this.cachedLinesHash = nextHash;
    return this.cachedRegions;
  }

  getRegionDebugStats() { this.getComputedRegions(); return this.cachedRegionDebug; }

  upsertFillRegion(region, { color, alpha }) {
    const existing = Object.values(this.nodes).find((n) => n.kind === "shape" && n.shapeType === "fillRegion" && n.style.regionId === region.id);
    if (existing) {
      existing.style.color = color; existing.style.alpha = alpha; existing.style.fillColor = color; existing.style.fillOpacity = alpha;
      existing.localGeom.uvCycle = region.uvCycle;
      return FillRegion.fromJSON(existing.style);
    }
    const fill = new FillRegion({ regionId: region.id, uvCycle: region.uvCycle, color, alpha });
    this.addShape(fill);
    return fill;
  }

  getFillRegions() { return this.getShapes().filter((shape) => shape.type === "fillRegion"); }

  markRegionBoundaryLinesOwnedByFace(uvCycle, faceId) {
    const edges = new Set();
    for (let i = 0; i < uvCycle.length; i += 1) edges.add(edgeKey(uvCycle[i], uvCycle[(i + 1) % uvCycle.length]));
    for (const node of Object.values(this.nodes)) {
      if (node.kind !== "shape" || node.shapeType !== "line") continue;
      if (edges.has(edgeKey(node.localGeom.a, node.localGeom.b))) {
        node.localGeom.ownedByFaceIds = [...new Set([...(node.localGeom.ownedByFaceIds ?? []), faceId])];
      }
    }
  }

  getFilledRegionCountInBounds(rect) {
    const normalized = normalizeRect(rect);
    if (!normalized) return 0;
    const fillsByRegionId = new Map(this.getFillRegions().map((shape) => [shape.regionId, shape]));
    let count = 0;
    for (const region of this.getComputedRegions()) {
      const fill = fillsByRegionId.get(region.id);
      if (!fill) continue;
      const c = regionCentroid(region.uvCycle);
      if (c && c.x >= normalized.minX && c.x <= normalized.maxX && c.y >= normalized.minY && c.y <= normalized.maxY) count += 1;
    }
    return count;
  }

  captureFilledRegionsAsFacesInBounds(rect) {
    const normalized = normalizeRect(rect);
    if (!normalized) return [];
    const fillsByRegionId = new Map(this.getFillRegions().map((shape) => [shape.regionId, shape]));
    const ids = [];
    for (const region of this.getComputedRegions()) {
      const fill = fillsByRegionId.get(region.id);
      if (!fill) continue;
      const c = regionCentroid(region.uvCycle);
      if (!c || c.x < normalized.minX || c.x > normalized.maxX || c.y < normalized.minY || c.y > normalized.maxY) continue;
      const pointsWorld = region.uvCycle.map((p) => isoUVToWorld(p.u, p.v));
      const nodeId = makeId("face");
      this.nodes[nodeId] = {
        id: nodeId, kind: "shape", shapeType: "face", localGeom: { points: pointsWorld }, nodeTransform: { ...IDENTITY_TRANSFORM },
        style: { id: nodeId, type: "face", fillColor: fill.color ?? fill.fillColor ?? "#4aa3ff", fillAlpha: fill.alpha ?? fill.fillOpacity ?? 1, sourceRegionKey: region.id, visible: true, locked: false },
        createdAt: Date.now(),
      };
      this.rootIds.push(nodeId);
      this.markRegionBoundaryLinesOwnedByFace(region.uvCycle, nodeId);
      ids.push(nodeId);
    }
    return ids;
  }

  getSelectionBoundsFromIds(ids = []) {
    const bounds = ids.map((id) => this.getShapeBounds(this.toShapeView(id))).filter(Boolean);
    if (!bounds.length) return null;
    return { minX: Math.min(...bounds.map((b) => b.minX)), minY: Math.min(...bounds.map((b) => b.minY)), maxX: Math.max(...bounds.map((b) => b.maxX)), maxY: Math.max(...bounds.map((b) => b.maxY)) };
  }

  reorderSelectionZ(selectionIds = [], mode = "front") {
    const selected = new Set(selectionIds);
    const selectedRoots = this.rootIds.filter((id) => selected.has(id));
    if (!selectedRoots.length) return false;
    const unselected = this.rootIds.filter((id) => !selected.has(id));
    if (mode === "front") this.rootIds = [...unselected, ...selectedRoots];
    else if (mode === "back") this.rootIds = [...selectedRoots, ...unselected];
    else return false;
    return true;
  }

  clear() { this.nodes = {}; this.parentById = {}; this.rootIds = []; this.invalidateDerivedData(); }

  serialize() {
    return { nodes: this.nodes, parentById: this.parentById, rootIds: this.rootIds };
  }

  replaceFromSerialized(serialized) {
    if (serialized?.nodes && Array.isArray(serialized?.rootIds)) {
      this.nodes = serialized.nodes;
      this.parentById = serialized.parentById ?? {};
      this.rootIds = serialized.rootIds;
      this.invalidateDerivedData();
      return;
    }

    // Migration from old shape array.
    this.clear();
    for (const shape of Array.isArray(serialized) ? serialized : []) {
      if (!shape || typeof shape !== "object") continue;
      if (shape.type === "line") {
        this.nodes[shape.id] = {
          id: shape.id, kind: "shape", shapeType: "line",
          localGeom: { a: { ...shape.startUV }, b: { ...shape.endUV }, ownedByFaceIds: [...(shape.ownedByFaceIds ?? [])] },
          nodeTransform: { x: 0, y: 0, rot: 0 }, style: { ...shape }, createdAt: shape.createdAt ?? Date.now(),
        };
        this.rootIds.push(shape.id);
      } else if (shape.type === "face") {
        this.nodes[shape.id] = {
          id: shape.id, kind: "shape", shapeType: "face", localGeom: { points: (shape.pointsWorld ?? []).map((p) => ({ ...p })) },
          nodeTransform: { x: 0, y: 0, rot: 0 }, style: { ...shape }, createdAt: shape.createdAt ?? Date.now(),
        };
        this.rootIds.push(shape.id);
      } else if (shape.type === "fillRegion") {
        this.nodes[shape.id] = {
          id: shape.id, kind: "shape", shapeType: "fillRegion", localGeom: { uvCycle: shape.uvCycle ?? [] },
          nodeTransform: { x: 0, y: 0, rot: 0 }, style: { ...shape }, createdAt: shape.createdAt ?? Date.now(),
        };
        this.rootIds.push(shape.id);
      } else if (shape.type === "group") {
        this.nodes[shape.id] = {
          id: shape.id, kind: "object", name: "Object", transform: { x: 0, y: 0, rot: 0 }, children: [...(shape.childIds ?? [])], createdAt: shape.createdAt ?? Date.now(),
        };
        this.rootIds.push(shape.id);
        for (const childId of (shape.childIds ?? [])) this.parentById[childId] = shape.id;
      }
    }
    this.invalidateDerivedData();
  }
}
