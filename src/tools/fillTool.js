import { BaseTool } from "./baseTool.js";
import { worldToIsoUV, isoUVToWorld } from "../core/isoGrid.js";
import { buildFacesFromLines, findRegionFromNestedLoops, findSmallestFaceContainingPoint } from "../core/faceBuilder.js";
import { FillRegion } from "../models/fillRegion.js";

function isLineShape(shape) {
  return shape.type === "line";
}

function isFillRegion(shape) {
  return shape.type === "fill-region";
}

export class FillTool extends BaseTool {
  constructor(context) {
    super(context);
    this.usesRightClick = true;
  }

  onMouseDown({ event, worldPoint }) {
    const { shapeStore, historyStore, appState } = this.context;
    const shapes = shapeStore.getShapes();
    const clickFillColor = event?.button === 2 ? appState.currentStyle.fillColor : appState.currentStyle.strokeColor;

    const existingFillRegion = [...shapes]
      .reverse()
      .find((shape) => shape.visible !== false && shape.locked !== true && isFillRegion(shape) && shape.containsPoint(worldPoint));

    if (existingFillRegion) {
      this.context.pushHistoryState?.() ?? historyStore.pushState(shapeStore.serialize());
      existingFillRegion.fillColor = clickFillColor;
      existingFillRegion.fillOpacity = appState.currentStyle.fillOpacity ?? 1;
      existingFillRegion.fillEnabled = true;
      return;
    }

    const lines = shapes.filter((shape) => shape.visible !== false && shape.locked !== true && isLineShape(shape));
    const faces = buildFacesFromLines(lines);
    if (!faces.length) {
      appState.notifyStatus?.("No enclosed face found from linework.", 1800);
      return;
    }

    const clickUV = worldToIsoUV(worldPoint);
    let selectedFace = findSmallestFaceContainingPoint(faces, clickUV);

    if (!selectedFace) {
      selectedFace = findRegionFromNestedLoops(lines, clickUV);
    }

    if (!selectedFace) {
      appState.notifyStatus?.("No enclosed face found at click point.", 1800);
      return;
    }

    this.context.pushHistoryState?.() ?? historyStore.pushState(shapeStore.serialize());

    const fillRegion = new FillRegion({
      points: selectedFace.pointsUV.map((point) => isoUVToWorld(point.u, point.v)),
      holes: (selectedFace.holesUV ?? []).map((hole) => hole.map((point) => isoUVToWorld(point.u, point.v))),
      fillColor: clickFillColor,
      fillOpacity: appState.currentStyle.fillOpacity ?? 1,
      fillEnabled: true,
      strokeColor: "transparent",
      strokeWidth: 0,
      zIndex: -1,
    });

    shapeStore.addShape(fillRegion);
  }
}
