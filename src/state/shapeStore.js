import { Line } from "../models/line.js";
import { PolygonShape } from "../models/polygonShape.js";
import { Measurement } from "../models/measurement.js";
import { GroupShape } from "../models/groupShape.js";

function hydrateShape(serialized) {
  if (serialized.type === "line") return new Line(serialized);
  if (serialized.type === "polygon" || serialized.type === "polygon-shape") return PolygonShape.fromJSON(serialized);
  if (serialized.type === "measurement") return new Measurement(serialized);
  if (serialized.type === "group") return new GroupShape(serialized);
  return null;
}

export class ShapeStore {
  constructor() {
    this.shapes = [];
  }

  addShape(shape) {
    this.shapes.push(shape);
    return shape;
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
      .sort((a, b) => {
        const zDiff = (a.shape.zIndex ?? 0) - (b.shape.zIndex ?? 0);
        if (zDiff !== 0) return zDiff;
        return a.index - b.index;
      })
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

    return shape.containsPoint(point, toleranceWorld);
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
    const hitIds = new Set();
    for (const shape of this.shapes) {
      if (shape.visible === false || shape.locked === true) continue;
      const bounds = this.getShapeBounds(shape);
      if (!bounds) continue;
      const intersects = !(bounds.maxX < rect.minX || bounds.minX > rect.maxX || bounds.maxY < rect.minY || bounds.minY > rect.maxY);
      if (!intersects) continue;
      const target = this.resolveSelectionTargetShape(shape);
      if (target) hitIds.add(target.id);
    }
    return [...hitIds].map((id) => this.getShapeById(id)).filter(Boolean);
  }

  getShapes() {
    return this.shapes;
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

  clear() {
    this.shapes.length = 0;
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
  }
}
