import { BaseTool } from "./baseTool.js";
import { worldToIsoUV } from "../core/isoGrid.js";
import { findSmallestRegionContainingPoint } from "../core/regionBuilder.js";

export class FillTool extends BaseTool {
  onMouseDown({ event, screenPoint }) {
    if (event.button !== 0) return;

    const { shapeStore, camera, appState } = this.context;
    if (appState.stabilityMode) {
      appState.notifyStatus?.("Disabled in stability mode", 1500);
      return;
    }
    const worldPt = camera.screenToWorld(screenPoint);
    const clickUv = worldToIsoUV(worldPt);
    const regions = shapeStore.getComputedRegions();
    const hitRegion = findSmallestRegionContainingPoint(regions, clickUv);

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
