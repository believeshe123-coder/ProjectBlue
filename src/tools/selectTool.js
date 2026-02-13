import { BaseTool } from "./baseTool.js";

export class SelectTool extends BaseTool {
  onMouseDown({ worldPoint }) {
    const { shapeStore, camera, appState } = this.context;

    shapeStore.clearSelection();

    const toleranceWorld = 8 / camera.zoom;
    const shapes = [...shapeStore.getShapes()].reverse();
    const polygonHit = shapes.find((shape) => shape.type === "polygon-shape" && shape.containsPoint(worldPoint));
    const lineHit = shapes.find((shape) => shape.type !== "polygon-shape" && shape.containsPoint(worldPoint, toleranceWorld));
    const hit = polygonHit ?? lineHit ?? null;

    if (hit) {
      hit.selected = true;
      appState.selectedId = hit.id;
      appState.selectedType = hit.type;
    } else {
      appState.selectedId = null;
      appState.selectedType = null;
    }
  }
}
