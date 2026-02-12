import { CanvasEngine } from "./core/canvasEngine.js";
import { Camera } from "./core/camera.js";
import { Renderer } from "./core/renderer.js";
import { HistoryStore } from "./state/history.js";
import { LayerStore } from "./state/layerStore.js";
import { ShapeStore } from "./state/shapeStore.js";
import { IsoLineTool } from "./tools/isoLineTool.js";
import { LineTool } from "./tools/lineTool.js";
import { SelectTool } from "./tools/selectTool.js";

const canvas = document.getElementById("blueprint-canvas");
const statusEl = document.getElementById("status");
const modeToggleButton = document.getElementById("mode-toggle");
const zoomInButton = document.getElementById("zoom-in-btn");
const zoomOutButton = document.getElementById("zoom-out-btn");
const resetViewButton = document.getElementById("reset-view-btn");
const undoButton = document.getElementById("undo-btn");
const redoButton = document.getElementById("redo-btn");
const snapGridToggle = document.getElementById("snap-grid-toggle");
const snapMidToggle = document.getElementById("snap-mid-toggle");

const camera = new Camera();
const shapeStore = new ShapeStore();
const layerStore = new LayerStore();
const historyStore = new HistoryStore();

const appState = {
  currentMode: "2D",
  previewShape: null,
  snapIndicator: null,
  snapToGrid: true,
  snapToMidpoints: true,
  snapDebugStatus: null,
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
  line: new LineTool(sharedContext),
  "iso-line": new IsoLineTool(sharedContext),
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
  const snapKind = appState.snapIndicator?.kind;
  if (snapKind === "grid") {
    return "SNAP: GRID";
  }

  if (snapKind === "midpoint" || snapKind === "endpoint") {
    return "SNAP: MID";
  }

  return `Snap: Grid ${appState.snapToGrid ? "ON" : "OFF"} | Mid ${appState.snapToMidpoints ? "ON" : "OFF"}`;
}

function refreshStatus() {
  statusEl.textContent = `Mode: ${appState.currentMode} | Zoom: ${camera.zoom.toFixed(2)}x | ${getSnapStatusLabel()}`;
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

for (const button of document.querySelectorAll("[data-tool]")) {
  button.addEventListener("click", () => setActiveTool(button.dataset.tool));
}

modeToggleButton.addEventListener("click", () => {
  appState.currentMode = appState.currentMode === "2D" ? "ISO" : "2D";
  refreshStatus();
});

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

  currentTool.onKeyDown(event);
});

setActiveTool("select");
refreshStatus();

function frame() {
  renderer.renderFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
