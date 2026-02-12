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
const undoButton = document.getElementById("undo-btn");
const redoButton = document.getElementById("redo-btn");

const camera = new Camera();
const shapeStore = new ShapeStore();
const layerStore = new LayerStore();
const historyStore = new HistoryStore();

const appState = {
  currentMode: "2D",
  gridSpacing: 32,
  previewShape: null,
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

function setActiveTool(toolName) {
  currentTool.onDeactivate();
  currentTool = tools[toolName];
  currentTool.onActivate();

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === toolName);
  });
}

function refreshStatus() {
  statusEl.textContent = `Mode: ${appState.currentMode}`;
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

for (const button of document.querySelectorAll("[data-tool]")) {
  button.addEventListener("click", () => setActiveTool(button.dataset.tool));
}

modeToggleButton.addEventListener("click", () => {
  appState.currentMode = appState.currentMode === "2D" ? "ISO" : "2D";
  refreshStatus();
});

undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);

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

  currentTool.onKeyDown(event);
});

setActiveTool("select");
refreshStatus();

function frame() {
  renderer.renderFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
