import { BaseTool } from "./baseTool.js";
import { isPointInPolygon } from "../utils/math.js";

function getPolygonZIndex(shape) {
  return Number.isFinite(shape.zIndex) ? shape.zIndex : 0;
}

function isShapeSelectable(shape, layerStore) {
  if (!shape || shape.visible === false || shape.locked === true) {
    return false;
  }

  const layer = layerStore.getLayerById(shape.layerId);
  if (!layer) {
    return false;
  }

  return layer.visible !== false && layer.locked !== true;
}

export class SelectTool extends BaseTool {
  onMouseDown({ worldPoint }) {
    const { shapeStore, layerStore, camera, appState } = this.context;

    shapeStore.clearSelection();

    const shapes = shapeStore.getShapes();
    const polygonsContainingPoint = shapes
      .map((shape, index) => ({ shape, index }))
      .filter(({ shape }) => shape.type === "polygon-shape" && isShapeSelectable(shape, layerStore) && isPointInPolygon(worldPoint, shape.pointsWorld));

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
      .find((shape) => shape.type === "line" && isShapeSelectable(shape, layerStore) && shape.containsPoint(worldPoint, toleranceWorld)) ?? null;

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
