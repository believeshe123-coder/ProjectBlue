import { BaseTool } from "./baseTool.js";
import { isoUVToWorld, worldToIsoUV } from "../core/isoGrid.js";
import { findSmallestRegionContainingPoint } from "../core/regionBuilder.js";

function isMovableShape(shape) {
  return shape && ["line", "polygon", "face", "group"].includes(shape.type) && shape.locked !== true;
}

function getStep(appState) {
  return appState.snapToMidpoints ? 0.5 : 1;
}

function snapDelta(delta, step) {
  return Math.round(delta / step) * step;
}

function getSelectedIds(appState) {
  return appState.selectedIds instanceof Set ? [...appState.selectedIds] : [];
}

function getSelectionTypeForShape(shape) {
  if (!shape) return null;
  if (shape.type === "line" || shape.type === "face" || shape.type === "group") return shape.type;
  return null;
}

function filterShapesBySelectionPriority(shapes = []) {
  const byType = {
    face: [],
    line: [],
    group: [],
  };

  for (const shape of shapes) {
    const type = getSelectionTypeForShape(shape);
    if (!type) continue;
    byType[type].push(shape);
  }

  if (byType.face.length) return { type: "face", shapes: byType.face };
  if (byType.line.length) return { type: "line", shapes: byType.line };
  if (byType.group.length) return { type: "group", shapes: byType.group };
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

function getTopmostFaceHit(shapeStore, worldPoint) {
  const faces = shapeStore.getShapes()
    .filter((shape) => shape.type === "face" && shape.visible !== false && shape.locked !== true)
    .sort((a, b) => {
      const zDiff = (b.zIndex ?? 0) - (a.zIndex ?? 0);
      if (zDiff !== 0) return zDiff;
      const createdDiff = (b.createdAt ?? 0) - (a.createdAt ?? 0);
      if (createdDiff !== 0) return createdDiff;
      return String(b.id ?? "").localeCompare(String(a.id ?? ""));
    });
  return faces.find((shape) => shape.containsPoint?.(worldPoint, 0.75)) ?? null;
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

  onMouseDown({ event, worldPoint, screenPoint }) {
    const { shapeStore, camera, appState } = this.context;
    const allowOwnedLines = event?.altKey === true;
    const toleranceWorld = 8 / camera.zoom;
    const keepSelecting = appState.keepSelecting === true;

    const faceHit = getTopmostFaceHit(shapeStore, worldPoint);
    if (faceHit) {
      const targetId = shapeStore.getSelectionTargetId(faceHit.id) ?? faceHit.id;
      const targetShape = shapeStore.getShapeById(targetId) ?? faceHit;
      const hitType = getSelectionTypeForShape(targetShape);
      const hitWasSelected = appState.selectedIds instanceof Set && appState.selectedIds.has(targetId);
      const currentType = appState.selectedType ?? null;

      if (keepSelecting) {
        if (currentType && currentType !== hitType) {
          appState.setSelection?.([targetId], hitType, targetId);
        } else if (hitWasSelected) {
          appState.removeFromSelection?.(targetId);
        } else {
          appState.addToSelection?.(targetId, hitType);
        }
      } else {
        appState.setSelection?.([targetId], hitType, targetId);
      }

      appState.selectedRegionKey = null;
      appState.updateSelectionBar?.();
      if (!isMovableShape(targetShape)) {
        this.dragState = null;
        return;
      }

      this.dragState = {
        shapeId: targetShape.id,
        startMouseWorld: { ...worldPoint },
        startScreen: { ...screenPoint },
        clickedShapeId: targetId,
        didDrag: false,
        historyPushed: false,
      };
      return;
    }

    const filledRegionHit = getFilledRegionHit(shapeStore, worldPoint);
    if (filledRegionHit) {
      appState.selectedRegionKey = filledRegionHit.id;
      appState.setSelection?.([filledRegionHit.id], "region", filledRegionHit.id);
      appState.updateSelectionBar?.();
      return;
    }

    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, {
      includeLocked: false,
      allowOwnedLines,
    });

    if (!hit) {
      appState.setSelection?.([], null);
      appState.closeContextMenu?.();
      appState.updateSelectionBar?.();
      this.marqueeState = {
        startWorld: { ...worldPoint },
        startScreen: { ...screenPoint },
      };
      return;
    }

    appState.selectionBoxWorld = null;

    const targetId = shapeStore.getSelectionTargetId(hit.id) ?? hit.id;
    const targetShape = shapeStore.getShapeById(targetId) ?? hit;
    const hitType = getSelectionTypeForShape(targetShape);
    const hitWasSelected = appState.selectedIds instanceof Set && appState.selectedIds.has(targetId);
    const currentType = appState.selectedType ?? null;

    if (keepSelecting) {
      if (currentType && currentType !== hitType) {
        appState.setSelection?.([targetId], hitType, targetId);
      } else if (hitWasSelected) {
        appState.removeFromSelection?.(targetId);
      } else {
        appState.addToSelection?.(targetId, hitType);
      }
    } else {
      appState.setSelection?.([targetId], hitType, targetId);
    }

    appState.selectedRegionKey = null;
    appState.updateSelectionBar?.();
    if (!isMovableShape(targetShape)) {
      this.dragState = null;
      return;
    }

    this.dragState = {
      shapeId: targetShape.id,
      startMouseWorld: { ...worldPoint },
      startScreen: { ...screenPoint },
      clickedShapeId: targetId,
      didDrag: false,
      historyPushed: false,
    };
  }

  moveShape(shape, du, dv) {
    if (shape.type === "line") {
      shape.setUVPoints(
        { u: shape.startUV.u + du, v: shape.startUV.v + dv },
        { u: shape.endUV.u + du, v: shape.endUV.v + dv },
      );
      return;
    }

    if (shape.type === "polygon") {
      shape.setUVPoints(shape.pointsUV.map((point) => ({ u: point.u + du, v: point.v + dv })));
      return;
    }

    if (shape.type === "face") {
      const deltaWorld = isoUVToWorld(du, dv);
      shape.pointsWorld = shape.pointsWorld.map((point) => ({
        x: point.x + deltaWorld.x,
        y: point.y + deltaWorld.y,
      }));
      return;
    }

    if (shape.type === "group") {
      const members = shape.childIds
        .map((id) => this.context.shapeStore.getShapeById(id))
        .filter(Boolean);
      for (const member of members) this.moveShape(member, du, dv);
    }
  }

  onMouseMove({ event, worldPoint, screenPoint }) {
    const { canvas, shapeStore, camera, appState } = this.context;
    const allowOwnedLines = event?.altKey === true;
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
      const shape = shapeStore.getShapeById(this.dragState.shapeId);
      if (!shape || !isMovableShape(shape)) {
        this.dragState = null;
        return;
      }

      const mouseDeltaWorld = {
        x: worldPoint.x - this.dragState.startMouseWorld.x,
        y: worldPoint.y - this.dragState.startMouseWorld.y,
      };

      const rawDeltaUV = worldToIsoUV(mouseDeltaWorld);
      const step = getStep(appState);
      const du = snapDelta(rawDeltaUV.u, step);
      const dv = snapDelta(rawDeltaUV.v, step);

      if (Math.abs(du) > Number.EPSILON || Math.abs(dv) > Number.EPSILON) {
        this.dragState.didDrag = true;
        if (!this.dragState.historyPushed) {
          this.context.pushHistoryState?.();
          this.dragState.historyPushed = true;
        }
      }

      const selectedIds = getSelectedIds(appState);
      const dragIds = selectedIds.includes(this.dragState.shapeId) ? selectedIds : [this.dragState.shapeId];
      const moveTargets = shapeStore.getShapeTargetsForMove(dragIds);
      for (const target of moveTargets) {
        if (!isMovableShape(target)) continue;
        this.moveShape(target, du, dv);
      }
      shapeStore.invalidateDerivedData?.();
      this.dragState.startMouseWorld = { ...worldPoint };

      if (canvas) canvas.style.cursor = "grabbing";
      return;
    }

    const hover = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, {
      includeLocked: false,
      allowOwnedLines,
    });
    this.hoverShapeId = hover?.id ?? null;
    if (canvas) canvas.style.cursor = this.hoverShapeId ? "grab" : "default";
  }

  onMouseUp({ worldPoint, screenPoint, event }) {
    const { appState, shapeStore } = this.context;
    if (this.marqueeState) {
      const allowOwnedLines = event?.altKey === true;
      const rect = {
        minX: Math.min(this.marqueeState.startWorld.x, worldPoint.x),
        minY: Math.min(this.marqueeState.startWorld.y, worldPoint.y),
        maxX: Math.max(this.marqueeState.startWorld.x, worldPoint.x),
        maxY: Math.max(this.marqueeState.startWorld.y, worldPoint.y),
      };
      const hitShapes = shapeStore.getShapesIntersectingRect(rect, { allowOwnedLines });
      const { type, shapes } = filterShapesBySelectionPriority(hitShapes);
      const hitIds = shapes.map((shape) => shape.id);

      appState.setSelection?.(hitIds, type, hitIds[hitIds.length - 1] ?? null);
      appState.selectionBoxWorld = rect;
      appState.marqueeRect = null;
      this.marqueeState = null;
    }

    if (this.dragState && !this.dragState.didDrag && !this.marqueeState) {
      appState.openContextMenuForSelection?.(screenPoint, this.dragState.clickedShapeId);
    }

    this.dragState = null;
    if (this.context.canvas) {
      this.context.canvas.style.cursor = this.hoverShapeId ? "grab" : "default";
    }
  }

  onKeyDown(event) {
    if (event.key === "Escape") {
      this.context.appState.closeSelectionPanel?.();
    }
  }
}
