import { BaseTool } from "./baseTool.js";

export class FillTool extends BaseTool {
  onMouseDown({ event, worldPoint }) {
    if (event.button !== 0) return;

    const { shapeStore, camera, appState } = this.context;
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
      .find(({ shape }) => shape.hitTest?.(worldPoint, toleranceWorld))?.shape ?? null;

    if (!hit) {
      const lineHint = shapeStore.getShapes().some((shape) => shape.type === "line" && shape.visible !== false && shape.containsPoint(worldPoint, toleranceWorld));
      if (lineHint) appState.notifyStatus?.("Close the loop to fill (use Close Shape)", 1600);
      return;
    }

    this.context.pushHistoryState?.();
    hit.fillColor = appState.currentStyle.fillColor;
    hit.fillAlpha = Number.isFinite(appState.currentStyle.fillOpacity)
      ? Math.max(0, Math.min(1, appState.currentStyle.fillOpacity))
      : 1;
    hit.fillOpacity = hit.fillAlpha;
    hit.fillEnabled = hit.fillAlpha > 0 && hit.fillColor !== "transparent";
  }
}
