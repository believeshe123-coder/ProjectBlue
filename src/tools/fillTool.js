import { BaseTool } from "./baseTool.js";

export class FillTool extends BaseTool {
  onMouseDown({ event, screenPoint, worldPoint }) {
    if (event.button !== 0) return;

    console.log("[FILL] pointerdown reached");

    const { shapeStore, camera, appState } = this.context;
    const worldFromScreen = camera.screenToWorld(screenPoint);
    const clickWorld = worldPoint ?? worldFromScreen;
    const toleranceWorld = 6 / Math.max(camera.zoom, 0.001);

    const polys = shapeStore.getShapes()
      .filter((shape) => shape.type === "polygon" && shape.visible !== false && shape.locked !== true);
    console.log("[FILL] polygons", polys.length);

    const hit = polys
      .map((shape, index) => ({ shape, index }))
      .sort((a, b) => {
        const zDiff = (a.shape.zIndex ?? 0) - (b.shape.zIndex ?? 0);
        if (zDiff !== 0) return zDiff;
        return a.index - b.index;
      })
      .reverse()
      .find(({ shape }) => shape.hitTest?.(clickWorld, toleranceWorld))?.shape ?? null;

    console.log("[FILL] hit", hit ? { id: hit.id, type: hit.type } : "none");

    if (!hit) {
      appState.notifyStatus?.("No closed shape found under cursor", 1700);
      return;
    }

    this.context.pushHistoryState?.();
    hit.fillColor = appState.currentStyle.fillColor;
    hit.fillAlpha = 1;
    hit.fillOpacity = 1;
    hit.fillEnabled = hit.fillColor !== "transparent";
    console.log("[FILL] applied", hit.id);
  }
}
