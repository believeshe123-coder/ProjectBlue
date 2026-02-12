import { BaseTool } from "./baseTool.js";

export class EraseTool extends BaseTool {
  onMouseDown({ worldPoint }) {
    const { shapeStore, historyStore, camera } = this.context;
    const selectedCount = shapeStore.getSelectedShapes().length;

    if (selectedCount > 0) {
      historyStore.pushState(shapeStore.serialize());
      shapeStore.deleteSelectedShapes();
      return;
    }

    const toleranceWorld = 8 / camera.zoom;
    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld);

    if (hit) {
      historyStore.pushState(shapeStore.serialize());
      shapeStore.removeShape(hit.id);
    }
  }
}
