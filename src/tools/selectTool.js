import { BaseTool } from "./baseTool.js";

export class SelectTool extends BaseTool {
  onMouseDown({ worldPoint }) {
    const { shapeStore, layerStore, camera, appState } = this.context;
    shapeStore.clearSelection();

    const toleranceWorld = 8 / camera.zoom;
    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false, layerStore });

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
