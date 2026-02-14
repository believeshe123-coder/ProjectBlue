import { Line } from "../models/line.js";
import { PolygonShape } from "../models/polygonShape.js";
import { Measurement } from "../models/measurement.js";
import { GroupShape } from "../models/groupShape.js";

function hydrateShape(serialized) {
  if (serialized.type === "line") return new Line(serialized);
  if (serialized.type === "polygon-shape") return PolygonShape.fromJSON(serialized);
  if (serialized.type === "polygon") {
    return new PolygonShape({
      ...serialized,
      pointsWorld: serialized.points ?? serialized.pointsWorld ?? [],
      fillAlpha: serialized.fillOpacity ?? serialized.fillAlpha ?? 1,
    });
  }
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
    const index = this.shapes.findIndex((shape) => shape.id === id);
    if (index === -1) return false;
    this.shapes.splice(index, 1);
    return true;
  }

  getShapeById(id) {
    return this.shapes.find((shape) => shape.id === id) ?? null;
  }

  clearSelection() {
    for (const shape of this.shapes) shape.selected = false;
  }

  getTopmostHitShape(point, toleranceWorld = 6, { includeLocked = false } = {}) {
    return this.shapes
      .map((shape, index) => ({ shape, index }))
      .filter(({ shape }) => {
        if (!includeLocked && shape.locked === true) return false;
        if (shape.parentGroupId) return false;
        return shape.visible !== false;
      })
      .sort((a, b) => {
        const zDiff = (a.shape.zIndex ?? 0) - (b.shape.zIndex ?? 0);
        if (zDiff !== 0) return zDiff;
        return a.index - b.index;
      })
      .reverse()
      .find(({ shape }) => this.shapeContainsPoint(shape, point, toleranceWorld))?.shape ?? null;
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

    if (shape.type === "polygon-shape") {
      return shape.getBounds();
    }

    if (shape.type === "group") {
      const memberBounds = shape.memberIds
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
    return this.shapes.filter((shape) => {
      if (shape.visible === false || shape.locked === true || shape.parentGroupId) return false;
      const bounds = this.getShapeBounds(shape);
      if (!bounds) return false;
      return !(bounds.maxX < rect.minX || bounds.minX > rect.maxX || bounds.maxY < rect.minY || bounds.minY > rect.maxY);
    });
  }

  getShapes() {
    return this.shapes;
  }

  clear() {
    this.shapes.length = 0;
  }

  serialize() {
    return this.shapes.map((shape) => shape.toJSON());
  }

  replaceFromSerialized(serializedShapes) {
    this.shapes = serializedShapes.map(hydrateShape).filter(Boolean);
  }
}
