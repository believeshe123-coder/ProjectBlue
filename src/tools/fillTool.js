import { BaseTool } from "./baseTool.js";
import { worldToIsoUV } from "../core/isoGrid.js";
import { findSmallestRegionContainingPoint } from "../core/regionBuilder.js";

export class FillTool extends BaseTool {
  pointerDown(payload) {
    this.onMouseDown(payload);
  }

  onMouseDown({ event, screenPoint }) {
    if (event.button !== 0) return;

    const { shapeStore, camera, appState } = this.context;
    if (!appState.enableFill) {
      appState.notifyStatus?.("Fill is disabled", 1500);
      return;
    }
    const worldPt = camera.screenToWorld(screenPoint);
    console.log("[FILL] pointerDown reached", { worldPt, zoom: camera.zoom });
    const clickUv = worldToIsoUV(worldPt);
    const regions = shapeStore.getComputedRegions();
    console.log(
      "[FILL] regions available",
      shapeStore.getRegions?.()?.length ?? shapeStore.regions?.length,
      shapeStore.debug?.regions,
    );
    const hitRegion = findSmallestRegionContainingPoint(regions, clickUv);
    console.log("[FILL] hitRegion", hitRegion?.id ?? null, "area", hitRegion?.area);

    if (!hitRegion) {
      appState.notifyStatus?.("No closed region under cursor", 1500);
      return;
    }

    this.context.pushHistoryState?.();
    const fill = shapeStore.upsertFillRegion(hitRegion, {
      color: appState.currentStyle.fillColor,
      alpha: appState.currentStyle.fillOpacity ?? 1,
    });

    appState.setSelection?.(fill ? [fill.id] : [], fill?.id ?? null);
    appState.notifyStatus?.("Region filled", 900);
  }
}
