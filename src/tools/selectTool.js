import { BaseTool } from "./baseTool.js";
import { worldToIsoUV } from "../core/isoGrid.js";

function isMovableShape(shape) {
  return shape && (shape.type === "line" || shape.type === "polygon-shape") && shape.locked !== true;
}

function getShapeUVPoints(shape) {
  if (shape.type === "line") {
    return [{ ...shape.startUV }, { ...shape.endUV }];
  }

  if (shape.type === "polygon-shape") {
    return shape.pointsUV.map((point) => ({ ...point }));
  }

  return [];
}

function applyShapeUVPoints(shape, pointsUV) {
  if (shape.type === "line" && pointsUV.length >= 2) {
    shape.setUVPoints(pointsUV[0], pointsUV[1]);
    return;
  }

  if (shape.type === "polygon-shape") {
    shape.setUVPoints(pointsUV);
  }
}

function getStep(appState) {
  return appState.snapToMidpoints ? 0.5 : 1;
}

function snapDelta(delta, step) {
  return Math.round(delta / step) * step;
}

function rotateUV60(point, clockwise = true) {
  if (clockwise) {
    return { u: -point.v, v: point.u + point.v };
  }

  return { u: point.u + point.v, v: -point.u };
}

function getPivotUV(shape) {
  if (shape.type === "line") {
    return { ...shape.startUV };
  }

  if (shape.type === "polygon-shape") {
    return { ...shape.pointsUV[0] };
  }

  return { u: 0, v: 0 };
}

export class SelectTool extends BaseTool {
  constructor(context) {
    super(context);
    this.dragState = null;
    this.hoverShapeId = null;
  }

  onDeactivate() {
    this.dragState = null;
    this.hoverShapeId = null;
    if (this.context.canvas) {
      this.context.canvas.style.cursor = "default";
    }
  }

  onMouseDown({ worldPoint }) {
    const { shapeStore, camera, appState } = this.context;
    const toleranceWorld = 8 / camera.zoom;
    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false });

    shapeStore.clearSelection();

    if (!hit) {
      appState.selected = { type: null, id: null };
      this.dragState = null;
      return;
    }

    hit.selected = true;
    appState.selected = {
      type: hit.type === "polygon-shape" ? "polygon" : hit.type,
      id: hit.id,
    };

    if (!isMovableShape(hit)) {
      this.dragState = null;
      return;
    }

    this.dragState = {
      shapeId: hit.id,
      startMouseWorld: { ...worldPoint },
      startUVPoints: getShapeUVPoints(hit),
      didDrag: false,
      historyPushed: false,
    };
  }

  onMouseMove({ worldPoint }) {
    const { canvas, shapeStore, camera, appState } = this.context;
    const toleranceWorld = 8 / camera.zoom;

    if (this.dragState) {
      const shape = shapeStore.getShapes().find((item) => item.id === this.dragState.shapeId);
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

      const moved = this.dragState.startUVPoints.map((point) => ({
        u: point.u + du,
        v: point.v + dv,
      }));
      applyShapeUVPoints(shape, moved);

      if (canvas) {
        canvas.style.cursor = "grabbing";
      }

      return;
    }

    const hover = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false });
    this.hoverShapeId = hover?.id ?? null;
    if (canvas) {
      canvas.style.cursor = this.hoverShapeId ? "grab" : "default";
    }
  }

  onMouseUp() {
    if (!this.dragState) {
      return;
    }

    this.dragState = null;
    if (this.context.canvas) {
      this.context.canvas.style.cursor = this.hoverShapeId ? "grab" : "default";
    }
  }

  onKeyDown(event) {
    const key = event.key.toLowerCase();
    if (key !== "r") {
      return;
    }

    const { appState, shapeStore } = this.context;
    if (!appState.selected?.id) {
      return;
    }

    const shape = shapeStore.getShapes().find((item) => item.id === appState.selected.id);
    if (!isMovableShape(shape)) {
      return;
    }

    const points = getShapeUVPoints(shape);
    if (points.length === 0) {
      return;
    }

    const pivot = getPivotUV(shape);
    const clockwise = !event.shiftKey;
    const rotated = points.map((point) => {
      const rel = {
        u: point.u - pivot.u,
        v: point.v - pivot.v,
      };
      const relRotated = rotateUV60(rel, clockwise);
      return {
        u: pivot.u + relRotated.u,
        v: pivot.v + relRotated.v,
      };
    });

    this.context.pushHistoryState?.();
    applyShapeUVPoints(shape, rotated);
    event.preventDefault();
  }
}
