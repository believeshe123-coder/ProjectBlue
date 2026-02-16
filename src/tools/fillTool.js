import { BaseTool } from "./baseTool.js";
import { isPointInPolygon } from "../utils/math.js";

export class FillTool extends BaseTool {
  onMouseDown({ event, screenPoint }) {
    if (event.button !== 0) return;

    const { shapeStore, camera, appState } = this.context;
    const polys = shapeStore.getPolygons()
      .filter((shape) => shape.visible !== false && shape.locked !== true);
    console.log("[FILL] polygons", polys.length);

    const worldPt = camera.screenToWorld(screenPoint);

    const hit = polys
      .map((shape, index) => ({ shape, index }))
      .sort((a, b) => {
        const zDiff = (a.shape.zIndex ?? 0) - (b.shape.zIndex ?? 0);
        if (zDiff !== 0) return zDiff;
        return a.index - b.index;
      })
      .reverse()
      .find(({ shape }) => isPointInPolygon(worldPt, shape.pointsWorld))?.shape ?? null;

    if (!hit) {
      appState.flashPolygonDebugOutlines = true;
      appState.notifyStatus?.(`No closed shape under cursor (Polygons: ${polys.length}). Use Close Shape.`, 1700);
      return;
    }

    this.context.pushHistoryState?.();
    hit.fillColor = appState.currentStyle.fillColor;
    hit.fillAlpha = 1;
    hit.fillOpacity = 1;
    hit.fillEnabled = hit.fillColor !== "transparent";
    appState.setSelection?.([hit.id], hit.id);
    appState.notifyStatus?.("Filled", 900);
  }
}
