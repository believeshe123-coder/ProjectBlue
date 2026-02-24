import { FillRegion } from "../models/fillRegion.js";
import { PolygonShape } from "../models/polygonShape.js";
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

function distanceSquared(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return (dx * dx) + (dy * dy);
}

function compareByZMeta(a, b) {
  const zA = Number.isFinite(a?.zIndex) ? a.zIndex : 0;
  const zB = Number.isFinite(b?.zIndex) ? b.zIndex : 0;
  if (zA !== zB) return zA - zB;
  const createdA = Number.isFinite(a?.createdAt) ? a.createdAt : 0;
  const createdB = Number.isFinite(b?.createdAt) ? b.createdAt : 0;
  if (createdA !== createdB) return createdA - createdB;
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

function segmentMatchesBoundary(line, edgeStart, edgeEnd, tolerance = 1.5) {
  const tol2 = tolerance * tolerance;
  const sameDirection = distanceSquared(line.start, edgeStart) <= tol2 && distanceSquared(line.end, edgeEnd) <= tol2;
  const reversedDirection = distanceSquared(line.start, edgeEnd) <= tol2 && distanceSquared(line.end, edgeStart) <= tol2;
  return sameDirection || reversedDirection;
}

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
    this.lineGroups = {};
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

    if (shape.type === "polygon") {
      this.nodes[shape.id] = {
        id: shape.id,
        kind: "shape",
        shapeType: "polygon",
        localGeom: { points: (shape.pointsWorld ?? shape.points ?? []).map((point) => ({ ...point })) },
        nodeTransform: { x: 0, y: 0, rot: 0 },
        style: shape.toJSON(),
        createdAt: shape.createdAt ?? Date.now(),
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

    for (const childId of validIds) {
      const existingParentId = this.parentById[childId];
      if (!existingParentId) continue;
      const existingParent = this.nodes[existingParentId];
      if (existingParent?.kind === "object") {
        existingParent.children = (existingParent.children ?? []).filter((id) => id !== childId);
      }
      delete this.parentById[childId];
    }

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
        strokeColor: node.style.strokeColor, strokeWidth: node.style.strokeWidth, zIndex: node.style.zIndex ?? 0,
        ownedByFaceIds: node.localGeom.ownedByFaceIds ?? [], createdAt: node.createdAt ?? 0,
      };
    }

    if (node.shapeType === "face") {
      const pointsWorld = node.localGeom.points.map((p) => applyTransformPoint(worldTx, p));
      return {
        id, type: "face", pointsWorld, visible: node.style.visible !== false, locked: node.style.locked === true,
        selected: node.style.selected === true, fillColor: node.style.fillColor, fillAlpha: node.style.fillAlpha ?? node.style.fillOpacity ?? 1,
        sourceRegionKey: node.style.sourceRegionKey ?? null,
        sourceLineIds: [...(node.meta?.sourceLineIds ?? node.style?.sourceLineIds ?? [])],
        createdAt: node.createdAt ?? 0,
      };
    }

    if (node.shapeType === "polygon") {
      const localPoints = node.localGeom.points
        ?? (node.style.pointsUV ?? []).map((point) => isoUVToWorld(point.u, point.v));
      const pointsWorld = localPoints.map((point) => applyTransformPoint(worldTx, point));
      return new PolygonShape({
        ...node.style,
        id,
        pointsWorld,
      });
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

  getTopmostHitShape(point, toleranceWorld = 6, options = {}) {
    const lineOnly = options?.lineOnly === true;
    const allowedTypes = Array.isArray(options?.allowedTypes) ? new Set(options.allowedTypes) : null;
    const orderedIds = lineOnly
      ? this.getLineOrderIds()
      : this.getDrawList();
    for (let i = orderedIds.length - 1; i >= 0; i -= 1) {
      const id = orderedIds[i];
      const node = this.nodes[id];
      if (!node || node.kind !== "shape") continue;
      if (node.style?.visible === false || node.style?.locked === true) continue;
      if (lineOnly && node.shapeType !== "line") continue;
      if (allowedTypes && !allowedTypes.has(node.shapeType)) continue;
      const worldTx = this.getWorldTransform(id);
      const localPt = pointToLocal(point, worldTx);
      if (node.shapeType === "face") {
        if (isPointInPolygon(localPt, node.localGeom.points)) return this.toShapeView(id);
      } else if (node.shapeType === "line") {
        const a = isoUVToWorld(node.localGeom.a.u, node.localGeom.a.v);
        const b = isoUVToWorld(node.localGeom.b.u, node.localGeom.b.v);
        if (distancePointToSegment(localPt, a, b) <= toleranceWorld) return this.toShapeView(id);
      } else if (node.shapeType === "polygon") {
        const points = node.localGeom.points
          ?? (node.style.pointsUV ?? []).map((uvPoint) => isoUVToWorld(uvPoint.u, uvPoint.v));
        if (isPointInPolygon(localPt, points)) return this.toShapeView(id);
      } else if (node.shapeType === "fillRegion") {
        const points = (node.localGeom.uvCycle ?? []).map((uvPoint) => isoUVToWorld(uvPoint.u, uvPoint.v));
        if (isPointInPolygon(localPt, points)) return this.toShapeView(id);
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
    if (shape.type === "fillRegion" || shape.type === "polygon") {
      if (shape.getBounds) return shape.getBounds();
      return shape.bounds ?? null;
    }
    return null;
  }

  getShapesIntersectingRect(rect, options = {}) {
    const normalized = normalizeRect(rect);
    if (!normalized) return [];
    const lineOnly = options?.lineOnly === true;
    return this.getShapes().filter((shape) => {
      if (lineOnly && shape.type !== "line") return false;
      if (shape.visible === false || shape.locked === true) return false;
      const bounds = this.getShapeBounds(shape);
      return rectsIntersect(bounds, normalized);
    });
  }

  getShapeTargetsForMove(ids = []) {
    return ids.map((id) => this.toShapeView(id)).filter(Boolean);
  }

  applyWorldDeltaToNode(id, delta, options = {}) {
    const node = this.nodes[id];
    if (!node) return;
    if (node.kind === "object") {
      if (options?.lineOnly === true) return;
      node.transform.x += delta.x;
      node.transform.y += delta.y;
      return;
    }
    if (node.kind === "shape" && node.shapeType === "face") {
      if (options?.lineOnly === true) return;
      const sourceLineIds = node.meta?.sourceLineIds ?? node.style?.sourceLineIds ?? [];
      for (const lineId of sourceLineIds) {
        const lineNode = this.nodes[lineId];
        if (!lineNode || lineNode.kind !== "shape" || lineNode.shapeType !== "line") continue;
        if (this.parentById[lineId]) continue;
        lineNode.nodeTransform.x += delta.x;
        lineNode.nodeTransform.y += delta.y;
      }
    }
    node.nodeTransform.x += delta.x;
    node.nodeTransform.y += delta.y;
    this.invalidateDerivedData();
  }

  getDescendantIds(id) {
    const node = this.nodes[id];
    if (!node || node.kind !== "object") return [];
    const out = [];
    const stack = [...(node.children ?? [])];
    while (stack.length) {
      const childId = stack.pop();
      if (!childId || out.includes(childId)) continue;
      out.push(childId);
      const child = this.nodes[childId];
      if (child?.kind === "object") stack.push(...(child.children ?? []));
    }
    return out;
  }

  buildLineOwnerMap() {
    const ownersByLineId = new Map();
    const addOwner = (lineId, ownerKey) => {
      if (!this.nodes[lineId] || !ownerKey) return;
      if (!ownersByLineId.has(lineId)) ownersByLineId.set(lineId, new Set());
      ownersByLineId.get(lineId).add(ownerKey);
    };

    for (const node of Object.values(this.nodes)) {
      if (node.kind === "shape" && node.shapeType === "face") {
        const sourceLineIds = node.meta?.sourceLineIds ?? node.style?.sourceLineIds ?? [];
        for (const lineId of sourceLineIds) addOwner(lineId, `face:${node.id}`);
      }
      if (node.kind === "object") {
        for (const childId of node.children ?? []) {
          const child = this.nodes[childId];
          if (child?.kind === "shape" && child.shapeType === "line") addOwner(childId, `object:${node.id}`);
        }
      }
    }
    return ownersByLineId;
  }

  deleteNodesInEntirety(ids = []) {
    const targetIds = [...new Set(ids.filter((id) => this.nodes[id]))];
    if (!targetIds.length) return [];

    const deleteSet = new Set();
    const explicitLineIds = new Set();
    const protectedLineIds = new Set();
    const deletingOwnerKeys = new Set();

    for (const id of targetIds) {
      const node = this.nodes[id];
      if (!node) continue;
      deleteSet.add(id);
      if (node.kind === "shape" && node.shapeType === "line") explicitLineIds.add(id);
      if (node.kind === "shape" && node.shapeType === "face") deletingOwnerKeys.add(`face:${id}`);
      if (node.kind === "object") {
        deletingOwnerKeys.add(`object:${id}`);
        for (const childId of this.getDescendantIds(id)) {
          const child = this.nodes[childId];
          if (!child) continue;
          deleteSet.add(childId);
          if (child.kind === "shape" && child.shapeType === "face") deletingOwnerKeys.add(`face:${childId}`);
          if (child.kind === "object") deletingOwnerKeys.add(`object:${childId}`);
        }
      }
    }

    const lineOwners = this.buildLineOwnerMap();
    for (const id of [...deleteSet]) {
      const node = this.nodes[id];
      if (!node || node.kind !== "shape" || node.shapeType !== "face") continue;
      const sourceLineIds = node.meta?.sourceLineIds ?? node.style?.sourceLineIds ?? [];
      for (const lineId of sourceLineIds) {
        const lineNode = this.nodes[lineId];
        if (!lineNode || lineNode.kind !== "shape" || lineNode.shapeType !== "line") continue;
        if (explicitLineIds.has(lineId)) {
          deleteSet.add(lineId);
          continue;
        }
        const owners = lineOwners.get(lineId) ?? new Set();
        const hasExternalOwners = [...owners].some((ownerKey) => !deletingOwnerKeys.has(ownerKey));
        if (hasExternalOwners) {
          protectedLineIds.add(lineId);
        } else {
          deleteSet.add(lineId);
        }
      }
    }

    for (const lineId of protectedLineIds) {
      deleteSet.delete(lineId);
      const parentId = this.parentById[lineId];
      if (!parentId || !deleteSet.has(parentId)) continue;
      const parent = this.nodes[parentId];
      if (parent?.kind === "object") parent.children = (parent.children ?? []).filter((id) => id !== lineId);
      delete this.parentById[lineId];
      if (!this.rootIds.includes(lineId)) this.rootIds.push(lineId);
    }

    const orderedIds = [...deleteSet].sort((a, b) => {
      const depth = (id) => {
        let d = 0;
        let cursor = id;
        while (this.parentById[cursor]) {
          d += 1;
          cursor = this.parentById[cursor];
        }
        return d;
      };
      return depth(b) - depth(a);
    });

    for (const id of orderedIds) {
      const node = this.nodes[id];
      if (!node) continue;
      const parentId = this.parentById[id];
      if (parentId) {
        const parent = this.nodes[parentId];
        if (parent?.kind === "object") parent.children = (parent.children ?? []).filter((cid) => cid !== id);
      }
      if (node.kind === "object") {
        for (const childId of node.children ?? []) {
          if (deleteSet.has(childId)) delete this.parentById[childId];
        }
      }
      delete this.parentById[id];
      delete this.nodes[id];
      this.rootIds = this.rootIds.filter((rid) => rid !== id);
    }

    for (const [id, parentId] of Object.entries(this.parentById)) {
      if (!this.nodes[id] || !this.nodes[parentId]) delete this.parentById[id];
    }
    this.rootIds = this.rootIds.filter((id) => this.nodes[id] && !this.parentById[id]);

    for (const group of Object.values(this.lineGroups)) {
      group.childIds = (group.childIds ?? []).filter((lineId) => this.nodes[lineId]);
      if (group.childIds.length < 2) {
        for (const lineId of group.childIds) {
          const node = this.nodes[lineId];
          if (node?.style?.groupId === group.id) node.style.groupId = null;
        }
        delete this.lineGroups[group.id];
      }
    }

    this.invalidateDerivedData();
    return orderedIds;
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

  getRenderableShapesSorted() {
    const lines = this.getShapes().filter((shape) => shape.type === "line").sort(compareByZMeta);
    const others = this.getShapes().filter((shape) => shape.type !== "fillRegion" && shape.type !== "line");
    return [...others, ...lines];
  }

  getLineOrderIds() {
    return this.getShapes()
      .filter((shape) => shape.type === "line")
      .sort(compareByZMeta)
      .map((shape) => shape.id);
  }

  setLineOrder(lineIds = []) {
    let changed = false;
    for (let i = 0; i < lineIds.length; i += 1) {
      const id = lineIds[i];
      const node = this.nodes[id];
      if (!node?.style) continue;
      if (node.style.zIndex !== i) {
        node.style.zIndex = i;
        changed = true;
      }
    }
    return changed;
  }

  reorderLineBlock(lineIds = [], mode = "front") {
    const order = this.getLineOrderIds();
    const idSet = new Set(lineIds.filter((id) => this.nodes[id]?.shapeType === "line"));
    const selected = order.filter((id) => idSet.has(id));
    if (!selected.length) return false;

    const unselected = order.filter((id) => !idSet.has(id));
    const firstSelectedIndex = order.findIndex((id) => idSet.has(id));
    const compactPos = order.slice(0, firstSelectedIndex).filter((id) => !idSet.has(id)).length;
    let insertAt = compactPos;

    if (mode === "front") insertAt = unselected.length;
    else if (mode === "back") insertAt = 0;
    else if (mode === "forward") insertAt = Math.min(compactPos + 1, unselected.length);
    else if (mode === "backward") insertAt = Math.max(compactPos - 1, 0);
    else return false;

    const nextOrder = [...unselected];
    nextOrder.splice(insertAt, 0, ...selected);
    if (nextOrder.join("|") === order.join("|")) return false;
    return this.setLineOrder(nextOrder);
  }

  bringToFront(lineIds = []) { return this.reorderLineBlock(lineIds, "front"); }

  bringForward(lineIds = []) { return this.reorderLineBlock(lineIds, "forward"); }

  sendBackward(lineIds = []) { return this.reorderLineBlock(lineIds, "backward"); }

  sendToBack(lineIds = []) { return this.reorderLineBlock(lineIds, "back"); }

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
    const id = region?.id ?? null;
    const fillColor = color;
    const fillAlpha = alpha;
    console.log("[FILL] upsert", id, fillColor, fillAlpha);
    if (!region?.id || !Array.isArray(region.uvCycle) || region.uvCycle.length < 3) return null;
    const existing = Object.values(this.nodes).find((n) => n.kind === "shape" && n.shapeType === "fillRegion" && n.style.regionId === region.id);
    if (existing) {
      existing.style.color = color; existing.style.alpha = alpha; existing.style.fillColor = color; existing.style.fillOpacity = alpha;
      existing.style.uvCycle = region.uvCycle.map((point) => ({ ...point }));
      existing.localGeom.uvCycle = region.uvCycle;
      return FillRegion.fromJSON(existing.style);
    }
    const fill = new FillRegion({ regionId: region.id, uvCycle: region.uvCycle, color, alpha });
    this.addShape(fill);
    return fill;
  }

  getFillRegions() { return this.getShapes().filter((shape) => shape.type === "fillRegion"); }

  getFaceBySourceRegionKey(regionKey) {
    if (!regionKey) return null;
    const faceNode = Object.values(this.nodes).find((node) => node.kind === "shape" && node.shapeType === "face" && node.style?.sourceRegionKey === regionKey);
    return faceNode ? this.toShapeView(faceNode.id) : null;
  }

  createFaceFromRegion(region, fillStyle = {}) {
    if (!region?.uvCycle || region.uvCycle.length < 3) return null;
    const pointsWorld = region.uvCycle.map((p) => isoUVToWorld(p.u, p.v));
    const nodeId = makeId("face");
    const sourceLineIds = this.getBoundaryLineIdsForRegion(region.uvCycle);
    this.nodes[nodeId] = {
      id: nodeId,
      kind: "shape",
      shapeType: "face",
      localGeom: { points: pointsWorld },
      nodeTransform: { ...IDENTITY_TRANSFORM },
      style: {
        id: nodeId,
        type: "face",
        fillColor: fillStyle.fillColor ?? fillStyle.color ?? "#4aa3ff",
        fillAlpha: fillStyle.fillAlpha ?? fillStyle.alpha ?? fillStyle.fillOpacity ?? 1,
        sourceRegionKey: region.id,
        sourceLineIds,
        visible: true,
        locked: false,
      },
      meta: { sourceLineIds },
      createdAt: Date.now(),
    };
    this.rootIds.push(nodeId);
    this.markRegionBoundaryLinesOwnedByFace(sourceLineIds, nodeId);
    return nodeId;
  }

  getBoundaryLineIdsForRegion(uvCycle) {
    const boundaryIds = new Set();
    const edges = new Set();
    for (let i = 0; i < uvCycle.length; i += 1) edges.add(edgeKey(uvCycle[i], uvCycle[(i + 1) % uvCycle.length]));

    const regionWorldEdges = [];
    for (let i = 0; i < uvCycle.length; i += 1) {
      regionWorldEdges.push([
        isoUVToWorld(uvCycle[i].u, uvCycle[i].v),
        isoUVToWorld(uvCycle[(i + 1) % uvCycle.length].u, uvCycle[(i + 1) % uvCycle.length].v),
      ]);
    }

    for (const node of Object.values(this.nodes)) {
      if (node.kind !== "shape" || node.shapeType !== "line") continue;
      const shape = this.toShapeView(node.id);
      if (!shape) continue;
      if (edges.has(edgeKey(shape.startUV, shape.endUV))) {
        boundaryIds.add(node.id);
        continue;
      }
      if (regionWorldEdges.some(([a, b]) => segmentMatchesBoundary(shape, a, b))) {
        boundaryIds.add(node.id);
      }
    }
    return [...boundaryIds];
  }

  markRegionBoundaryLinesOwnedByFace(lineIds, faceId) {
    for (const lineId of lineIds) {
      const node = this.nodes[lineId];
      if (!node || node.kind !== "shape" || node.shapeType !== "line") continue;
      node.localGeom.ownedByFaceIds = [...new Set([...(node.localGeom.ownedByFaceIds ?? []), faceId])];
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
      const nodeId = this.createFaceFromRegion(region, {
        color: fill.color,
        alpha: fill.alpha,
        fillColor: fill.fillColor,
        fillOpacity: fill.fillOpacity,
      });
      if (!nodeId) continue;
      const fillNode = Object.values(this.nodes).find((node) => node.kind === "shape" && node.shapeType === "fillRegion" && node.style.regionId === region.id);
      if (fillNode) this.removeShape(fillNode.id);
      ids.push(nodeId);
    }
    return ids;
  }

  getSelectionBoundsFromIds(ids = []) {
    const bounds = ids.map((id) => this.getShapeBounds(this.toShapeView(id))).filter(Boolean);
    if (!bounds.length) return null;
    return { minX: Math.min(...bounds.map((b) => b.minX)), minY: Math.min(...bounds.map((b) => b.minY)), maxX: Math.max(...bounds.map((b) => b.maxX)), maxY: Math.max(...bounds.map((b) => b.maxY)) };
  }


  createLineGroup(childIds = []) {
    const ids = [...new Set(childIds)].filter((id) => {
      const node = this.nodes[id];
      return node?.kind === "shape" && node.shapeType === "line";
    });
    if (ids.length < 2) return null;
    const id = makeId("group");
    const createdAt = Date.now();
    this.lineGroups[id] = { id, childIds: ids, createdAt };
    for (const lineId of ids) {
      const node = this.nodes[lineId];
      if (node?.style) node.style.groupId = id;
    }
    return id;
  }

  getLineGroup(id) {
    return this.lineGroups[id] ?? null;
  }

  hasLineGroups() {
    return Object.keys(this.lineGroups).length > 0;
  }

  deleteLineGroup(id) {
    const group = this.lineGroups[id];
    if (!group) return false;
    for (const lineId of group.childIds ?? []) {
      const node = this.nodes[lineId];
      if (node?.style?.groupId === id) node.style.groupId = null;
    }
    delete this.lineGroups[id];
    return true;
  }

  clearAllLineGroups() {
    for (const group of Object.values(this.lineGroups)) {
      for (const lineId of group.childIds ?? []) {
        const node = this.nodes[lineId];
        if (node?.style?.groupId === group.id) node.style.groupId = null;
      }
    }
    this.lineGroups = {};
  }

  reorderSelectionZ(selectionIds = [], mode = "front") {
    if (mode === "front") return this.bringToFront(selectionIds);
    if (mode === "forward") return this.bringForward(selectionIds);
    if (mode === "backward") return this.sendBackward(selectionIds);
    if (mode === "back") return this.sendToBack(selectionIds);
    return false;
  }

  clear() { this.nodes = {}; this.parentById = {}; this.rootIds = []; this.lineGroups = {}; this.invalidateDerivedData(); }

  serialize() {
    return { nodes: this.nodes, parentById: this.parentById, rootIds: this.rootIds, lineGroups: this.lineGroups };
  }

  replaceFromSerialized(serialized) {
    if (serialized?.nodes && Array.isArray(serialized?.rootIds)) {
      this.nodes = serialized.nodes;
      this.parentById = serialized.parentById ?? {};
      this.rootIds = serialized.rootIds;
      this.lineGroups = serialized.lineGroups ?? {};
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
      } else if (shape.type === "polygon") {
        this.nodes[shape.id] = {
          id: shape.id,
          kind: "shape",
          shapeType: "polygon",
          localGeom: { points: (shape.pointsWorld ?? shape.points ?? []).map((point) => ({ ...point })) },
          nodeTransform: { x: 0, y: 0, rot: 0 },
          style: { ...shape },
          createdAt: shape.createdAt ?? Date.now(),
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
