let shapeCounter = 0;

export class Shape {
  constructor({
    id,
    type,
    strokeColor,
    fillColor,
    strokeWidth = 1,
    opacity,
    strokeOpacity,
    fillOpacity,
    fillEnabled,
    pinnedMeasure = false,
    visible = true,
    locked = false,
    zIndex = 0,
    createdAt,
    selected = false,
    groupId = null,
  }) {
    this.id = id ?? `shape_${shapeCounter++}`;
    this.type = type ?? "shape";
    this.strokeColor = strokeColor ?? "#ffffff";
    this.fillColor = fillColor ?? "transparent";
    this.strokeWidth = strokeWidth;
    const normalizedOpacity = opacity ?? 1;
    this.strokeOpacity = strokeOpacity ?? normalizedOpacity;
    this.fillOpacity = fillOpacity ?? normalizedOpacity;
    this.fillEnabled = fillEnabled ?? this.fillColor !== "transparent";
    this.opacity = normalizedOpacity;
    this.pinnedMeasure = pinnedMeasure;
    this.visible = visible;
    this.locked = locked;
    this.zIndex = Number.isFinite(zIndex) ? zIndex : 0;
    this.createdAt = Number.isFinite(createdAt) ? createdAt : Date.now();
    this.selected = selected;
    this.groupId = groupId ?? null;
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
      strokeColor: this.strokeColor,
      fillColor: this.fillColor,
      strokeWidth: this.strokeWidth,
      opacity: this.opacity,
      strokeOpacity: this.strokeOpacity,
      fillOpacity: this.fillOpacity,
      fillEnabled: this.fillEnabled,
      pinnedMeasure: this.pinnedMeasure,
      visible: this.visible,
      locked: this.locked,
      zIndex: this.zIndex,
      createdAt: this.createdAt,
      selected: this.selected,
      groupId: this.groupId,
    };
  }
}
