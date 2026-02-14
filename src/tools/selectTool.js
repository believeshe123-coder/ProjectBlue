import { BaseTool } from "./baseTool.js";
import { worldToIsoUV } from "../core/isoGrid.js";

function isMovableShape(shape) {
  return shape && ["line", "polygon-shape", "group"].includes(shape.type) && shape.locked !== true;
}

function getStep(appState) {
  return appState.snapToMidpoints ? 0.5 : 1;
}

function snapDelta(delta, step) {
  return Math.round(delta / step) * step;
}

function getSelectionSet(appState) {
  return appState.selectionSet instanceof Set ? appState.selectionSet : new Set();
}

function getSelectedIds(appState) {
  return Array.isArray(appState.selectedIds) ? appState.selectedIds : [];
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
    if (this.context.canvas) this.context.canvas.style.cursor = "default";
  }

  onMouseDown({ worldPoint, screenPoint }) {
    const { shapeStore, camera, appState } = this.context;
    const toleranceWorld = 8 / camera.zoom;
    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false });
    const selectionSet = getSelectionSet(appState);
    const keepSelecting = appState.keepSelecting === true;

    if (!hit) {
      if (!keepSelecting) {
        appState.clearSelection?.();
      }
      this.marqueeState = {
        startWorld: { ...worldPoint },
        startScreen: { ...screenPoint },
      };
      return;
    }

    const targetId = shapeStore.getSelectionTargetId(hit.id) ?? hit.id;
    const hitWasSelected = selectionSet.has(targetId);
    if (keepSelecting) {
      if (hitWasSelected) appState.removeFromSelection?.(targetId);
      else appState.addToSelection?.(targetId);
    } else if (!hitWasSelected || selectionSet.size > 1) {
      appState.setSelection?.([targetId], targetId);
    }

    const moveShape = shapeStore.getShapeById(targetId) ?? hit;
    if (!isMovableShape(moveShape)) {
      this.dragState = null;
      return;
    }

    this.dragState = {
      shapeId: moveShape.id,
      startMouseWorld: { ...worldPoint },
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

    if (shape.type === "polygon-shape") {
      shape.setUVPoints(shape.pointsUV.map((point) => ({ u: point.u + du, v: point.v + dv })));
      return;
    }

    if (shape.type === "group") {
      const members = shape.childIds
        .map((id) => this.context.shapeStore.getShapeById(id))
        .filter(Boolean);
      for (const member of members) this.moveShape(member, du, dv);
    }
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
      this.dragState.startMouseWorld = { ...worldPoint };

      if (canvas) canvas.style.cursor = "grabbing";
      return;
    }

    const hover = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false });
    this.hoverShapeId = hover?.id ?? null;
    if (canvas) canvas.style.cursor = this.hoverShapeId ? "grab" : "default";
  }

  onMouseUp({ worldPoint }) {
    const { appState, shapeStore } = this.context;
    if (this.marqueeState) {
      const rect = {
        minX: Math.min(this.marqueeState.startWorld.x, worldPoint.x),
        minY: Math.min(this.marqueeState.startWorld.y, worldPoint.y),
        maxX: Math.max(this.marqueeState.startWorld.x, worldPoint.x),
        maxY: Math.max(this.marqueeState.startWorld.y, worldPoint.y),
      };
      const hitShapes = shapeStore.getShapesIntersectingRect(rect);
      const hitIds = hitShapes.map((shape) => shape.id);
      if (appState.keepSelecting === true) {
        for (const id of hitIds) {
          if (appState.selectionSet.has(id)) appState.removeFromSelection?.(id);
          else appState.addToSelection?.(id);
        }
      } else {
        appState.setSelection?.(hitIds, hitIds[hitIds.length - 1] ?? null);
      }
      appState.marqueeRect = null;
      this.marqueeState = null;
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
