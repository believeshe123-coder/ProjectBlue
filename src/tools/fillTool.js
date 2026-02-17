import { BaseTool } from "./baseTool.js";
import { worldToIsoUV } from "../core/isoGrid.js";
import { findSmallestRegionContainingPoint } from "../core/regionBuilder.js";

export class FillTool extends BaseTool {
  pointerDown(payload) {
    this.onMouseDown(payload);
  }

  onMouseDown({ event, screenPoint, worldPoint }) {
    if (event.button !== 0) return;

    const { shapeStore, camera, appState } = this.context;
    if (!appState.enableFill) {
      appState.notifyStatus?.("Fill is disabled in stability mode", 1500);
      return;
    }

    const worldPt = worldPoint ?? camera.screenToWorld(screenPoint);
    console.log("[FILL] pointerDown reached", { worldPt, zoom: camera.zoom });

    const regions = shapeStore.getComputedRegions();
    console.log("[FILL] regions", shapeStore.getRegions?.()?.length ?? shapeStore.regions?.length ?? regions.length);

    const clickUv = worldToIsoUV(worldPt);
    const hit = findSmallestRegionContainingPoint(regions, clickUv);
    console.log("[FILL] hit", hit?.id ?? null, hit?.area ?? null);

    if (!hit) {
      appState.notifyStatus?.("No closed region under cursor", 1500);
      return;
    }

    this.context.pushHistoryState?.();
    const fill = shapeStore.upsertFillRegion(hit, {
      color: appState.currentStyle.fillColor,
      alpha: appState.currentStyle.fillOpacity ?? 1,
    });

    appState.setSelection?.(fill ? [fill.id] : [], fill?.id ?? null);
    appState.notifyStatus?.("Region filled", 900);
  }
}
