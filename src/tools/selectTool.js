import { BaseTool } from "./baseTool.js";
import { worldToIsoUV } from "../core/isoGrid.js";
import { findSmallestRegionContainingPoint } from "../core/regionBuilder.js";
import { snapWorldToIso } from "../core/isoGrid.js";

function isMovableShape(shape) {
  return shape && ["line", "face"].includes(shape.type) && shape.locked !== true;
}

function getSelectedIds(appState) {
  return appState.selectedIds instanceof Set ? [...appState.selectedIds] : [];
}

function getSelectionTypeForShape(shape) {
  if (!shape) return null;
  if (shape.type === "line" || shape.type === "face") return shape.type;
  return null;
}

function filterShapesBySelectionPriority(shapes = []) {
  const faces = shapes.filter((shape) => shape.type === "face");
  if (faces.length) return { type: "face", shapes: faces };
  const lines = shapes.filter((shape) => shape.type === "line");
  if (lines.length) return { type: "line", shapes: lines };
  return { type: null, shapes: [] };
}

function getFilledRegionHit(shapeStore, worldPoint) {
  const clickUv = worldToIsoUV(worldPoint);
  const filledRegionIds = new Set(
    shapeStore.getShapes()
      .filter((shape) => shape.type === "fillRegion" && shape.visible !== false)
      .map((shape) => shape.regionId),
  );
  if (!filledRegionIds.size) return null;
  const filledRegions = shapeStore.getComputedRegions().filter((region) => filledRegionIds.has(region.id));
  return findSmallestRegionContainingPoint(filledRegions, clickUv);
}

export class SelectTool extends BaseTool {
  constructor(context) {
    super(context);
    this.dragState = null;
    this.marqueeState = null;
    this.hoverShapeId = null;
  }

  onDeactivate() {
    this.dragState = null;
    this.marqueeState = null;
    this.hoverShapeId = null;
    this.context.appState.marqueeRect = null;
    this.context.appState.selectionBoxWorld = null;
    if (this.context.canvas) this.context.canvas.style.cursor = "default";
  }

  getAnchorWorld(id) {
    const shape = this.context.shapeStore.getShapeById(id);
    if (!shape) return null;
    if (shape.type === "line") return { ...shape.start };
    if (shape.type === "face") return shape.pointsWorld?.[0] ? { ...shape.pointsWorld[0] } : null;
    return null;
  }

  onMouseDown({ event, worldPoint, screenPoint }) {
    const { shapeStore, camera, appState } = this.context;
    const toleranceWorld = 8 / camera.zoom;
    const keepSelecting = appState.keepSelecting === true;

    const filledRegionHit = getFilledRegionHit(shapeStore, worldPoint);
    if (filledRegionHit) {
      appState.selectedRegionKey = filledRegionHit.id;
      appState.setSelection?.([filledRegionHit.id], "region", filledRegionHit.id);
      appState.updateSelectionBar?.();
      return;
    }

    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false });

    if (!hit) {
      appState.setSelection?.([], null);
      appState.closeContextMenu?.();
      appState.updateSelectionBar?.();
      this.marqueeState = { startWorld: { ...worldPoint }, startScreen: { ...screenPoint } };
      return;
    }

    appState.selectionBoxWorld = null;

    const targetId = shapeStore.getSelectionTargetId(hit.id) ?? hit.id;
    const targetShape = shapeStore.getShapeById(targetId) ?? hit;
    const hitType = getSelectionTypeForShape(targetShape);
    const hitWasSelected = appState.selectedIds instanceof Set && appState.selectedIds.has(targetId);
    const currentType = appState.selectedType ?? null;

    if (keepSelecting) {
      if (currentType && currentType !== hitType) appState.setSelection?.([targetId], hitType, targetId);
      else if (hitWasSelected) appState.removeFromSelection?.(targetId);
      else appState.addToSelection?.(targetId, hitType);
    } else {
      appState.setSelection?.([targetId], hitType, targetId);
    }

    appState.selectedRegionKey = null;
    appState.updateSelectionBar?.();
    if (!isMovableShape(targetShape) && appState.selectedType !== "object") {
      this.dragState = null;
      return;
    }

    const selectedIds = getSelectedIds(appState);
    const dragIds = selectedIds.includes(targetId) ? selectedIds : [targetId];
    const anchorId = dragIds[0];

    this.dragState = {
      startMouseWorld: { ...worldPoint },
      startScreen: { ...screenPoint },
      clickedShapeId: targetId,
      dragIds,
      anchorOriginal: this.getAnchorWorld(anchorId) ?? { ...worldPoint },
      didDrag: false,
      totalAppliedDelta: { x: 0, y: 0 },
    };
  }

  onMouseMove({ worldPoint, screenPoint }) {
    const { canvas, shapeStore, camera, appState } = this.context;
    const toleranceWorld = 8 / camera.zoom;

    if (this.marqueeState) {
      appState.marqueeRect = {
        x: Math.min(this.marqueeState.startScreen.x, screenPoint.x),
        y: Math.min(this.marqueeState.startScreen.y, screenPoint.y),
        width: Math.abs(screenPoint.x - this.marqueeState.startScreen.x),
        height: Math.abs(screenPoint.y - this.marqueeState.startScreen.y),
      };
      return;
    }

    if (this.dragState) {
      const rawDelta = {
        x: worldPoint.x - this.dragState.startMouseWorld.x,
        y: worldPoint.y - this.dragState.startMouseWorld.y,
      };
      const anchorMoved = {
        x: this.dragState.anchorOriginal.x + rawDelta.x,
        y: this.dragState.anchorOriginal.y + rawDelta.y,
      };
      const anchorSnappedResult = snapWorldToIso(anchorMoved);
      const anchorSnapped = anchorSnappedResult.point;
      const snappedDelta = {
        x: anchorSnapped.x - this.dragState.anchorOriginal.x,
        y: anchorSnapped.y - this.dragState.anchorOriginal.y,
      };
      const stepDelta = {
        x: snappedDelta.x - this.dragState.totalAppliedDelta.x,
        y: snappedDelta.y - this.dragState.totalAppliedDelta.y,
      };

      if (Math.abs(stepDelta.x) > Number.EPSILON || Math.abs(stepDelta.y) > Number.EPSILON) {
        this.dragState.didDrag = true;
      }

      for (const id of this.dragState.dragIds) {
        if (appState.selectedType === "object") shapeStore.applyWorldDeltaToNode(id, stepDelta);
        else shapeStore.applyWorldDeltaToNode(id, stepDelta);
      }
      this.dragState.totalAppliedDelta = snappedDelta;

      if (canvas) canvas.style.cursor = "grabbing";
      return;
    }

    const hover = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false });
    this.hoverShapeId = hover?.id ?? null;
    if (canvas) canvas.style.cursor = this.hoverShapeId ? "grab" : "default";
  }

  onMouseUp({ worldPoint, screenPoint }) {
    const { appState, shapeStore } = this.context;
    if (this.marqueeState) {
      const rect = {
        minX: Math.min(this.marqueeState.startWorld.x, worldPoint.x),
        minY: Math.min(this.marqueeState.startWorld.y, worldPoint.y),
        maxX: Math.max(this.marqueeState.startWorld.x, worldPoint.x),
        maxY: Math.max(this.marqueeState.startWorld.y, worldPoint.y),
      };
      const hitShapes = shapeStore.getShapesIntersectingRect(rect);
      const { type, shapes } = filterShapesBySelectionPriority(hitShapes);
      const hitIds = shapes.map((shape) => shape.id);

      appState.setSelection?.(hitIds, type, hitIds[hitIds.length - 1] ?? null);
      appState.selectionBoxWorld = rect;
      appState.marqueeRect = null;
      this.marqueeState = null;
    }

    if (this.dragState?.didDrag) this.context.pushHistoryState?.();

    if (this.dragState && !this.dragState.didDrag && !this.marqueeState) {
      appState.openContextMenuForSelection?.(screenPoint, this.dragState.clickedShapeId);
    }

    this.dragState = null;
    if (this.context.canvas) this.context.canvas.style.cursor = this.hoverShapeId ? "grab" : "default";
  }

  onKeyDown(event) {
    if (event.key === "Escape") this.context.appState.closeSelectionPanel?.();
  }
}
