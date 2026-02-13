import { BaseTool } from "./baseTool.js";

function isPolygonShape(shape) {
  return shape.type === "polygon-shape";
}

export class FillTool extends BaseTool {
  onMouseDown({ worldPoint }) {
    const { shapeStore, layerStore, historyStore, appState } = this.context;
    const activeLayer = layerStore.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      return;
    }

    const shapes = shapeStore.getShapes();
    const target = [...shapes]
      .reverse()
      .find((shape) => shape.layerId === activeLayer.id && isPolygonShape(shape) && shape.containsPoint(worldPoint));

    if (!target) {
      appState.notifyStatus?.("No polygon found under cursor");
      return;
    }

    historyStore.pushState(shapeStore.serialize());
    target.fillColor = appState.currentStyle.fillColor;
    target.fillAlpha = appState.currentStyle.fillEnabled ? appState.currentStyle.fillOpacity : 0;
    target.fillOpacity = target.fillAlpha;
    target.fillEnabled = target.fillAlpha > 0;
  }
}
