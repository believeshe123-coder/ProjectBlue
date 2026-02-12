import { CanvasEngine } from "./core/canvasEngine.js";
import { Camera } from "./core/camera.js";
import { Renderer } from "./core/renderer.js";
import { HistoryStore } from "./state/history.js";
import { LayerStore } from "./state/layerStore.js";
import { ShapeStore } from "./state/shapeStore.js";
import { IsoLineTool } from "./tools/isoLineTool.js";
import { SelectTool } from "./tools/selectTool.js";
import { MeasureTool } from "./tools/measureTool.js";
import { PolygonTool } from "./tools/polygonTool.js";
import { EraseTool } from "./tools/eraseTool.js";

const canvas = document.getElementById("blueprint-canvas");
const statusEl = document.getElementById("status");
const zoomInButton = document.getElementById("zoom-in-btn");
const zoomOutButton = document.getElementById("zoom-out-btn");
const resetViewButton = document.getElementById("reset-view-btn");
const undoButton = document.getElementById("undo-btn");
const redoButton = document.getElementById("redo-btn");
const snapGridToggle = document.getElementById("snap-grid-toggle");
const snapMidToggle = document.getElementById("snap-mid-toggle");
const debugSnapToggle = document.getElementById("debug-snap-toggle");
const unitPerCellInput = document.getElementById("unit-per-cell");
const unitNameInput = document.getElementById("unit-name");
const scaleDisplay = document.getElementById("scale-display");

const camera = new Camera();
const shapeStore = new ShapeStore();
const layerStore = new LayerStore();
const historyStore = new HistoryStore();

const appState = {
  currentMode: "ISO",
  previewShape: null,
  snapIndicator: null,
  snapToGrid: true,
  snapToMidpoints: true,
  debugSnap: true,
  snapDebugStatus: "SNAP: OFF",
  unitName: "ft",
  unitPerCell: 1,
  currentFillColor: "rgba(78, 191, 255, 0.9)",
};

const sharedContext = {
  camera,
  shapeStore,
  layerStore,
  historyStore,
  appState,
};

const tools = {
  select: new SelectTool(sharedContext),
  "iso-line": new IsoLineTool(sharedContext),
  measure: new MeasureTool(sharedContext),
  polygon: new PolygonTool(sharedContext),
  erase: new EraseTool(sharedContext),
};

let currentTool = tools.select;
currentTool.onActivate();

const canvasEngine = new CanvasEngine({
  canvas,
  camera,
  getTool: () => currentTool,
  onViewChange: refreshStatus,
});

const renderer = new Renderer({
  canvas,
  ctx: canvasEngine.getContext(),
  camera,
  shapeStore,
  layerStore,
  appState,
});

layerStore.createLayer("Layer 1");

function getCanvasCenterScreenPoint() {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.width / 2,
    y: rect.height / 2,
  };
}

function setActiveTool(toolName) {
  currentTool.onDeactivate();
  currentTool = tools[toolName];
  currentTool.onActivate();

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === toolName);
  });
}

function getSnapStatusLabel() {
  const base = `Snap: Grid ${appState.snapToGrid ? "ON" : "OFF"}`;
  if (appState.snapIndicator?.kind === "grid" && Number.isInteger(appState.snapIndicator.u) && Number.isInteger(appState.snapIndicator.v)) {
    return `${base} | SNAP: GRID (u=${appState.snapIndicator.u}, v=${appState.snapIndicator.v})`;
  }

  return base;
}

function refreshScaleDisplay() {
  scaleDisplay.textContent = `1 grid = ${appState.unitPerCell} ${appState.unitName}`;
}

function refreshStatus() {
  statusEl.textContent = `Mode: ISO | Zoom: ${camera.zoom.toFixed(2)}x | ${getSnapStatusLabel()}`;
}

function undo() {
  const previous = historyStore.undo(shapeStore.serialize());
  if (!previous) return;
  shapeStore.replaceFromSerialized(previous);
  appState.previewShape = null;
}

function redo() {
  const next = historyStore.redo(shapeStore.serialize());
  if (!next) return;
  shapeStore.replaceFromSerialized(next);
  appState.previewShape = null;
}

function zoomBy(factor) {
  camera.zoomAt(getCanvasCenterScreenPoint(), factor);
  refreshStatus();
}

function deleteSelection() {
  const selectedCount = shapeStore.getSelectedShapes().length;
  if (selectedCount === 0) {
    return;
  }

  historyStore.pushState(shapeStore.serialize());
  shapeStore.deleteSelectedShapes();
}

for (const button of document.querySelectorAll("[data-tool]")) {
  button.addEventListener("click", () => setActiveTool(button.dataset.tool));
}

zoomInButton.addEventListener("click", () => zoomBy(1.15));
zoomOutButton.addEventListener("click", () => zoomBy(1 / 1.15));
resetViewButton?.addEventListener("click", () => {
  camera.resetView();
  refreshStatus();
});
undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);

snapGridToggle.addEventListener("change", (event) => {
  appState.snapToGrid = event.target.checked;
  refreshStatus();
});

snapMidToggle.addEventListener("change", (event) => {
  appState.snapToMidpoints = event.target.checked;
  refreshStatus();
});

debugSnapToggle.addEventListener("change", (event) => {
  appState.debugSnap = event.target.checked;
});

unitPerCellInput.addEventListener("input", (event) => {
  const value = Number.parseFloat(event.target.value);
  if (Number.isFinite(value) && value > 0) {
    appState.unitPerCell = value;
    refreshScaleDisplay();
  }
});

unitNameInput.addEventListener("change", (event) => {
  const text = event.target.value.trim();
  appState.unitName = text || "ft";
  refreshScaleDisplay();
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const isCtrlOrMeta = event.ctrlKey || event.metaKey;

  if (isCtrlOrMeta && key === "z") {
    event.preventDefault();
    undo();
    return;
  }

  if (isCtrlOrMeta && key === "y") {
    event.preventDefault();
    redo();
    return;
  }

  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    zoomBy(1.15);
    return;
  }

  if (event.key === "-") {
    event.preventDefault();
    zoomBy(1 / 1.15);
    return;
  }

  if (event.key === "0") {
    event.preventDefault();
    camera.resetView();
    refreshStatus();
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelection();
    return;
  }

  currentTool.onKeyDown(event);
});

setActiveTool("select");
refreshScaleDisplay();
refreshStatus();

function frame() {
  renderer.renderFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
