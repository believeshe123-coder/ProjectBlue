import { BaseTool } from "./baseTool.js";
import { snapWorldToIso } from "../core/isoGrid.js";

const MOVABLE_SHAPE_TYPES = new Set(["line", "face", "polygon"]);

function isMovableShape(shape) {
  return !!shape && MOVABLE_SHAPE_TYPES.has(shape.type) && shape.locked !== true;
}

function getNodeSelectionType(node) {
  if (!node) return null;
  if (node.kind === "object") return "object";
  if (node.kind === "shape") return node.shapeType;
  return null;
}

function isMovableNode(node) {
  if (!node) return false;
  if (node.kind === "object") return true;
  if (node.kind !== "shape") return false;
  if (node.style?.locked === true) return false;
  return MOVABLE_SHAPE_TYPES.has(node.shapeType);
}

function getSelectedIds(appState) {
  return appState.selectedIds instanceof Set ? [...appState.selectedIds] : [];
}

function normalizeDragSelection(shapeStore, appState, ids = [], { operation = "move" } = {}) {
  const inputIds = [...new Set(ids)];
  const existingIds = inputIds.filter((id) => shapeStore.getNodeById(id));
  const staleCount = inputIds.length - existingIds.length;
  const normalizedIds = shapeStore.getObjectRootIds(existingIds);
  const objectIds = normalizedIds.filter((id) => shapeStore.getNodeById(id)?.kind === "object");
  const shapeIds = normalizedIds.filter((id) => shapeStore.getNodeById(id)?.kind === "shape");

  if (staleCount > 0) {
    appState.notifyStatus?.(`Recovered from ${staleCount} stale selection item${staleCount === 1 ? "" : "s"}`, 1200);
  }

  const preferredKind = appState.selectedType === "object" ? "object" : "shape";
  let finalIds = preferredKind === "object" ? objectIds : shapeIds;
  let kind = preferredKind;

  if (!finalIds.length && objectIds.length) {
    finalIds = objectIds;
    kind = "object";
  } else if (!finalIds.length && shapeIds.length) {
    finalIds = shapeIds;
    kind = "shape";
  }

  if (objectIds.length && shapeIds.length) {
    const fallbackLabel = kind === "object" ? "objects" : "shapes";
    appState.notifyStatus?.(`Mixed selection detected; ${operation} applied to ${fallbackLabel} only`, 1600);
  }

  if (kind === "object") finalIds = shapeStore.getObjectRootIds(finalIds);
  return { ids: finalIds, kind };
}

function notifyNonMovable(appState, shape) {
  if (!shape?.type) return;
  appState.notifyStatus?.(`${shape.type} is selectable but not movable`, 1400);
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

  getAncestorChain(id) {
    const { shapeStore } = this.context;
    const chain = [];
    let currentId = id;
    const visited = new Set();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = shapeStore.getNodeById(currentId);
      if (!node) break;
      chain.push(node);
      currentId = shapeStore.parentById?.[currentId] ?? null;
    }
    return chain;
  }

  resolveSelectionRoot(hitShapeId) {
    const { appState } = this.context;
    const chain = this.getAncestorChain(hitShapeId);
    if (!chain.length) return null;
    const movableChain = chain.filter((node) => isMovableNode(node));
    if (!movableChain.length) return chain[0];

    const selectedIds = appState.selectedIds instanceof Set ? appState.selectedIds : new Set();
    const selectedMovable = movableChain.filter((node) => selectedIds.has(node.id));
    const selectedObject = selectedMovable.filter((node) => node.kind === "object").at(-1);
    if (selectedObject) return selectedObject;
    const selectedRoot = selectedMovable.at(-1);
    if (selectedRoot) return selectedRoot;

    const topObject = movableChain.filter((node) => node.kind === "object").at(-1);
    if (topObject) return topObject;
    return movableChain[0];
  }

  getObjectAnchorWorld(objectId) {
    const { shapeStore } = this.context;
    const objectNode = shapeStore.getNodeById(objectId);
    if (!objectNode || objectNode.kind !== "object") return null;

    const descendantIds = shapeStore.getDescendantIds(objectId);
    const shapeDescendants = descendantIds.filter((id) => shapeStore.getNodeById(id)?.kind === "shape");
    const bounds = shapeStore.getSelectionBoundsFromIds(shapeDescendants);
    if (bounds) {
      return {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      };
    }

    const firstChildId = objectNode.children?.[0];
    if (!firstChildId) return null;
    return this.getAnchorWorld(firstChildId);
  }

  getAnchorWorld(id) {
    const node = this.context.shapeStore.getNodeById(id);
    if (!node) return null;
    if (node.kind === "object") return this.getObjectAnchorWorld(id);

    const shape = this.context.shapeStore.getShapeById(id);
    if (!shape) return null;
    if (shape.type === "line") return { ...shape.start };
    if (shape.type === "face") return shape.pointsWorld?.[0] ? { ...shape.pointsWorld[0] } : null;
    if (shape.type === "polygon") return shape.pointsWorld?.[0] ? { ...shape.pointsWorld[0] } : null;
    if (shape.type === "fillRegion") return shape.pointsWorld?.[0] ? { ...shape.pointsWorld[0] } : null;
    return null;
  }

  onMouseDown({ event, worldPoint, screenPoint }) {
    const { shapeStore, camera, appState } = this.context;
    const toleranceWorld = 8 / camera.zoom;
    const keepSelecting = appState.keepSelecting === true;
    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false });

    if (!hit) {
      appState.closeContextMenu?.();
      this.marqueeState = { startWorld: { ...worldPoint }, startScreen: { ...screenPoint } };
      if (!keepSelecting) appState.setSelection?.([], null);
      appState.updateSelectionBar?.();
      return;
    }

    appState.selectionBoxWorld = null;
    const selectionRoot = this.resolveSelectionRoot(hit.id);
    const targetId = selectionRoot?.id ?? hit.id;
    const targetType = getNodeSelectionType(selectionRoot) ?? hit.type;
    const hitWasSelected = appState.selectedIds instanceof Set && appState.selectedIds.has(targetId);
    if (keepSelecting && appState.selectedType === targetType) {
      if (hitWasSelected) appState.removeFromSelection?.(targetId);
      else appState.addToSelection?.(targetId, targetType);
    } else {
      appState.setSelection?.([targetId], targetType, targetId);
    }

    appState.updateSelectionBar?.();
    const targetNode = shapeStore.getNodeById(targetId);
    if (!isMovableNode(targetNode)) {
      this.dragState = null;
      notifyNonMovable(appState, hit);
      return;
    }

    const selectedIds = getSelectedIds(appState);
    const baseDragIds = selectedIds.includes(targetId) ? selectedIds : [targetId];
    const { ids: dragIds, kind: dragKind } = normalizeDragSelection(shapeStore, appState, baseDragIds, { operation: "move" });
    if (!dragIds.length) {
      this.dragState = null;
      appState.setSelection?.([], null);
      return;
    }
    const isDraggingObjects = dragKind === "object";

    this.dragState = {
      startMouseWorld: { ...worldPoint },
      startScreen: { ...screenPoint },
      clickedShapeId: event?.button === 2 ? targetId : null,
      dragIds,
      moveOptions: isDraggingObjects ? {} : { lineOnly: appState.selectedType === "line" },
      anchorOriginal: this.getAnchorWorld(dragIds[0]) ?? { ...worldPoint },
      didDrag: false,
      historyCaptured: false,
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
      const liveDragIds = this.dragState.dragIds.filter((id) => shapeStore.getNodeById(id));
      if (!liveDragIds.length) {
        appState.notifyStatus?.("Selection changed while dragging; recovering", 1200);
        this.dragState = null;
        appState.setSelection?.([], null);
        if (canvas) canvas.style.cursor = "default";
        return;
      }
      if (liveDragIds.length !== this.dragState.dragIds.length) {
        this.dragState.dragIds = liveDragIds;
        appState.notifyStatus?.("Some selected items were removed during drag", 1200);
      }

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
        if (!this.dragState.historyCaptured) {
          this.context.pushHistoryState?.();
          this.dragState.historyCaptured = true;
        }
        this.dragState.didDrag = true;
      }

      for (const id of this.dragState.dragIds) {
        shapeStore.applyWorldDeltaToNode(id, stepDelta, this.dragState.moveOptions);
      }
      this.dragState.totalAppliedDelta = snappedDelta;

      if (canvas) canvas.style.cursor = "grabbing";
      return;
    }

    const hover = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: false });
    const hoverRoot = hover ? this.resolveSelectionRoot(hover.id) : null;
    this.hoverShapeId = hoverRoot?.id ?? hover?.id ?? null;
    if (canvas) {
      if (!hoverRoot && !hover) canvas.style.cursor = "default";
      else canvas.style.cursor = isMovableNode(hoverRoot ?? (hover ? shapeStore.getNodeById(hover.id) : null)) ? "grab" : "not-allowed";
    }
  }

  onMouseUp({ event, worldPoint, screenPoint }) {
    const { appState, shapeStore } = this.context;
    if (this.marqueeState) {
      const rect = {
        minX: Math.min(this.marqueeState.startWorld.x, worldPoint.x),
        minY: Math.min(this.marqueeState.startWorld.y, worldPoint.y),
        maxX: Math.max(this.marqueeState.startWorld.x, worldPoint.x),
        maxY: Math.max(this.marqueeState.startWorld.y, worldPoint.y),
      };
      const hitShapes = shapeStore.getShapesIntersectingRect(rect);
      const hitRoots = [...new Map(hitShapes
        .map((shape) => this.resolveSelectionRoot(shape.id))
        .filter(Boolean)
        .map((node) => [node.id, node])).values()];
      const baseType = appState.keepSelecting ? appState.selectedType : null;
      const selectionType = baseType ?? getNodeSelectionType(hitRoots[0]) ?? null;
      const hitIds = hitRoots
        .filter((node) => !selectionType || getNodeSelectionType(node) === selectionType)
        .map((node) => node.id);
      if (appState.keepSelecting && selectionType && appState.selectedType === selectionType) {
        for (const id of hitIds) {
          if (appState.selectedIds.has(id)) appState.removeFromSelection?.(id);
          else appState.addToSelection?.(id, selectionType);
        }
      } else {
        appState.setSelection?.(hitIds, hitIds.length ? selectionType : null, hitIds[hitIds.length - 1] ?? null);
      }
      appState.selectionBoxWorld = rect;
      appState.marqueeRect = null;
      this.marqueeState = null;
    }

    if (
      event?.button === 2
      && this.dragState
      && this.dragState.clickedShapeId
      && !this.dragState.didDrag
      && !this.marqueeState
    ) {
      appState.openContextMenuForSelection?.(screenPoint, this.dragState.clickedShapeId);
    }

    this.dragState = null;
    if (this.context.canvas) {
      const hoverNode = this.hoverShapeId ? this.context.shapeStore.getNodeById(this.hoverShapeId) : null;
      if (!hoverNode) this.context.canvas.style.cursor = "default";
      else this.context.canvas.style.cursor = isMovableNode(hoverNode) ? "grab" : "not-allowed";
    }
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
