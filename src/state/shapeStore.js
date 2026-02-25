import { FillRegion } from "../models/fillRegion.js";
import { PolygonShape } from "../models/polygonShape.js";
import { buildRegionsFromLines } from "../core/regionBuilder.js";
import { isoUVToWorld, worldToIsoUV } from "../core/isoGrid.js";
import { distancePointToSegment, isPointInPolygon } from "../utils/math.js";
import { IDENTITY_TRANSFORM, applyTransformPoint, composeTransform, pointToLocal } from "../utils/transform.js";

function makeId(prefix = "node") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function makeLayerId() {
  return makeId("layer");
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

function deepClone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
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
    this.activeLayerId = null;
    this.ensureDefaultLayer();
  }

  invalidateDerivedData() { this.cachedLinesHash = ""; }

  ensureNodeTransform(node) {
    if (!node.nodeTransform) node.nodeTransform = { ...IDENTITY_TRANSFORM };
  }

  ensureDefaultLayer() {
    const existingLayerId = this.rootIds.find((id) => this.nodes[id]?.kind === "layer");
    if (existingLayerId) {
      this.activeLayerId = this.nodes[existingLayerId] ? (this.activeLayerId ?? existingLayerId) : null;
      return existingLayerId;
    }

    const layerId = makeLayerId();
    this.nodes[layerId] = {
      id: layerId,
      kind: "layer",
      name: "Layer 1",
      visible: true,
      locked: false,
      children: [],
      createdAt: Date.now(),
    };
    this.rootIds = [layerId];
    this.activeLayerId = layerId;
    return layerId;
  }

  getLayerNode(id) {
    const node = this.nodes[id];
    return node?.kind === "layer" ? node : null;
  }

  getLayerOrderIds() {
    this.ensureDefaultLayer();
    return this.rootIds.filter((id) => this.nodes[id]?.kind === "layer");
  }

  getActiveLayerId() {
    const fallbackId = this.ensureDefaultLayer();
    if (!this.getLayerNode(this.activeLayerId)) this.activeLayerId = fallbackId;
    return this.activeLayerId;
  }

  setActiveLayer(id) {
    if (!this.getLayerNode(id)) return false;
    this.activeLayerId = id;
    return true;
  }

  createLayer({ name } = {}) {
    const id = makeLayerId();
    const index = this.getLayerOrderIds().length + 1;
    this.nodes[id] = {
      id,
      kind: "layer",
      name: name || `Layer ${index}`,
      visible: true,
      locked: false,
      children: [],
      createdAt: Date.now(),
    };
    this.rootIds = [...this.getLayerOrderIds(), id];
    this.activeLayerId = id;
    return id;
  }

  setLayerVisibility(id, visible) {
    const layer = this.getLayerNode(id);
    if (!layer) return false;
    layer.visible = visible !== false;
    return true;
  }

  setLayerLocked(id, locked) {
    const layer = this.getLayerNode(id);
    if (!layer) return false;
    layer.locked = locked === true;
    return true;
  }

  setLayerName(id, name) {
    const layer = this.getLayerNode(id);
    if (!layer) return false;
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return false;
    layer.name = trimmed;
    return true;
  }

  getLayers() {
    const activeId = this.getActiveLayerId();
    return this.getLayerOrderIds().map((id, index) => {
      const layer = this.getLayerNode(id);
      return {
        id,
        name: layer?.name || `Layer ${index + 1}`,
        visible: layer?.visible !== false,
        locked: layer?.locked === true,
        active: id === activeId,
        childCount: Array.isArray(layer?.children) ? layer.children.length : 0,
      };
    });
  }

  reorderLayers(nextOrderedIds = []) {
    const currentOrder = this.getLayerOrderIds();
    const currentSet = new Set(currentOrder);
    const requestedIds = Array.isArray(nextOrderedIds) ? nextOrderedIds : [];
    const uniqueRequestedIds = [...new Set(requestedIds)];

    if (uniqueRequestedIds.length !== currentOrder.length) {
      return {
        ok: false,
        changed: false,
        reason: "expected_exact_layer_count",
        order: [...currentOrder],
      };
    }

    if (uniqueRequestedIds.some((id) => !currentSet.has(id))) {
      return {
        ok: false,
        changed: false,
        reason: "contains_unknown_layer_id",
        order: [...currentOrder],
      };
    }

    const isSameOrder = uniqueRequestedIds.every((id, index) => id === currentOrder[index]);
    if (isSameOrder) {
      return {
        ok: true,
        changed: false,
        reason: "unchanged",
        order: [...currentOrder],
      };
    }

    this.rootIds = [...uniqueRequestedIds];
    if (!this.getLayerNode(this.activeLayerId)) this.activeLayerId = this.rootIds[0] ?? null;
    return {
      ok: true,
      changed: true,
      reason: null,
      order: [...this.rootIds],
    };
  }

  deleteLayer(layerId, { targetLayerId = null } = {}) {
    const layer = this.getLayerNode(layerId);
    if (!layer) {
      return { ok: false, reason: "layer_not_found", deletedLayerId: null, targetLayerId: null };
    }

    const layerOrder = this.getLayerOrderIds();
    if (layerOrder.length <= 1) {
      return { ok: false, reason: "cannot_delete_last_layer", deletedLayerId: null, targetLayerId: null };
    }

    const fallbackLayerId = layerOrder.find((id) => id !== layerId) ?? null;
    let resolvedTargetLayerId = targetLayerId;
    if (!resolvedTargetLayerId || resolvedTargetLayerId === layerId || !this.getLayerNode(resolvedTargetLayerId)) {
      resolvedTargetLayerId = fallbackLayerId;
    }

    if (!resolvedTargetLayerId || resolvedTargetLayerId === layerId || !this.getLayerNode(resolvedTargetLayerId)) {
      return { ok: false, reason: "target_layer_not_found", deletedLayerId: null, targetLayerId: null };
    }

    const children = Array.isArray(layer.children) ? [...layer.children] : [];
    for (const childId of children) {
      if (!this.nodes[childId]) continue;
      this.attachNodeToLayer(childId, resolvedTargetLayerId);
    }

    delete this.parentById[layerId];
    delete this.nodes[layerId];
    this.rootIds = layerOrder.filter((id) => id !== layerId);

    if (this.activeLayerId === layerId || !this.getLayerNode(this.activeLayerId)) {
      this.activeLayerId = resolvedTargetLayerId;
    }

    return {
      ok: true,
      reason: null,
      deletedLayerId: layerId,
      targetLayerId: resolvedTargetLayerId,
      movedChildCount: children.length,
      order: [...this.rootIds],
    };
  }

  moveNodesToLayer(ids = [], layerId) {
    const targetLayer = this.getLayerNode(layerId);
    if (!targetLayer || targetLayer.visible === false || targetLayer.locked === true) return [];

    const movedIds = [];
    const uniqueIds = [...new Set(ids)].filter((id) => {
      const node = this.nodes[id];
      return node && node.kind !== "layer";
    });

    for (const id of uniqueIds) {
      let rootId = id;
      let parentId = this.parentById[rootId] ?? null;
      while (parentId && this.nodes[parentId]?.kind === "object") {
        rootId = parentId;
        parentId = this.parentById[rootId] ?? null;
      }
      if (!this.nodes[rootId] || movedIds.includes(rootId)) continue;
      if (!this.isNodeInteractable(rootId, { includeLocked: false })) continue;
      if (this.getNodeLayerId(rootId) === layerId) continue;
      this.attachNodeToLayer(rootId, layerId);
      movedIds.push(rootId);
    }

    return movedIds;
  }

  ensureLayerHierarchyIntegrity() {
    const layerIds = this.getLayerOrderIds();
    const layerSet = new Set(layerIds);
    for (const id of Object.keys(this.nodes)) {
      const node = this.nodes[id];
      if (!node || node.kind === "layer") continue;
      const parentId = this.parentById[id] ?? null;
      if (!parentId || !this.nodes[parentId]) {
        this.attachNodeToLayer(id);
        continue;
      }
      const parent = this.nodes[parentId];
      if (parent.kind === "layer") {
        if (!layerSet.has(parentId)) this.attachNodeToLayer(id);
        continue;
      }
      const layerId = this.getNodeLayerId(parentId);
      if (!layerId || !layerSet.has(layerId)) this.attachNodeToLayer(id);
    }
  }

  getNodeLayerId(id) {
    let currentId = id;
    while (currentId) {
      const node = this.nodes[currentId];
      if (!node) return null;
      if (node.kind === "layer") return node.id;
      currentId = this.parentById[currentId] ?? null;
    }
    return null;
  }

  attachNodeToLayer(nodeId, layerId = null, insertAt = null) {
    const node = this.nodes[nodeId];
    if (!node) return null;
    const targetLayerId = layerId && this.getLayerNode(layerId)
      ? layerId
      : (this.activeLayerId && this.getLayerNode(this.activeLayerId) ? this.activeLayerId : this.ensureDefaultLayer());
    const layer = this.nodes[targetLayerId];

    const currentParentId = this.parentById[nodeId];
    if (currentParentId) {
      const currentParent = this.nodes[currentParentId];
      if (currentParent?.children) currentParent.children = currentParent.children.filter((id) => id !== nodeId);
    }

    this.parentById[nodeId] = targetLayerId;
    if (!Array.isArray(layer.children)) layer.children = [];
    const baseChildren = layer.children.filter((id) => id !== nodeId);
    const index = Number.isInteger(insertAt) ? Math.max(0, Math.min(insertAt, baseChildren.length)) : baseChildren.length;
    baseChildren.splice(index, 0, nodeId);
    layer.children = baseChildren;
    return targetLayerId;
  }

  isNodeInteractable(id, { includeLocked = false } = {}) {
    let currentId = id;
    while (currentId) {
      const node = this.nodes[currentId];
      if (!node) return false;
      if (node.kind === "layer") {
        if (node.visible === false) return false;
        if (!includeLocked && node.locked === true) return false;
        return true;
      }
      currentId = this.parentById[currentId] ?? null;
    }
    return false;
  }

  addShape(shape) {
    if (!shape) return null;
    if (shape.type === "fillRegion") {
      this.nodes[shape.id] = {
        id: shape.id, kind: "shape", shapeType: "fillRegion", localGeom: { uvCycle: shape.uvCycle ?? [] },
        nodeTransform: { ...IDENTITY_TRANSFORM }, style: shape.toJSON(), createdAt: shape.createdAt ?? Date.now(),
      };
      this.attachNodeToLayer(shape.id);
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
      this.attachNodeToLayer(shape.id);
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
      this.attachNodeToLayer(shape.id);
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
      this.attachNodeToLayer(shape.id);
      return shape;
    }
    return shape;
  }

  createObjectFromIds(ids = [], { name = "Object" } = {}) {
    const objectId = makeId("object");
    const validIds = [...new Set(ids)].filter((id) => this.nodes[id]);
    if (!validIds.length) return null;

    const layerCandidates = [...new Set(validIds.map((id) => this.getNodeLayerId(id)).filter(Boolean))];
    const targetLayerId = layerCandidates[0] ?? this.ensureDefaultLayer();
    const targetLayer = this.getLayerNode(targetLayerId);
    if (!targetLayer) return null;
    const rootIndices = validIds
      .map((id) => targetLayer.children?.indexOf(id) ?? -1)
      .filter((i) => i >= 0);
    const insertAt = rootIndices.length ? Math.min(...rootIndices) : (targetLayer.children?.length ?? 0);

    const allowedIds = validIds.filter((id) => this.getNodeLayerId(id) === targetLayerId);
    if (!allowedIds.length) return null;

    for (const childId of allowedIds) {
      const existingParentId = this.parentById[childId];
      if (!existingParentId) continue;
      const existingParent = this.nodes[existingParentId];
      if (existingParent?.kind === "object" || existingParent?.kind === "layer") {
        existingParent.children = (existingParent.children ?? []).filter((id) => id !== childId);
      }
      delete this.parentById[childId];
    }

    this.nodes[objectId] = {
      id: objectId,
      kind: "object",
      name,
      transform: { ...IDENTITY_TRANSFORM },
      children: [...allowedIds],
      createdAt: Date.now(),
    };
    for (const childId of allowedIds) this.parentById[childId] = objectId;
    this.attachNodeToLayer(objectId, targetLayerId, insertAt);
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
    const visit = (id, parentHidden = false, parentLocked = false) => {
      const node = this.nodes[id];
      if (!node) return;
      const hidden = parentHidden || (node.kind === "layer" ? node.visible === false : false);
      const locked = parentLocked || (node.kind === "layer" ? node.locked === true : false);
      if (node.kind === "shape") {
        if (!hidden && !locked) out.push(id);
        return;
      }
      for (const childId of node.children ?? []) visit(childId, hidden, locked);
    };
    for (const id of this.getLayerOrderIds()) visit(id, false, false);
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
        id,
        type: "line",
        start,
        end,
        startUV,
        endUV,
        visible: node.style.visible !== false,
        locked: node.style.locked === true,
        selected: node.style.selected === true,
        strokeColor: node.style.strokeColor,
        fillColor: node.style.fillColor,
        strokeWidth: node.style.strokeWidth,
        opacity: node.style.opacity,
        strokeOpacity: node.style.strokeOpacity,
        fillOpacity: node.style.fillOpacity,
        fillEnabled: node.style.fillEnabled,
        pinnedMeasure: node.style.pinnedMeasure,
        zIndex: node.style.zIndex ?? 0,
        groupId: node.style.groupId ?? null,
        sourceForPolygonId: node.style.sourceForPolygonId ?? null,
        ownedByFaceIds: node.localGeom.ownedByFaceIds ?? [],
        createdAt: node.createdAt ?? 0,
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
      if (!this.isNodeInteractable(id, { includeLocked: options?.includeLocked === true })) continue;
      if (node.style?.visible === false || (options?.includeLocked !== true && node.style?.locked === true)) continue;
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

  getObjectRootIds(ids = []) {
    const validIds = [...new Set(ids.filter((id) => this.nodes[id]))];
    return validIds.filter((id) => {
      let parentId = this.parentById[id] ?? null;
      while (parentId) {
        if (validIds.includes(parentId)) return false;
        parentId = this.parentById[parentId] ?? null;
      }
      return true;
    });
  }

  getAllObjectIds({ rootOnly = false } = {}) {
    const objectIds = Object.values(this.nodes)
      .filter((node) => node?.kind === "object")
      .map((node) => node.id);
    if (!rootOnly) return objectIds;
    return objectIds.filter((id) => {
      const parentId = this.parentById[id] ?? null;
      return !parentId || this.nodes[parentId]?.kind !== "object";
    });
  }

  getLineDescendantsForNode(id) {
    const node = this.nodes[id];
    if (!node) return [];
    if (node.kind === "shape") return node.shapeType === "line" ? [id] : [];
    if (node.kind !== "object") return [];

    const out = [];
    const stack = [...(node.children ?? [])];
    const seen = new Set();
    while (stack.length) {
      const childId = stack.pop();
      if (!childId || seen.has(childId)) continue;
      seen.add(childId);
      const child = this.nodes[childId];
      if (!child) continue;
      if (child.kind === "shape" && child.shapeType === "line") {
        out.push(childId);
      } else if (child.kind === "object") {
        stack.push(...(child.children ?? []));
      }
    }
    return out;
  }

  duplicateNodes(ids = [], { offset = null } = {}) {
    const inputIds = [...new Set(ids.filter((id) => this.nodes[id] && this.nodes[id].kind !== "layer" && this.isNodeInteractable(id, { includeLocked: false })) )];
    if (!inputIds.length) return [];

    const rootIds = inputIds.filter((id) => {
      let parentId = this.parentById[id] ?? null;
      while (parentId) {
        if (inputIds.includes(parentId)) return false;
        parentId = this.parentById[parentId] ?? null;
      }
      return true;
    });
    if (!rootIds.length) return [];

    const sortedRootIds = [...rootIds].sort((a, b) => {
      const parentA = this.parentById[a] ?? "";
      const parentB = this.parentById[b] ?? "";
      if (parentA !== parentB) return parentA.localeCompare(parentB);
      const parentNode = this.nodes[parentA];
      const indexA = parentNode?.children?.indexOf(a) ?? -1;
      const indexB = parentNode?.children?.indexOf(b) ?? -1;
      if (indexA !== indexB) return indexA - indexB;
      return a.localeCompare(b);
    });

    const cloneOrder = [];
    const visited = new Set();
    const collectSubtree = (rootId) => {
      const stack = [rootId];
      while (stack.length) {
        const currentId = stack.pop();
        if (!currentId || visited.has(currentId)) continue;
        const currentNode = this.nodes[currentId];
        if (!currentNode || currentNode.kind === "layer") continue;
        visited.add(currentId);
        cloneOrder.push(currentId);
        if (currentNode.kind === "object") {
          const children = [...(currentNode.children ?? [])];
          for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
        }
      }
    };
    for (const rootId of sortedRootIds) collectSubtree(rootId);
    if (!cloneOrder.length) return [];

    const idMap = new Map();
    for (const oldId of cloneOrder) {
      const oldNode = this.nodes[oldId];
      const prefix = oldNode?.kind === "object" ? "object" : (oldNode?.shapeType ?? "node");
      idMap.set(oldId, makeId(prefix));
    }

    const remapRefId = (refId) => (idMap.has(refId) ? idMap.get(refId) : refId);
    const remapRefList = (arr) => (Array.isArray(arr) ? arr.map((refId) => remapRefId(refId)) : arr);

    for (const oldId of cloneOrder) {
      const newId = idMap.get(oldId);
      const oldNode = this.nodes[oldId];
      const cloned = deepClone(oldNode);
      cloned.id = newId;
      if (cloned?.style?.id) cloned.style.id = newId;

      if (cloned.kind === "object") {
        cloned.children = (cloned.children ?? []).map((childId) => idMap.get(childId) ?? childId);
      }

      if (cloned.kind === "shape" && cloned.shapeType === "line") {
        if (cloned.localGeom?.ownedByFaceIds) cloned.localGeom.ownedByFaceIds = remapRefList(cloned.localGeom.ownedByFaceIds);
        if (cloned.localGeom?.ownedByFaceId) cloned.localGeom.ownedByFaceId = remapRefId(cloned.localGeom.ownedByFaceId);
        if (cloned.style?.sourceForPolygonId) cloned.style.sourceForPolygonId = remapRefId(cloned.style.sourceForPolygonId);
      }

      if (cloned.kind === "shape" && cloned.shapeType === "face") {
        if (cloned.style?.sourceLineIds) cloned.style.sourceLineIds = remapRefList(cloned.style.sourceLineIds);
        if (cloned.meta?.sourceLineIds) cloned.meta.sourceLineIds = remapRefList(cloned.meta.sourceLineIds);
      }

      if (cloned.kind === "shape" && cloned.shapeType === "polygon") {
        if (cloned.style?.sourceLineIds) cloned.style.sourceLineIds = remapRefList(cloned.style.sourceLineIds);
      }

      this.nodes[newId] = cloned;
    }

    for (const oldRootId of sortedRootIds) {
      const oldParentId = this.parentById[oldRootId] ?? null;
      const newRootId = idMap.get(oldRootId);
      const newParentId = oldParentId && idMap.has(oldParentId) ? idMap.get(oldParentId) : oldParentId;
      if (newParentId) {
        this.parentById[newRootId] = newParentId;
        const parentNode = this.nodes[newParentId];
        if (parentNode?.children) {
          const existingIndex = parentNode.children.indexOf(oldRootId);
          const insertAt = existingIndex >= 0 ? existingIndex + 1 : parentNode.children.length;
          parentNode.children.splice(insertAt, 0, newRootId);
        }
      }
    }

    for (const oldId of cloneOrder) {
      const oldParentId = this.parentById[oldId] ?? null;
      if (!oldParentId || sortedRootIds.includes(oldId)) continue;
      const newId = idMap.get(oldId);
      const newParentId = idMap.get(oldParentId);
      if (newParentId) this.parentById[newId] = newParentId;
    }

    const delta = {
      x: Number.isFinite(offset?.x) ? offset.x : 0,
      y: Number.isFinite(offset?.y) ? offset.y : 0,
    };
    if (delta.x !== 0 || delta.y !== 0) {
      for (const oldRootId of sortedRootIds) {
        const rootClone = this.nodes[idMap.get(oldRootId)];
        if (!rootClone) continue;
        if (rootClone.kind === "object") {
          rootClone.transform = rootClone.transform ?? { ...IDENTITY_TRANSFORM };
          rootClone.transform.x += delta.x;
          rootClone.transform.y += delta.y;
        } else if (rootClone.kind === "shape") {
          rootClone.nodeTransform = rootClone.nodeTransform ?? { ...IDENTITY_TRANSFORM };
          rootClone.nodeTransform.x += delta.x;
          rootClone.nodeTransform.y += delta.y;
        }
      }
    }

    this.invalidateDerivedData();
    return sortedRootIds.map((id) => idMap.get(id)).filter(Boolean);
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
    const targetIds = [...new Set(ids.filter((id) => this.nodes[id] && this.isNodeInteractable(id, { includeLocked: false })) )];
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
      if (!this.parentById[lineId]) this.attachNodeToLayer(lineId);
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
      const parentLayerId = this.getNodeLayerId(id);
    if (parentLayerId) {
      const layer = this.getLayerNode(parentLayerId);
      if (layer?.children) layer.children = layer.children.filter((rid) => rid !== id);
    }
    }

    for (const [id, parentId] of Object.entries(this.parentById)) {
      if (!this.nodes[id] || !this.nodes[parentId]) delete this.parentById[id];
    }
    this.rootIds = this.rootIds.filter((id) => this.nodes[id]?.kind === "layer");

    this.invalidateDerivedData();
    return orderedIds;
  }

  removeShape(id) {
    const node = this.nodes[id];
    if (!node) return false;
    const parentId = this.parentById[id];
    const parent = parentId ? this.nodes[parentId] : null;
    const insertionIndex = Array.isArray(parent?.children) ? parent.children.indexOf(id) : -1;
    if (parentId) {
      if (parent?.children) parent.children = parent.children.filter((cid) => cid !== id);
      delete this.parentById[id];
    }
    if (node.kind === "object") {
      const childIds = [...(node.children ?? [])].filter((childId) => this.nodes[childId]);
      if (parent && insertionIndex >= 0) {
        const nextChildren = [...(parent.children ?? [])];
        nextChildren.splice(insertionIndex, 0, ...childIds);
        parent.children = nextChildren;
      }
      for (const childId of childIds) {
        if (parentId) this.parentById[childId] = parentId;
        else delete this.parentById[childId];
      }
    }
    delete this.nodes[id];
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

  getSelectionTargetId(shapeId, options = {}) {
    if (!shapeId || !this.nodes[shapeId]) return null;
    if (options?.preferObjectRoot !== true) return shapeId;

    let targetId = shapeId;
    let parentId = this.parentById[shapeId] ?? null;
    const visited = new Set([shapeId]);
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parentNode = this.nodes[parentId];
      if (parentNode?.kind === "object") targetId = parentId;
      parentId = this.parentById[parentId] ?? null;
    }
    return targetId;
  }

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
    this.attachNodeToLayer(nodeId);
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


  createLineGroup(ids = []) {
    return this.createObjectFromIds(ids, { name: "Object" });
  }

  getLineGroup(id) {
    const node = this.nodes[id];
    if (!node || node.kind !== "object") return null;
    return { id: node.id, childIds: [...(node.children ?? [])] };
  }

  hasLineGroups() {
    return this.getAllObjectIds().length > 0;
  }

  deleteLineGroup(id) {
    const node = this.nodes[id];
    if (!node || node.kind !== "object") return false;
    return this.removeShape(id);
  }

  clearAllLineGroups() {
    const objectIdsByDepth = this.getAllObjectIds()
      .sort((a, b) => this.getNodeDepth(b) - this.getNodeDepth(a));
    for (const objectId of objectIdsByDepth) this.removeShape(objectId);
  }

  getNodeDepth(id) {
    let depth = 0;
    let cursor = id;
    while (this.parentById[cursor]) {
      depth += 1;
      cursor = this.parentById[cursor];
    }
    return depth;
  }

  reorderSelectionZ(selectionIds = [], mode = "front") {
    const lineIds = [...new Set(selectionIds
      .filter((id) => this.isNodeInteractable(id, { includeLocked: false }))
      .flatMap((id) => this.getLineDescendantsForNode(id)))];
    if (!lineIds.length) return false;
    if (mode === "front") return this.bringToFront(lineIds);
    if (mode === "forward") return this.bringForward(lineIds);
    if (mode === "backward") return this.sendBackward(lineIds);
    if (mode === "back") return this.sendToBack(lineIds);
    return false;
  }

  clear() { this.nodes = {}; this.parentById = {}; this.rootIds = []; this.activeLayerId = null; this.ensureDefaultLayer(); this.invalidateDerivedData(); }

  serialize() {
    return { nodes: this.nodes, parentById: this.parentById, rootIds: this.rootIds, activeLayerId: this.activeLayerId };
  }

  replaceFromSerialized(serialized) {
    if (serialized?.nodes && Array.isArray(serialized?.rootIds)) {
      this.nodes = serialized.nodes;
      this.parentById = serialized.parentById ?? {};
      this.rootIds = serialized.rootIds.filter((id) => this.nodes[id]);

      const legacyLineGroups = serialized?.lineGroups;
      const legacyGroups = [];
      if (Array.isArray(legacyLineGroups)) {
        for (const entry of legacyLineGroups) {
          if (!entry || typeof entry !== "object") continue;
          legacyGroups.push({
            id: entry.id,
            childIds: [...new Set(entry.childIds ?? entry.memberIds ?? [])].filter((childId) => this.nodes[childId]),
            createdAt: entry.createdAt,
            name: entry.name,
          });
        }
      } else if (legacyLineGroups && typeof legacyLineGroups === "object") {
        for (const [id, entry] of Object.entries(legacyLineGroups)) {
          const childIds = [...new Set(entry?.childIds ?? entry?.memberIds ?? [])].filter((childId) => this.nodes[childId]);
          legacyGroups.push({ id, childIds, createdAt: entry?.createdAt, name: entry?.name });
        }
      }

      const legacyGroupChildren = new Map();
      for (const node of Object.values(this.nodes)) {
        if (node?.kind !== "shape") continue;
        const groupId = node?.style?.groupId;
        if (!groupId) continue;
        if (!legacyGroupChildren.has(groupId)) legacyGroupChildren.set(groupId, []);
        legacyGroupChildren.get(groupId).push(node.id);
      }
      for (const [groupId, childIds] of legacyGroupChildren.entries()) {
        const existing = legacyGroups.find((entry) => entry.id === groupId);
        if (existing) {
          existing.childIds = [...new Set([...(existing.childIds ?? []), ...childIds])];
        } else {
          legacyGroups.push({ id: groupId, childIds: [...new Set(childIds)], createdAt: Date.now(), name: "Object" });
        }
      }

      for (const group of legacyGroups) {
        const childIds = [...new Set(group.childIds ?? [])].filter((childId) => this.nodes[childId]);
        if (!childIds.length) continue;
        const objectId = group.id && !this.nodes[group.id] ? group.id : makeId("object");
        this.nodes[objectId] = {
          id: objectId,
          kind: "object",
          name: group.name ?? "Object",
          transform: { ...IDENTITY_TRANSFORM },
          children: childIds,
          createdAt: group.createdAt ?? Date.now(),
        };
        const layerId = this.getNodeLayerId(childIds[0]) ?? this.ensureDefaultLayer();
        const parent = this.nodes[layerId];
        if (parent?.children && !parent.children.includes(objectId)) parent.children.push(objectId);
        this.parentById[objectId] = layerId;
        for (const childId of childIds) {
          const oldParentId = this.parentById[childId];
          const oldParent = oldParentId ? this.nodes[oldParentId] : null;
          if (oldParent?.children) oldParent.children = oldParent.children.filter((id) => id !== childId);
          this.parentById[childId] = objectId;
          if (this.nodes[childId]?.style?.groupId) delete this.nodes[childId].style.groupId;
        }
      }

      const hasLayers = this.rootIds.some((id) => this.nodes[id]?.kind === "layer");
      if (!hasLayers) {
        const oldRootIds = [...this.rootIds];
        this.rootIds = [];
        this.activeLayerId = null;
        const layerId = this.ensureDefaultLayer();
        const layer = this.getLayerNode(layerId);
        layer.children = [];
        for (const id of oldRootIds) {
          const node = this.nodes[id];
          if (!node || node.kind === "layer") continue;
          this.attachNodeToLayer(id, layerId);
        }
      } else {
        this.activeLayerId = serialized.activeLayerId ?? this.getLayerOrderIds()[0] ?? null;
        this.ensureDefaultLayer();
      }

      this.ensureLayerHierarchyIntegrity();
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
        this.attachNodeToLayer(shape.id);
      } else if (shape.type === "face") {
        this.nodes[shape.id] = {
          id: shape.id, kind: "shape", shapeType: "face", localGeom: { points: (shape.pointsWorld ?? []).map((p) => ({ ...p })) },
          nodeTransform: { x: 0, y: 0, rot: 0 }, style: { ...shape }, createdAt: shape.createdAt ?? Date.now(),
        };
        this.attachNodeToLayer(shape.id);
      } else if (shape.type === "fillRegion") {
        this.nodes[shape.id] = {
          id: shape.id, kind: "shape", shapeType: "fillRegion", localGeom: { uvCycle: shape.uvCycle ?? [] },
          nodeTransform: { x: 0, y: 0, rot: 0 }, style: { ...shape }, createdAt: shape.createdAt ?? Date.now(),
        };
        this.attachNodeToLayer(shape.id);
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
        this.attachNodeToLayer(shape.id);
      } else if (shape.type === "group") {
        this.nodes[shape.id] = {
          id: shape.id, kind: "object", name: "Object", transform: { x: 0, y: 0, rot: 0 }, children: [...(shape.childIds ?? [])], createdAt: shape.createdAt ?? Date.now(),
        };
        this.attachNodeToLayer(shape.id);
        for (const childId of (shape.childIds ?? [])) this.parentById[childId] = shape.id;
      }
    }
    this.ensureLayerHierarchyIntegrity();
    this.invalidateDerivedData();
  }
}
