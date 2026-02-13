import { CanvasEngine } from "./core/canvasEngine.js";
import { Camera } from "./core/camera.js";
import { Renderer } from "./core/renderer.js";
import { HistoryStore } from "./state/history.js";
import { LayerStore } from "./state/layerStore.js";
import { ShapeStore } from "./state/shapeStore.js";
import { IsoLineTool } from "./tools/isoLineTool.js";
import { SelectTool } from "./tools/selectTool.js";
import { MeasureTool } from "./tools/measureTool.js";
import { PolylineTool } from "./tools/polylineTool.js";
import { FillTool } from "./tools/fillTool.js";
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
const showDimensionsToggle = document.getElementById("show-dimensions-toggle");
const continuePolylineToggle = document.getElementById("continue-polyline-toggle");

const strokeColorInput = document.getElementById("stroke-color-input");
const strokeOpacityInput = document.getElementById("stroke-opacity-input");
const strokeWidthInput = document.getElementById("stroke-width-input");
const fillEnabledToggle = document.getElementById("fill-enabled-toggle");
const fillColorInput = document.getElementById("fill-color-input");
const fillOpacityInput = document.getElementById("fill-opacity-input");
const styleSwatches = document.getElementById("style-swatches");
const stylePreviewChip = document.getElementById("style-preview-chip");

const calmPalette = [
  "#4aa3ff",
  "#7fb7be",
  "#9fc490",
  "#f2c57c",
  "#d39dbc",
  "#b5b4e3",
  "#6aa9a0",
  "#f5f1e8",
  "#e2e8f0",
  "#9ca3af",
  "#ffffff",
  "#000000",
];

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
  showDimensions: true,
  continuePolyline: true,
  currentStyle: {
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWidth: 2,
    fillEnabled: true,
    fillColor: "#4aa3ff",
    fillOpacity: 0.25,
  },
};

const sharedContext = { canvas, camera, shapeStore, layerStore, historyStore, appState };

const tools = {
  select: new SelectTool(sharedContext),
  "iso-line": new IsoLineTool(sharedContext),
  measure: new MeasureTool(sharedContext),
  polyline: new PolylineTool(sharedContext),
  fill: new FillTool(sharedContext),
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

const renderer = new Renderer({ canvas, ctx: canvasEngine.getContext(), camera, shapeStore, layerStore, appState });

layerStore.createLayer("Layer 1");

function renderStyleSwatches() {
  for (const color of calmPalette) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch", color);
    swatch.title = color;
    swatch.addEventListener("click", () => {
      appState.currentStyle.fillColor = color;
      fillColorInput.value = color;
      refreshStyleUI();
    });
    styleSwatches.appendChild(swatch);
  }
}

function toRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => `${c}${c}`).join("") : value;
  const n = Number.parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function refreshStyleUI() {
  const style = appState.currentStyle;
  strokeColorInput.value = style.strokeColor;
  strokeOpacityInput.value = String(style.strokeOpacity);
  strokeWidthInput.value = String(style.strokeWidth);
  fillEnabledToggle.checked = style.fillEnabled;
  fillColorInput.value = style.fillColor;
  fillOpacityInput.value = String(style.fillOpacity);
  fillColorInput.disabled = !style.fillEnabled;
  fillOpacityInput.disabled = !style.fillEnabled;

  for (const swatch of styleSwatches.querySelectorAll(".swatch")) {
    swatch.classList.toggle("active", swatch.title.toLowerCase() === style.fillColor.toLowerCase());
  }

  const fillColor = style.fillEnabled ? toRgba(style.fillColor, style.fillOpacity) : "transparent";
  stylePreviewChip.style.background = fillColor;
  stylePreviewChip.style.borderColor = toRgba(style.strokeColor, style.strokeOpacity);
}

function getCanvasCenterScreenPoint() {
  const rect = canvas.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
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

let statusMessage = null;
let statusMessageTimeout = null;

function refreshStatus() {
  if (statusMessage) {
    statusEl.textContent = statusMessage;
    return;
  }

  statusEl.textContent = `Mode: ISO | Zoom: ${camera.zoom.toFixed(2)}x | ${getSnapStatusLabel()}`;
}

appState.notifyStatus = (message, durationMs = 1400) => {
  statusMessage = message;
  refreshStatus();
  if (statusMessageTimeout) clearTimeout(statusMessageTimeout);
  statusMessageTimeout = window.setTimeout(() => {
    statusMessage = null;
    statusMessageTimeout = null;
    refreshStatus();
  }, durationMs);
};

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
  if (selectedCount === 0) return;
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

continuePolylineToggle.addEventListener("change", (event) => {
  appState.continuePolyline = event.target.checked;
});

showDimensionsToggle.addEventListener("change", (event) => {
  appState.showDimensions = event.target.checked;
});

strokeColorInput.addEventListener("input", (event) => {
  appState.currentStyle.strokeColor = event.target.value;
  refreshStyleUI();
});

strokeOpacityInput.addEventListener("input", (event) => {
  appState.currentStyle.strokeOpacity = Number.parseFloat(event.target.value);
  refreshStyleUI();
});

strokeWidthInput.addEventListener("change", (event) => {
  appState.currentStyle.strokeWidth = Number.parseInt(event.target.value, 10);
  refreshStyleUI();
});

fillEnabledToggle.addEventListener("change", (event) => {
  appState.currentStyle.fillEnabled = event.target.checked;
  refreshStyleUI();
});

fillColorInput.addEventListener("input", (event) => {
  appState.currentStyle.fillColor = event.target.value;
  refreshStyleUI();
});

fillOpacityInput.addEventListener("input", (event) => {
  appState.currentStyle.fillOpacity = Number.parseFloat(event.target.value);
  refreshStyleUI();
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

renderStyleSwatches();
refreshStyleUI();
setActiveTool("select");
refreshScaleDisplay();
refreshStatus();

function frame() {
  renderer.renderFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
