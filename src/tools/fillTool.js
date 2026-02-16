import { BaseTool } from "./baseTool.js";

export class FillTool extends BaseTool {
  onMouseDown({ event, screenPoint, worldPoint }) {
    if (event.button !== 0) return;

    const { shapeStore, camera, appState } = this.context;
    const worldFromScreen = camera.screenToWorld(screenPoint);
    const clickWorld = worldPoint ?? worldFromScreen;
    const toleranceWorld = 6 / Math.max(camera.zoom, 0.001);

    const hit = shapeStore.getShapes()
      .map((shape, index) => ({ shape, index }))
      .filter(({ shape }) => shape.type === "polygon" && shape.visible !== false && shape.locked !== true)
      .sort((a, b) => {
        const zDiff = (a.shape.zIndex ?? 0) - (b.shape.zIndex ?? 0);
        if (zDiff !== 0) return zDiff;
        return a.index - b.index;
      })
      .reverse()
      .find(({ shape }) => shape.hitTest?.(clickWorld, toleranceWorld))?.shape ?? null;

    if (appState.debugFillWorkflow) {
      console.debug("[fill-click]", {
        mouseWorld: clickWorld,
        hitPolygonId: hit?.id ?? null,
      });
    }

    if (!hit) return;

    this.context.pushHistoryState?.();
    hit.fillColor = appState.currentStyle.fillColor;
    hit.fillAlpha = 1;
    hit.fillOpacity = 1;
    hit.fillEnabled = hit.fillColor !== "transparent";
  }
}
