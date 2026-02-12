import { Line } from "../models/line.js";

function hydrateShape(serialized) {
  if (serialized.type === "line") {
    return new Line(serialized);
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
