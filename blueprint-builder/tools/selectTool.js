import { BaseTool } from "./baseTool.js";

export class SelectTool extends BaseTool {
  onMouseDown({ worldPoint }) {
    const { shapeStore, camera } = this.context;
    const shapes = shapeStore.getShapes();

    for (const shape of shapes) {
      shape.selected = false;
    }

    const toleranceWorld = 8 / camera.zoom;
    const hitPoint = { x: worldPoint.x, y: worldPoint.y + toleranceWorld / 2 };
    const hit = [...shapes].reverse().find((shape) => shape.containsPoint(hitPoint));
    if (hit) {
      hit.selected = true;
    }
  }
}
