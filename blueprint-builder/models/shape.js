let shapeCounter = 0;

export class Shape {
  constructor({ id, type, layerId, strokeColor, fillColor, strokeWidth = 1, opacity = 1, selected = false }) {
    this.id = id ?? `shape_${shapeCounter++}`;
    this.type = type ?? "shape";
    this.layerId = layerId;
    this.strokeColor = strokeColor ?? "#ffffff";
    this.fillColor = fillColor ?? "transparent";
    this.strokeWidth = strokeWidth;
    this.opacity = opacity;
    this.selected = selected;
  }

  draw(_ctx, _camera) {
    throw new Error("Shape.draw must be implemented by subclasses.");
  }

  containsPoint(_point) {
    return false;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      layerId: this.layerId,
      strokeColor: this.strokeColor,
      fillColor: this.fillColor,
      strokeWidth: this.strokeWidth,
      opacity: this.opacity,
      selected: this.selected,
    };
  }
}
