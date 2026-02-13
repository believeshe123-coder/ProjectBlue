import { Line } from "../models/line.js";
import { PolygonShape } from "../models/polygonShape.js";
import { Measurement } from "../models/measurement.js";

function hydrateShape(serialized) {
  if (serialized.type === "line") {
    return new Line(serialized);
  }

  if (serialized.type === "polygon-shape") {
    return PolygonShape.fromJSON(serialized);
  }

  if (serialized.type === "polygon") {
    return new PolygonShape({
      ...serialized,
      pointsWorld: serialized.points ?? serialized.pointsWorld ?? [],
      fillAlpha: serialized.fillOpacity ?? serialized.fillAlpha ?? 1,
    });
  }

  if (serialized.type === "measurement") {
    return new Measurement(serialized);
  }

  if (serialized.type === "fill-region") {
    return new PolygonShape({
      ...serialized,
      pointsWorld: serialized.points ?? [],
      fillAlpha: serialized.fillOpacity ?? serialized.fillAlpha ?? 1,
    });
  }

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
    if (index === -1) {
      return false;
    }
    this.shapes.splice(index, 1);
    return true;
  }

  clearSelection() {
    for (const shape of this.shapes) {
      shape.selected = false;
    }
  }

  getSelectedShapes() {
    return this.shapes.filter((shape) => shape.selected);
  }

  deleteSelectedShapes() {
    const selectedIds = new Set(this.getSelectedShapes().map((shape) => shape.id));
    const before = this.shapes.length;
    this.shapes = this.shapes.filter((shape) => !selectedIds.has(shape.id));
    return before - this.shapes.length;
  }

  getTopmostHitShape(point, toleranceWorld = 6, { includeLocked = false } = {}) {
    return [...this.shapes]
      .reverse()
      .find((shape) => shape.visible !== false && (includeLocked || shape.locked !== true) && shape.containsPoint(point, toleranceWorld)) ?? null;
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
