import { BaseTool } from "./baseTool.js";
import { worldToIsoUV } from "../core/isoGrid.js";
import { findSmallestRegionContainingPoint } from "../core/regionBuilder.js";
import { ensureActiveLayerWritable } from "./toolUtils.js";

export class FillTool extends BaseTool {
  onActivate() {
    this.context.appState.previewShape = null;
  }

  onDeactivate() {
    this.context.appState.previewShape = null;
  }

  onKeyDown(event) {
    if (event.key === "Escape") this.context.appState.previewShape = null;
  }

  pointerDown(payload) {
    this.onMouseDown(payload);
  }

  onMouseDown({ event, screenPoint, worldPoint }) {
    if (event.button !== 0) return;

    const { shapeStore, camera, appState } = this.context;
    if (!ensureActiveLayerWritable(this.context)) return;
    if (!appState.enableFill) {
      appState.notifyStatus?.("Fill is disabled in stability mode", 1500);
      return;
    }

    const worldPt = worldPoint ?? camera.screenToWorld(screenPoint);
    console.log("[FILL] pointerDown reached", { worldPt, zoom: camera.zoom });

    const toleranceWorld = 8 / camera.zoom;
    const polygonHit = shapeStore.getTopmostHitShape(worldPt, toleranceWorld, {
      includeLocked: false,
      allowedTypes: ["polygon"],
    });
    if (polygonHit?.type === "polygon") {
      this.context.pushHistoryState?.();
      const convertedFace = shapeStore.convertPolygonToFace?.(polygonHit.id, {
        color: appState.currentStyle.fillColor,
        alpha: appState.currentStyle.fillOpacity ?? 1,
      });
      appState.setSelection?.(convertedFace ? [convertedFace.id] : [], convertedFace ? "face" : null, convertedFace?.id ?? null);
      appState.notifyStatus?.(convertedFace ? "Polygon converted to Face" : "Unable to convert polygon", 1100);
      return;
    }

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
    const fillColor = appState.currentStyle.fillColor;
    const fillAlpha = appState.currentStyle.fillOpacity ?? 1;
    const existingFace = shapeStore.getFaceBySourceRegionKey?.(hit.id) ?? null;
    let faceId = existingFace?.id ?? null;
    if (existingFace) {
      const updatedFace = shapeStore.updateFaceStyle?.(existingFace.id, {
        fillColor,
        fillAlpha,
      });
      faceId = updatedFace?.id ?? faceId;
    } else {
      faceId = shapeStore.createFaceFromRegion?.(hit, {
        fillColor,
        fillAlpha,
      }) ?? null;
    }

    appState.setSelection?.(faceId ? [faceId] : [], faceId ? "face" : null, faceId ?? null);
    appState.notifyStatus?.("Region filled", 900);
  }
}
