import { BaseTool } from "./baseTool.js";
import { snapWorldToIso } from "../core/isoGrid.js";

function isMovableShape(shape) {
  return shape && shape.type === "line" && shape.locked !== true;
}

function getSelectedIds(appState) {
  return appState.selectedIds instanceof Set ? [...appState.selectedIds] : [];
}

export class SelectTool extends BaseTool {
  constructor(context) {
    super(context);
    this.dragState = null;
    this.marqueeState = null;
    this.hoverShapeId = null;
  }

  onActivate() {
    this.dragState = null;
    this.marqueeState = null;
    this.hoverShapeId = null;
    this.context.appState.marqueeRect = null;
    this.context.appState.selectionBoxWorld = null;
    if (this.context.canvas) this.context.canvas.style.cursor = "default";
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

  onMouseDown({ worldPoint, screenPoint }) {
    const { shapeStore, camera, appState } = this.context;
    const toleranceWorld = 8 / camera.zoom;
    const keepSelecting = appState.keepSelecting === true;
    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false, lineOnly: true });

    if (!hit) {
      appState.closeContextMenu?.();
      if (keepSelecting) {
        this.marqueeState = { startWorld: { ...worldPoint }, startScreen: { ...screenPoint } };
      } else {
        appState.setSelection?.([], null);
        appState.updateSelectionBar?.();
      }
      return;
    }

    appState.selectionBoxWorld = null;
    const targetId = hit.id;
    const hitWasSelected = appState.selectedIds instanceof Set && appState.selectedIds.has(targetId);
    const activeGroup = appState.selectedType === "group" && appState.selectedGroupId
      ? shapeStore.getLineGroup(appState.selectedGroupId)
      : null;
    const hitInsideActiveGroup = !!activeGroup && activeGroup.childIds.includes(targetId);

    if (hitInsideActiveGroup) {
      // Preserve group selection when interacting with a selected group member.
    } else if (keepSelecting && appState.selectedType === "line") {
      if (hitWasSelected) appState.removeFromSelection?.(targetId);
      else appState.addToSelection?.(targetId, "line");
    } else {
      appState.setSelection?.([targetId], "line", targetId);
    }

    appState.updateSelectionBar?.();
    if (!isMovableShape(hit)) {
      this.dragState = null;
      return;
    }

    const selectedIds = getSelectedIds(appState);
    let dragIds = selectedIds.includes(targetId) ? selectedIds : [targetId];
    if (appState.selectedType === "group" && appState.selectedGroupId) {
      const group = shapeStore.getLineGroup(appState.selectedGroupId);
      if (group) dragIds = [...group.childIds];
    }
    const firstLine = shapeStore.getShapeById(dragIds[0]);

    this.dragState = {
      startMouseWorld: { ...worldPoint },
      startScreen: { ...screenPoint },
      clickedShapeId: targetId,
      dragIds,
      anchorOriginal: firstLine?.type === "line" ? { ...firstLine.start } : (this.getAnchorWorld(dragIds[0]) ?? { ...worldPoint }),
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
      const anchorSnapped = appState.snapToGrid
        ? snapWorldToIso(anchorMoved).point
        : anchorMoved;
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
        shapeStore.applyWorldDeltaToNode(id, stepDelta, { lineOnly: true });
      }
      if (appState.debugSelectionDrag) {
        console.log("[DRAG]", {
          selectedType: appState.selectedType,
          selectedIds: [...(appState.selectedIds ?? [])],
          dx: stepDelta.x,
          dy: stepDelta.y,
          affectedIds: this.dragState.dragIds,
        });
      }
      this.dragState.totalAppliedDelta = snappedDelta;

      if (canvas) canvas.style.cursor = "grabbing";
      return;
    }

    const hover = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false, lineOnly: true });
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
      const hitShapes = shapeStore.getShapesIntersectingRect(rect, { lineOnly: true });
      const hitIds = hitShapes.map((shape) => shape.id);
      if (appState.keepSelecting && appState.selectedType === "line") {
        for (const id of hitIds) {
          if (appState.selectedIds.has(id)) appState.removeFromSelection?.(id);
          else appState.addToSelection?.(id, "line");
        }
      } else {
        appState.setSelection?.(hitIds, hitIds.length ? "line" : null, hitIds[hitIds.length - 1] ?? null);
      }
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
    if (event.key === "Escape") {
      this.dragState = null;
      this.marqueeState = null;
      this.context.appState.marqueeRect = null;
      this.context.appState.selectionBoxWorld = null;
      this.context.appState.closeSelectionPanel?.();
    }
  }
}
