export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
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
    const nextZoom = this.zoom * factor;
    if (!Number.isFinite(nextZoom) || nextZoom <= 0) return;

    const before = this.screenToWorld(screenPoint);
    this.zoom = nextZoom;
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
