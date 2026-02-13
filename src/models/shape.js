let shapeCounter = 0;

export class Shape {
  constructor({
    id,
    type,
    layerId,
    strokeColor,
    fillColor,
    strokeWidth = 1,
    opacity,
    strokeOpacity,
    fillOpacity,
    fillEnabled,
    selected = false,
  }) {
    this.id = id ?? `shape_${shapeCounter++}`;
    this.type = type ?? "shape";
    this.layerId = layerId;
    this.strokeColor = strokeColor ?? "#ffffff";
    this.fillColor = fillColor ?? "transparent";
    this.strokeWidth = strokeWidth;
    const normalizedOpacity = opacity ?? 1;
    this.strokeOpacity = strokeOpacity ?? normalizedOpacity;
    this.fillOpacity = fillOpacity ?? normalizedOpacity;
    this.fillEnabled = fillEnabled ?? this.fillColor !== "transparent";
    this.opacity = normalizedOpacity;
    this.selected = selected;
  }

  draw(_ctx, _camera) {
    throw new Error("Shape.draw must be implemented by subclasses.");
  }

  containsPoint(_point, _toleranceWorld = 0) {
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
      strokeOpacity: this.strokeOpacity,
      fillOpacity: this.fillOpacity,
      fillEnabled: this.fillEnabled,
      selected: this.selected,
    };
  }
}
