import { BaseTool } from "./baseTool.js";

export class SelectTool extends BaseTool {
  onMouseDown({ worldPoint }) {
    const { shapeStore, camera, appState } = this.context;
    shapeStore.clearSelection();

    const toleranceWorld = 8 / camera.zoom;
    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false });

    if (!hit) {
      appState.selected = { type: null, id: null };
      return;
    }

    hit.selected = true;
    appState.selected = {
      type: hit.type === "polygon-shape" ? "polygon" : hit.type,
      id: hit.id,
    };
  }
}
