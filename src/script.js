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

const canvas = document.getElementById("canvas");
const canvasWrap = document.querySelector(".canvas-wrap");
const statusEl = document.getElementById("status");
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
const showGridUnitsToggle = document.getElementById("show-grid-units-toggle");
const canvasThemeSelect = document.getElementById("canvas-theme-select");
const backgroundTypeSelect = document.getElementById("background-type-select");
const customBackgroundControls = document.getElementById("custom-background-controls");
const customBgModeCss = document.getElementById("custom-bg-mode-css");
const customBgModeImage = document.getElementById("custom-bg-mode-image");
const customBackgroundInput = document.getElementById("custom-background-input");
const customBgColorPicker = document.getElementById("custom-bg-color-picker");
const customGridColorPicker = document.getElementById("custom-grid-color-picker");
const customBgRepeatToggle = document.getElementById("custom-bg-repeat-toggle");
const customBackgroundReset = document.getElementById("custom-background-reset");

const strokeOpacityInput = document.getElementById("stroke-opacity-input");
const strokeWidthInput = document.getElementById("stroke-width-input");
const fillEnabledToggle = document.getElementById("fill-enabled-toggle");
const fillOpacityInput = document.getElementById("fill-opacity-input");
const styleSwatches = document.getElementById("style-swatches");
const stylePreviewChip = document.getElementById("style-preview-chip");
const strokeChip = document.getElementById("stroke-chip");
const fillChip = document.getElementById("fill-chip");
const strokeChipSwatch = document.getElementById("stroke-chip-swatch");
const fillChipSwatch = document.getElementById("fill-chip-swatch");
const paletteColorButton = document.getElementById("palette-color-btn");
const customColorPicker = document.getElementById("customColorPicker");
const recentRow = document.getElementById("recent-row");

const menuSettingsButton = document.getElementById("menuSettingsBtn");
const menuSettingsDropdown = document.getElementById("menuSettingsDropdown");
const menuEditButton = document.getElementById("menuEditBtn");
const menuEditDropdown = document.getElementById("menuEditDropdown");


const calmPalette = [
  "#4aa3ff", "#7fb7be", "#9fc490", "#f2c57c", "#d39dbc", "#b5b4e3",
  "#6aa9a0", "#f5f1e8", "#e2e8f0", "#9ca3af", "#ffffff", "#000000",
  "#db6a8f", "#d9935e", "#d8bf69", "#7eb086", "#62a9b7", "#6e8cd7",
  "#8f8ad5", "#b79bc8", "#e7d6be", "#c5ced9", "#888f99", "#3a3f48",
];

let activeColorTarget = "primary";
let recentColors = [];

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
  debugSnap: false,
  snapDebugStatus: "SNAP: OFF",
  unitName: "ft",
  unitPerCell: 1,
  showDimensions: true,
  continuePolyline: true,
  showGridUnits: false,
  canvasTheme: "light",
  customBackgroundMode: "css",
  customBackgroundValue: "",
  customBackgroundColor: "#0f3b53",
  customGridColor: "#d0f1ff",
  customBackgroundRepeat: true,
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
  canvasWrap,
  camera,
  getTool: () => currentTool,
  onViewChange: refreshStatus,
});

const renderer = new Renderer({
  ctx: canvasEngine.getContext(),
  camera,
  shapeStore,
  layerStore,
  appState,
  getCanvasMetrics: () => canvasEngine.getCanvasMetrics(),
  ensureCanvasSize: () => canvasEngine.resizeCanvasToContainer(),
});

layerStore.createLayer("Layer 1");

function applyColorToTarget(target, color) {
  if (target === "secondary") {
    appState.currentStyle.fillColor = color;
    return;
  }

  appState.currentStyle.strokeColor = color;
}

function applyColorToActiveTarget(color) {
  applyColorToTarget(activeColorTarget, color);
  refreshStyleUI();
}

function addRecentColor(color) {
  recentColors = [color, ...recentColors.filter((recentColor) => recentColor.toLowerCase() !== color.toLowerCase())].slice(0, 8);
  renderRecentColors();
  refreshStyleUI();
}

function renderRecentColors() {
  if (!recentRow) return;
  recentRow.textContent = "";
  for (const color of recentColors) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch", color);
    swatch.title = color;
    swatch.addEventListener("click", () => {
      applyColorToActiveTarget(color);
    });
    recentRow.appendChild(swatch);
  }
}

function renderStyleSwatches() {
  for (const color of calmPalette) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";
    swatch.style.setProperty("--swatch", color);
    swatch.title = color;
    swatch.addEventListener("click", () => {
      applyColorToActiveTarget(color);
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
  strokeOpacityInput.value = String(style.strokeOpacity);
  strokeWidthInput.value = String(style.strokeWidth);
  fillEnabledToggle.checked = style.fillEnabled;
  fillOpacityInput.value = String(style.fillOpacity);
  fillOpacityInput.disabled = !style.fillEnabled;
  customColorPicker.value = activeColorTarget === "secondary" ? style.fillColor : style.strokeColor;

  const activeColor = activeColorTarget === "secondary" ? style.fillColor : style.strokeColor;
  for (const swatch of document.querySelectorAll(".swatch-grid .swatch, .recent-row .swatch")) {
    swatch.classList.toggle("active", swatch.title.toLowerCase() === activeColor.toLowerCase());
  }

  const fillColor = style.fillEnabled ? toRgba(style.fillColor, style.fillOpacity) : "transparent";
  stylePreviewChip.style.background = fillColor;
  stylePreviewChip.style.color = toRgba(style.strokeColor, style.strokeOpacity);
  stylePreviewChip.style.borderColor = toRgba(style.strokeColor, Math.max(style.strokeOpacity * 0.45, 0.22));
  strokeChipSwatch.style.background = style.strokeColor;
  fillChipSwatch.style.background = style.fillColor;
  strokeChip.classList.toggle("color-chip--active", activeColorTarget === "primary");
  fillChip.classList.toggle("color-chip--active", activeColorTarget === "secondary");
}

function getCanvasCenterScreenPoint() {
  const rect = canvas.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

function normalizeToolName(toolName) {
  if (toolName === "isoLine") return "iso-line";
  return toolName;
}

function setActiveTool(toolName) {
  const normalizedToolName = normalizeToolName(toolName);
  if (!tools[normalizedToolName]) return;
  currentTool.onDeactivate();
  currentTool = tools[normalizedToolName];
  currentTool.onActivate();

  document.querySelectorAll('.tool-grid [data-tool]').forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === normalizedToolName);
  });
}

function getSnapStatusLabel() {
  const base = `Snap: Grid ${appState.snapToGrid ? "ON" : "OFF"} | Midpoint ${appState.snapToMidpoints ? "ON" : "OFF"}`;
  if (appState.snapIndicator?.kind && appState.snapIndicator.u !== null && appState.snapIndicator.v !== null) {
    const kindLabel = appState.snapIndicator.kind.toUpperCase();
    return `${base} | SNAP: ${kindLabel} (u=${appState.snapIndicator.u}, v=${appState.snapIndicator.v})`;
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

function setSettingsMenuOpen(open) {
  if (!menuSettingsDropdown || !menuSettingsButton) return;
  menuSettingsDropdown.dataset.open = open ? "true" : "false";
  menuSettingsButton.setAttribute("aria-expanded", open ? "true" : "false");
}

function setEditMenuOpen(open) {
  if (!menuEditDropdown || !menuEditButton) return;
  menuEditDropdown.dataset.open = open ? "true" : "false";
  menuEditButton.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeAllMenus() {
  setSettingsMenuOpen(false);
  setEditMenuOpen(false);
}

function getPresetCanvasBackground(theme) {
  if (theme === "dark") return "#1a2430";
  if (theme === "paper") return "#f6f1e4";
  return "#3e6478";
}

function applyCanvasBackground() {
  if (!canvasWrap) return;

  if (appState.canvasTheme !== "custom") {
    canvasWrap.style.background = getPresetCanvasBackground(appState.canvasTheme);
    canvasWrap.style.backgroundImage = "none";
    canvasWrap.style.backgroundRepeat = "no-repeat";
    canvasWrap.style.backgroundSize = "auto";
    canvasWrap.style.backgroundPosition = "center";
    return;
  }

  const value = appState.customBackgroundValue.trim();
  if (!value) {
    canvasWrap.style.background = appState.customBackgroundColor;
    canvasWrap.style.backgroundImage = "none";
    canvasWrap.style.backgroundRepeat = "no-repeat";
    canvasWrap.style.backgroundSize = "auto";
    canvasWrap.style.backgroundPosition = "center";
    return;
  }

  if (appState.customBackgroundMode === "image") {
    canvasWrap.style.background = "transparent";
    canvasWrap.style.backgroundImage = `url("${value}")`;
    canvasWrap.style.backgroundRepeat = appState.customBackgroundRepeat ? "repeat" : "no-repeat";
    canvasWrap.style.backgroundSize = appState.customBackgroundRepeat ? "auto" : "cover";
    canvasWrap.style.backgroundPosition = "center";
    return;
  }

  canvasWrap.style.background = value;
  canvasWrap.style.backgroundImage = "none";
  canvasWrap.style.backgroundRepeat = "no-repeat";
  canvasWrap.style.backgroundSize = "auto";
  canvasWrap.style.backgroundPosition = "center";
}

function refreshCanvasThemeUI() {
  if (canvasThemeSelect) {
    canvasThemeSelect.value = appState.canvasTheme;
  }
  if (backgroundTypeSelect) {
    backgroundTypeSelect.value = appState.canvasTheme === "custom" ? "custom" : "preset";
  }
  const isCustom = appState.canvasTheme === "custom";
  if (customBackgroundControls) {
    customBackgroundControls.hidden = !isCustom;
  }
  if (customBgModeCss) {
    customBgModeCss.checked = appState.customBackgroundMode === "css";
  }
  if (customBgModeImage) {
    customBgModeImage.checked = appState.customBackgroundMode === "image";
  }
  if (customBackgroundInput) {
    customBackgroundInput.value = appState.customBackgroundValue;
    customBackgroundInput.placeholder = appState.customBackgroundMode === "image"
      ? "https://example.com/mytexture.png"
      : "#0f3b53\nlinear-gradient(180deg, #0f3b53 0%, #0a2b3d 100%)";
  }
  if (customBgColorPicker) {
    customBgColorPicker.value = appState.customBackgroundColor;
  }
  if (customGridColorPicker) {
    customGridColorPicker.value = appState.customGridColor;
  }
  if (customBgRepeatToggle) {
    customBgRepeatToggle.checked = appState.customBackgroundRepeat;
    customBgRepeatToggle.disabled = !isCustom || appState.customBackgroundMode !== "image";
  }
}

function persistCanvasThemeState() {
  localStorage.setItem("canvasTheme", appState.canvasTheme);
  localStorage.setItem("customBackgroundMode", appState.customBackgroundMode);
  localStorage.setItem("customBackgroundValue", appState.customBackgroundValue);
  localStorage.setItem("customBackgroundColor", appState.customBackgroundColor);
  localStorage.setItem("customGridColor", appState.customGridColor);
  localStorage.setItem("customBackgroundRepeat", appState.customBackgroundRepeat ? "1" : "0");
}

for (const button of document.querySelectorAll('.tool-grid [data-tool]')) {
  button.addEventListener("click", () => setActiveTool(button.dataset.tool));
}

menuSettingsButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  setEditMenuOpen(false);
  setSettingsMenuOpen(menuSettingsDropdown?.dataset.open !== "true");
});

menuEditButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  setSettingsMenuOpen(false);
  setEditMenuOpen(menuEditDropdown?.dataset.open !== "true");
});

menuSettingsDropdown?.addEventListener("click", (event) => {
  event.stopPropagation();
});

menuEditDropdown?.addEventListener("click", (event) => {
  event.stopPropagation();
});

document.addEventListener("click", () => {
  closeAllMenus();
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
  localStorage.setItem("debugSnap", appState.debugSnap ? "1" : "0");
  localStorage.setItem("debugSnapResetV1", "1");
});

continuePolylineToggle.addEventListener("change", (event) => {
  appState.continuePolyline = event.target.checked;
});

showGridUnitsToggle.addEventListener("change", (event) => {
  appState.showGridUnits = event.target.checked;
  localStorage.setItem("showGridUnits", appState.showGridUnits ? "1" : "0");
});

canvasThemeSelect?.addEventListener("change", (event) => {
  const nextTheme = event.target.value;
  appState.canvasTheme = ["light", "dark", "paper", "custom"].includes(nextTheme) ? nextTheme : "light";
  if (appState.canvasTheme !== "custom") {
    appState.customBackgroundValue = "";
  }
  refreshCanvasThemeUI();
  applyCanvasBackground();
  persistCanvasThemeState();
});

backgroundTypeSelect?.addEventListener("change", (event) => {
  const isCustom = event.target.value === "custom";
  appState.canvasTheme = isCustom ? "custom" : "light";
  if (!isCustom) {
    appState.customBackgroundValue = "";
  }
  refreshCanvasThemeUI();
  applyCanvasBackground();
  persistCanvasThemeState();
});

customBgModeCss?.addEventListener("change", () => {
  if (!customBgModeCss.checked) return;
  appState.customBackgroundMode = "css";
  refreshCanvasThemeUI();
  applyCanvasBackground();
  persistCanvasThemeState();
});

customBgModeImage?.addEventListener("change", () => {
  if (!customBgModeImage.checked) return;
  appState.customBackgroundMode = "image";
  refreshCanvasThemeUI();
  applyCanvasBackground();
  persistCanvasThemeState();
});

customBackgroundInput?.addEventListener("input", (event) => {
  appState.customBackgroundValue = event.target.value;
  const trimmedValue = event.target.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmedValue)) {
    appState.customBackgroundColor = trimmedValue;
  }
  applyCanvasBackground();
  refreshCanvasThemeUI();
  persistCanvasThemeState();
});


customBgColorPicker?.addEventListener("input", (event) => {
  appState.canvasTheme = "custom";
  appState.customBackgroundMode = "css";
  appState.customBackgroundColor = event.target.value;
  if (!appState.customBackgroundValue.trim()) {
    appState.customBackgroundValue = event.target.value;
  }
  refreshCanvasThemeUI();
  applyCanvasBackground();
  persistCanvasThemeState();
});

customGridColorPicker?.addEventListener("input", (event) => {
  appState.canvasTheme = "custom";
  appState.customGridColor = event.target.value;
  refreshCanvasThemeUI();
  applyCanvasBackground();
  persistCanvasThemeState();
});

customBgRepeatToggle?.addEventListener("change", (event) => {
  appState.customBackgroundRepeat = event.target.checked;
  applyCanvasBackground();
  persistCanvasThemeState();
});

customBackgroundReset?.addEventListener("click", () => {
  appState.canvasTheme = "light";
  appState.customBackgroundMode = "css";
  appState.customBackgroundValue = "";
  appState.customBackgroundColor = "#0f3b53";
  appState.customGridColor = "#d0f1ff";
  appState.customBackgroundRepeat = true;
  refreshCanvasThemeUI();
  applyCanvasBackground();
  persistCanvasThemeState();
});

showDimensionsToggle.addEventListener("change", (event) => {
  appState.showDimensions = event.target.checked;
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

fillOpacityInput.addEventListener("input", (event) => {
  appState.currentStyle.fillOpacity = Number.parseFloat(event.target.value);
  refreshStyleUI();
});

strokeChip?.addEventListener("click", () => {
  activeColorTarget = "primary";
  refreshStyleUI();
});

fillChip?.addEventListener("click", () => {
  activeColorTarget = "secondary";
  refreshStyleUI();
});

paletteColorButton?.addEventListener("click", () => {
  customColorPicker?.click();
});

customColorPicker?.addEventListener("input", (event) => {
  const color = event.target.value;
  applyColorToActiveTarget(color);
  addRecentColor(color);
});

unitPerCellInput.addEventListener("input", (event) => {
  const value = Number.parseFloat(event.target.value);
  if (Number.isFinite(value) && value > 0) {
    appState.unitPerCell = value;
    refreshScaleDisplay();
  }
});

unitNameInput.addEventListener("change", (event) => {
  appState.unitName = event.target.value || "ft";
  refreshScaleDisplay();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAllMenus();
  }

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
renderRecentColors();
refreshStyleUI();
appState.showGridUnits = localStorage.getItem("showGridUnits") === "1";
const storedCanvasTheme = localStorage.getItem("canvasTheme");
if (["light", "dark", "paper", "custom"].includes(storedCanvasTheme)) {
  appState.canvasTheme = storedCanvasTheme;
}
const storedCustomBackgroundMode = localStorage.getItem("customBackgroundMode");
if (storedCustomBackgroundMode === "css" || storedCustomBackgroundMode === "image") {
  appState.customBackgroundMode = storedCustomBackgroundMode;
}
const storedCustomBackgroundValue = localStorage.getItem("customBackgroundValue");
if (typeof storedCustomBackgroundValue === "string") {
  appState.customBackgroundValue = storedCustomBackgroundValue;
}
const storedCustomBackgroundColor = localStorage.getItem("customBackgroundColor");
if (typeof storedCustomBackgroundColor === "string" && /^#[0-9a-fA-F]{6}$/.test(storedCustomBackgroundColor)) {
  appState.customBackgroundColor = storedCustomBackgroundColor;
}
const storedCustomGridColor = localStorage.getItem("customGridColor");
if (typeof storedCustomGridColor === "string" && /^#[0-9a-fA-F]{6}$/.test(storedCustomGridColor)) {
  appState.customGridColor = storedCustomGridColor;
}
appState.customBackgroundRepeat = localStorage.getItem("customBackgroundRepeat") !== "0";
const debugSnapResetV1 = localStorage.getItem("debugSnapResetV1");
if (debugSnapResetV1 !== "1") {
  localStorage.setItem("debugSnap", "0");
  localStorage.setItem("debugSnapResetV1", "1");
}
appState.debugSnap = localStorage.getItem("debugSnap") === "1";
debugSnapToggle.checked = appState.debugSnap;
showGridUnitsToggle.checked = appState.showGridUnits;
if (canvasThemeSelect) {
  canvasThemeSelect.value = appState.canvasTheme;
}
refreshCanvasThemeUI();
applyCanvasBackground();
setActiveTool("select");
refreshScaleDisplay();
refreshStatus();

function frame() {
  renderer.renderFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
