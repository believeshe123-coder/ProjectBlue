import { BaseTool } from "./baseTool.js";

export class SelectTool extends BaseTool {
  onMouseDown({ worldPoint }) {
    const { shapeStore, camera } = this.context;

    shapeStore.clearSelection();

    const toleranceWorld = 8 / camera.zoom;
    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld);
    if (hit) {
      hit.selected = true;
    }
  }
}
