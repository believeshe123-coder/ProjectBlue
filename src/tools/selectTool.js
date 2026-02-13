import { BaseTool } from "./baseTool.js";
import { isPointInPolygon } from "../utils/math.js";

function getPolygonZIndex(shape) {
  return Number.isFinite(shape.zIndex) ? shape.zIndex : 0;
}

export class SelectTool extends BaseTool {
  onMouseDown({ worldPoint }) {
    const { shapeStore, camera, appState } = this.context;

    shapeStore.clearSelection();

    const shapes = shapeStore.getShapes();
    const polygonsContainingPoint = shapes
      .map((shape, index) => ({ shape, index }))
      .filter(({ shape }) => shape.type === "polygon-shape" && shape.visible !== false && shape.locked !== true && isPointInPolygon(worldPoint, shape.pointsWorld));

    polygonsContainingPoint.sort((a, b) => {
      const zDiff = getPolygonZIndex(b.shape) - getPolygonZIndex(a.shape);
      if (zDiff !== 0) {
        return zDiff;
      }

      return b.index - a.index;
    });

    const polygonHit = polygonsContainingPoint[0]?.shape ?? null;

    const toleranceWorld = 8 / camera.zoom;
    const lineHit = [...shapes]
      .reverse()
      .find((shape) => shape.type === "line" && shape.visible !== false && shape.locked !== true && shape.containsPoint(worldPoint, toleranceWorld)) ?? null;

    const hit = polygonHit ?? lineHit;

    if (hit) {
      hit.selected = true;
      appState.selected = {
        type: hit.type === "polygon-shape" ? "polygon" : "line",
        id: hit.id,
      };
      return;
    }

    appState.selected = { type: null, id: null };
  }
}
