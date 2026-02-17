import { Line } from "../models/line.js";
import { PolygonShape } from "../models/polygonShape.js";
import { Measurement } from "../models/measurement.js";
import { GroupShape } from "../models/groupShape.js";
import { FillRegion } from "../models/fillRegion.js";
import { FaceShape } from "../models/faceShape.js";
import { buildRegionsFromLines } from "../core/regionBuilder.js";
import { isoUVToWorld } from "../core/isoGrid.js";

function normalizeRect(rect) {
  if (!rect) return null;
  return {
    minX: Math.min(rect.minX, rect.maxX),
    minY: Math.min(rect.minY, rect.maxY),
    maxX: Math.max(rect.minX, rect.maxX),
    maxY: Math.max(rect.minY, rect.maxY),
  };
}

function isPointInRect(point, rect) {
  if (!point || !rect) return false;
  return point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY;
}

function rectsIntersect(a, b) {
  if (!a || !b) return false;
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

function regionCentroid(uvCycle = []) {
  if (!Array.isArray(uvCycle) || uvCycle.length < 3) return null;
  const worldPoints = uvCycle.map((point) => isoUVToWorld(point.u, point.v));
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < worldPoints.length; i += 1) {
    const a = worldPoints[i];
    const b = worldPoints[(i + 1) % worldPoints.length];
    const cross = (a.x * b.y) - (b.x * a.y);
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }

  if (Math.abs(twiceArea) < 1e-9) {
    const avg = worldPoints.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    return { x: avg.x / worldPoints.length, y: avg.y / worldPoints.length };
  }

  return {
    x: cx / (3 * twiceArea),
    y: cy / (3 * twiceArea),
  };
}


function compareShapeZOrder(a, b, indexA = 0, indexB = 0) {
  const zDiff = (a?.zIndex ?? 0) - (b?.zIndex ?? 0);
  if (zDiff !== 0) return zDiff;
  const createdDiff = (a?.createdAt ?? 0) - (b?.createdAt ?? 0);
  if (createdDiff !== 0) return createdDiff;
  const idA = String(a?.id ?? "");
  const idB = String(b?.id ?? "");
  if (idA !== idB) return idA.localeCompare(idB);
  return indexA - indexB;
}

function hydrateShape(serialized) {
  if (serialized.type === "line") return new Line(serialized);
  if (serialized.type === "polygon" || serialized.type === "polygon-shape") return PolygonShape.fromJSON(serialized);
  if (serialized.type === "measurement") return new Measurement(serialized);
  if (serialized.type === "group") return new GroupShape(serialized);
  if (serialized.type === "fillRegion") return FillRegion.fromJSON(serialized);
  if (serialized.type === "face") return FaceShape.fromJSON(serialized);
  return null;
}

export class ShapeStore {
  constructor() {
    this.shapes = [];
    this.cachedRegions = [];
    this.cachedRegionDebug = { totalEdges: 0, totalVertices: 0, totalRegions: 0, outerArea: 0 };
    this.cachedLinesHash = "";
  }

  invalidateDerivedData() {
    this.cachedLinesHash = "";
  }

  getLinesHash() {
    const lines = this.shapes.filter((shape) => shape.type === "line");
    return lines
      .map((line) => {
        const a = `${line.startUV.u},${line.startUV.v}`;
        const b = `${line.endUV.u},${line.endUV.v}`;
        return a < b ? `${a}|${b}` : `${b}|${a}`;
      })
      .sort()
      .join(";");
  }

  getComputedRegions() {
    const nextHash = this.getLinesHash();
    if (nextHash === this.cachedLinesHash) return this.cachedRegions;

    const lines = this.shapes.filter((shape) => shape.type === "line" && shape.visible !== false);
    const regionResult = buildRegionsFromLines(lines);
    this.cachedRegions = regionResult.boundedFaces;
    this.cachedRegionDebug = regionResult.debug;
    this.cachedLinesHash = nextHash;
    console.log("[RegionBuilder]", {
      totalEdges: this.cachedRegionDebug.totalEdges,
      totalVertices: this.cachedRegionDebug.totalVertices,
      totalRegions: this.cachedRegionDebug.totalRegions,
      outerArea: this.cachedRegionDebug.outerArea,
    });

    const regionById = new Map(this.cachedRegions.map((region) => [region.id, region]));
    this.shapes = this.shapes.filter((shape) => {
      if (shape.type !== "fillRegion") return true;
      const region = regionById.get(shape.regionId);
      if (!region) return false;
      shape.setRegionCycle(region.uvCycle);
      return true;
    });

    return this.cachedRegions;
  }

  getRegionDebugStats() {
    this.getComputedRegions();
    return this.cachedRegionDebug;
  }

  addShape(shape) {
    this.shapes.push(shape);
    this.invalidateDerivedData();
    return shape;
  }

  upsertFillRegion(region, { color, alpha }) {
    if (!region?.id) return null;

    const existing = this.shapes.find((shape) => shape.type === "fillRegion" && shape.regionId === region.id);
    if (existing) {
      existing.color = color;
      existing.alpha = alpha;
      existing.fillColor = color;
      existing.fillOpacity = alpha;
      existing.setRegionCycle(region.uvCycle);
      return existing;
    }

    const fill = new FillRegion({
      regionId: region.id,
      uvCycle: region.uvCycle,
      color,
      alpha,
    });
    this.shapes.push(fill);
    return fill;
  }

  getFillRegions() {
    return this.shapes.filter((shape) => shape.type === "fillRegion");
  }

  removeShape(id) {
    const shape = this.getShapeById(id);
    if (!shape) return false;

    if (shape.type === "group") {
      for (const childId of shape.childIds) {
        const child = this.getShapeById(childId);
        if (child) child.groupId = null;
      }
    } else if (shape.groupId) {
      const group = this.getShapeById(shape.groupId);
      if (group?.type === "group") {
        group.childIds = group.childIds.filter((childId) => childId !== shape.id);
      }
      shape.groupId = null;
    }

    const index = this.shapes.findIndex((entry) => entry.id === id);
    if (index === -1) return false;
    this.shapes.splice(index, 1);

    this.normalizeGroups();
    this.invalidateDerivedData();
    return true;
  }

  clearAllGroups() {
    for (const shape of this.shapes) {
      if (shape.type !== "group") shape.groupId = null;
    }
    this.shapes = this.shapes.filter((shape) => shape.type !== "group");
  }

  getShapeById(id) {
    return this.shapes.find((shape) => shape.id === id) ?? null;
  }

  clearSelection() {
    for (const shape of this.shapes) shape.selected = false;
  }

  getOwningGroupId(shapeId) {
    const shape = this.getShapeById(shapeId);
    if (!shape || shape.type === "group") return shape?.id ?? null;
    if (!shape.groupId) return null;
    const group = this.getShapeById(shape.groupId);
    return group?.type === "group" ? group.id : null;
  }

  getSelectionTargetId(shapeId) {
    const shape = this.getShapeById(shapeId);
    if (!shape) return null;
    if (shape.type === "group") return shape.id;
    return this.getOwningGroupId(shape.id) ?? shape.id;
  }

  resolveSelectionTargetShape(shape) {
    if (!shape) return null;
    if (shape.type === "group") return shape;
    if (!shape.groupId) return shape;
    const group = this.getShapeById(shape.groupId);
    return group?.type === "group" ? group : shape;
  }

  getTopmostHitShape(point, toleranceWorld = 6, { includeLocked = false } = {}) {
    const sorted = this.shapes
      .map((shape, index) => ({ shape, index }))
      .filter(({ shape }) => {
        if (!includeLocked && shape.locked === true) return false;
        return shape.visible !== false;
      })
      .sort((a, b) => compareShapeZOrder(a.shape, b.shape, a.index, b.index))
      .reverse();

    for (const { shape } of sorted) {
      if (!this.shapeContainsPoint(shape, point, toleranceWorld)) continue;
      if (shape.type === "group") return shape;
      if (shape.groupId) {
        const group = this.getShapeById(shape.groupId);
        if (group?.type === "group") return group;
      }
      return shape;
    }

    return null;
  }

  shapeContainsPoint(shape, point, toleranceWorld = 6) {
    if (shape.type === "group") {
      const bounds = this.getShapeBounds(shape);
      if (!bounds) return false;
      return point.x >= bounds.minX - toleranceWorld
        && point.x <= bounds.maxX + toleranceWorld
        && point.y >= bounds.minY - toleranceWorld
        && point.y <= bounds.maxY + toleranceWorld;
    }

    return shape.containsPoint?.(point, toleranceWorld) ?? false;
  }

  getShapeBounds(shape) {
    if (!shape) return null;

    if (shape.type === "line") {
      return {
        minX: Math.min(shape.start.x, shape.end.x),
        minY: Math.min(shape.start.y, shape.end.y),
        maxX: Math.max(shape.start.x, shape.end.x),
        maxY: Math.max(shape.start.y, shape.end.y),
      };
    }

    if (shape.type === "polygon") {
      return shape.getBounds();
    }

    if (shape.type === "face") {
      return shape.getBounds?.() ?? null;
    }

    if (shape.type === "fillRegion") {
      return shape.bounds ?? null;
    }

    if (shape.type === "group") {
      const memberBounds = shape.childIds
        .map((id) => this.getShapeBounds(this.getShapeById(id)))
        .filter(Boolean);
      if (!memberBounds.length) return null;
      return {
        minX: Math.min(...memberBounds.map((b) => b.minX)),
        minY: Math.min(...memberBounds.map((b) => b.minY)),
        maxX: Math.max(...memberBounds.map((b) => b.maxX)),
        maxY: Math.max(...memberBounds.map((b) => b.maxY)),
      };
    }

    return null;
  }

  getShapesIntersectingRect(rect) {
    const normalizedRect = normalizeRect(rect);
    if (!normalizedRect) return [];
    const hitIds = new Set();
    for (const shape of this.shapes) {
      if (shape.visible === false || shape.locked === true) continue;
      const bounds = this.getShapeBounds(shape);
      if (!bounds) continue;
      const intersects = rectsIntersect(bounds, normalizedRect);
      if (!intersects) continue;
      const target = this.resolveSelectionTargetShape(shape);
      if (target) hitIds.add(target.id);
    }
    return [...hitIds].map((id) => this.getShapeById(id)).filter(Boolean);
  }

  getSelectionBoundsFromIds(selectionIds = []) {
    const targets = this.getShapeTargetsForMove(selectionIds);
    const bounds = targets
      .map((shape) => this.getShapeBounds(shape))
      .filter(Boolean);
    if (!bounds.length) return null;
    return {
      minX: Math.min(...bounds.map((entry) => entry.minX)),
      minY: Math.min(...bounds.map((entry) => entry.minY)),
      maxX: Math.max(...bounds.map((entry) => entry.maxX)),
      maxY: Math.max(...bounds.map((entry) => entry.maxY)),
    };
  }


  getFilledRegionCountInBounds(rect) {
    const normalizedRect = normalizeRect(rect);
    if (!normalizedRect) return 0;

    const fillsByRegionId = new Map(
      this.shapes
        .filter((shape) => shape.type === "fillRegion")
        .map((shape) => [shape.regionId, shape]),
    );

    let count = 0;
    const regions = this.getComputedRegions();
    for (const region of regions) {
      const fill = fillsByRegionId.get(region.id);
      if (!fill?.uvCycle?.length) continue;
      const centroidWorld = regionCentroid(region.uvCycle);
      if (isPointInRect(centroidWorld, normalizedRect)) count += 1;
    }
    return count;
  }

  captureFilledRegionsAsFacesInBounds(rect, { zIndexBase = 0 } = {}) {
    const normalizedRect = normalizeRect(rect);
    if (!normalizedRect) return [];

    const fillsByRegionId = new Map(
      this.shapes
        .filter((shape) => shape.type === "fillRegion")
        .map((shape) => [shape.regionId, shape]),
    );

    const regions = this.getComputedRegions();
    const capturedFaceIds = [];
    let faceOffset = 0;

    for (const region of regions) {
      const fill = fillsByRegionId.get(region.id);
      if (!fill?.uvCycle?.length) continue;
      const centroidWorld = regionCentroid(region.uvCycle);
      if (!isPointInRect(centroidWorld, normalizedRect)) continue;

      const pointsWorld = region.uvCycle.map((point) => isoUVToWorld(point.u, point.v));
      const existing = this.shapes.find((shape) => (
        shape.type === "face"
        && shape.sourceRegionKey === region.id
        && Array.isArray(shape.pointsWorld)
        && shape.pointsWorld.length === pointsWorld.length
      ));

      if (existing) {
        capturedFaceIds.push(existing.id);
        continue;
      }

      const face = new FaceShape({
        pointsWorld,
        fillColor: fill.color ?? fill.fillColor ?? "#4aa3ff",
        fillAlpha: fill.alpha ?? fill.fillOpacity ?? 1,
        sourceRegionKey: region.id,
        zIndex: zIndexBase + faceOffset,
      });
      faceOffset += 1;
      this.addShape(face);
      capturedFaceIds.push(face.id);
    }

    return capturedFaceIds;
  }

  getShapes() {
    return this.shapes;
  }

  getPolygons() {
    return this.shapes.filter((shape) => shape.type === "polygon");
  }

  getShapeTargetsForMove(ids = []) {
    const targetIds = new Set();
    for (const id of ids) {
      const shape = this.getShapeById(id);
      if (!shape) continue;
      if (shape.type === "group") {
        targetIds.add(shape.id);
        continue;
      }
      if (shape.groupId) {
        const group = this.getShapeById(shape.groupId);
        if (group?.type === "group") {
          targetIds.add(group.id);
          continue;
        }
      }
      targetIds.add(shape.id);
    }
    return [...targetIds].map((id) => this.getShapeById(id)).filter(Boolean);
  }

  getRenderableShapesSorted() {
    return this.shapes
      .map((shape, index) => ({ shape, index }))
      .filter(({ shape }) => shape.type !== "group")
      .sort((a, b) => compareShapeZOrder(a.shape, b.shape, a.index, b.index))
      .map(({ shape }) => shape);
  }

  getExpandedSelectionShapeIds(selectionIds = []) {
    const selected = new Set();
    for (const id of selectionIds) {
      const shape = this.getShapeById(id);
      if (!shape) continue;
      if (shape.type === "group") {
        for (const childId of shape.childIds) selected.add(childId);
        continue;
      }
      if (shape.groupId) {
        const group = this.getShapeById(shape.groupId);
        if (group?.type === "group") {
          for (const childId of group.childIds) selected.add(childId);
          continue;
        }
      }
      selected.add(shape.id);
    }
    return selected;
  }

  getZOrderBlocks(selectionIds = []) {
    const ordered = this.getRenderableShapesSorted();
    const selected = this.getExpandedSelectionShapeIds(selectionIds);
    const orderedIndex = new Map(ordered.map((shape, index) => [shape.id, index]));
    const visited = new Set();
    const blocks = [];

    for (const shape of ordered) {
      if (visited.has(shape.id)) continue;

      if (shape.groupId) {
        const group = this.getShapeById(shape.groupId);
        if (group?.type === "group") {
          const memberIds = group.childIds
            .filter((id) => orderedIndex.has(id))
            .sort((a, b) => orderedIndex.get(a) - orderedIndex.get(b));
          if (memberIds.length) {
            memberIds.forEach((id) => visited.add(id));
            blocks.push({
              ids: memberIds,
              selected: memberIds.some((id) => selected.has(id)),
              groupId: group.id,
            });
            continue;
          }
        }
      }

      visited.add(shape.id);
      blocks.push({ ids: [shape.id], selected: selected.has(shape.id), groupId: null });
    }

    return blocks;
  }

  applyBlockOrder(blocks = []) {
    const orderedIds = blocks.flatMap((block) => block.ids);
    const idToShape = new Map(this.shapes.map((shape) => [shape.id, shape]));

    orderedIds.forEach((id, index) => {
      const shape = idToShape.get(id);
      if (shape) shape.zIndex = index;
    });

    for (const shape of this.shapes) {
      if (shape.type !== "group") continue;
      const childShapes = shape.childIds.map((id) => idToShape.get(id)).filter(Boolean);
      if (childShapes.length) {
        shape.zIndex = Math.min(...childShapes.map((child) => child.zIndex ?? 0));
      }
    }
  }

  reorderSelectionZ(selectionIds = [], mode = "front") {
    const blocks = this.getZOrderBlocks(selectionIds);
    const selectedBlocks = blocks.filter((block) => block.selected);
    if (!selectedBlocks.length) return false;

    const firstSelectedIndex = blocks.findIndex((block) => block.selected);
    const lastSelectedIndex = blocks.length - 1 - [...blocks].reverse().findIndex((block) => block.selected);
    const unselectedBlocks = blocks.filter((block) => !block.selected);
    let nextBlocks = null;

    if (mode === "front") {
      if (lastSelectedIndex === blocks.length - 1) return false;
      nextBlocks = [...unselectedBlocks, ...selectedBlocks];
    } else if (mode === "back") {
      if (firstSelectedIndex === 0) return false;
      nextBlocks = [...selectedBlocks, ...unselectedBlocks];
    } else if (mode === "forward") {
      const neighbor = blocks.slice(lastSelectedIndex + 1).find((block) => !block.selected);
      if (!neighbor) return false;
      const neighborIndex = unselectedBlocks.indexOf(neighbor);
      nextBlocks = [
        ...unselectedBlocks.slice(0, neighborIndex + 1),
        ...selectedBlocks,
        ...unselectedBlocks.slice(neighborIndex + 1),
      ];
    } else if (mode === "backward") {
      const candidates = blocks.slice(0, firstSelectedIndex).filter((block) => !block.selected);
      const neighbor = candidates[candidates.length - 1];
      if (!neighbor) return false;
      const neighborIndex = unselectedBlocks.indexOf(neighbor);
      nextBlocks = [
        ...unselectedBlocks.slice(0, neighborIndex),
        ...selectedBlocks,
        ...unselectedBlocks.slice(neighborIndex),
      ];
    } else {
      return false;
    }

    this.applyBlockOrder(nextBlocks);
    return true;
  }

  clear() {
    this.shapes.length = 0;
    this.invalidateDerivedData();
  }

  serialize() {
    return this.shapes.map((shape) => shape.toJSON());
  }

  normalizeGroups() {
    const shapeById = new Map(this.shapes.map((shape) => [shape.id, shape]));

    for (const shape of this.shapes) {
      if (shape.type === "group") continue;
      if (shape.groupId) {
        const group = shapeById.get(shape.groupId);
        if (!group || group.type !== "group") {
          shape.groupId = null;
        }
      }
    }

    for (const shape of this.shapes) {
      if (shape.type !== "group") continue;
      const cleaned = [];
      for (const childId of shape.childIds) {
        const child = shapeById.get(childId);
        if (!child || child.type === "group") continue;
        child.groupId = shape.id;
        cleaned.push(childId);
      }
      shape.childIds = [...new Set(cleaned)];
    }

    this.shapes = this.shapes.filter((shape) => shape.type !== "group" || shape.childIds.length >= 2);
  }

  replaceFromSerialized(serializedShapes) {
    this.shapes = serializedShapes.map(hydrateShape).filter(Boolean);
    this.normalizeGroups();
    this.invalidateDerivedData();
    this.getComputedRegions();
  }
}
