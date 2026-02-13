import { clamp } from "../utils/math.js";

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.minZoom = 0.2;
    this.maxZoom = 6;
    this.viewW = 0;
    this.viewH = 0;
  }

  setViewSize(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
  }

  worldToScreen(point) {
    return {
      x: (point.x - this.x) * this.zoom,
      y: (point.y - this.y) * this.zoom,
    };
  }

  screenToWorld(point) {
    return {
      x: point.x / this.zoom + this.x,
      y: point.y / this.zoom + this.y,
    };
  }

  panBy(screenDx, screenDy) {
    this.x -= screenDx / this.zoom;
    this.y -= screenDy / this.zoom;
  }

  zoomAt(screenPoint, factor) {
    const before = this.screenToWorld(screenPoint);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(screenPoint);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  }

  resetView() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }
}
