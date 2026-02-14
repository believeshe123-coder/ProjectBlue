import { Shape } from "./shape.js";

export class GroupShape extends Shape {
  constructor({ id, childIds = [], memberIds = [], fillColor, ...rest }) {
    super({
      id,
      ...rest,
      type: "group",
      fillColor: fillColor ?? "#4aa3ff",
      fillEnabled: false,
      fillOpacity: 0,
      groupId: null,
    });
    const normalized = Array.isArray(childIds) ? childIds : memberIds;
    this.childIds = Array.isArray(normalized) ? [...normalized] : [];
  }

  draw(_ctx, _camera, _appState = {}) {}

  drawSelectionOverlay(ctx, camera, appState = {}) {
    if (!this.selected) return;
    const shapeStore = appState.shapeStore;
    if (!shapeStore) return;
    const bounds = shapeStore.getShapeBounds(this);
    if (!bounds) return;
    const min = camera.worldToScreen({ x: bounds.minX, y: bounds.minY });
    const max = camera.worldToScreen({ x: bounds.maxX, y: bounds.maxY });
    ctx.save();
    ctx.strokeStyle = "#ffd166";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(min.x, min.y, max.x - min.x, max.y - min.y);
    ctx.restore();
  }

  containsPoint(_point, _toleranceWorld = 0) {
    return false;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      childIds: [...this.childIds],
    };
  }
}
