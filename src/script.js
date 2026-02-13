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
const customBgColorPicker = document.getElementById("custom-bg-color-picker");
const customGridColorPicker = document.getElementById("custom-grid-color-picker");
const themeNameInput = document.getElementById("theme-name-input");
const saveThemeButton = document.getElementById("save-theme-btn");
const deleteThemeButton = document.getElementById("delete-theme-btn");

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

const STORAGE_KEYS = {
  savedThemes: "bp_savedThemes",
  activeThemeId: "bp_activeThemeId",
};

const BUILTIN_THEMES = [
  { id: "builtin:light", name: "Light blueprint", bgColor: "#3e6478", gridColor: "#d0f1ff" },
  { id: "builtin:dark", name: "Dark blueprint", bgColor: "#1a2430", gridColor: "#b3d7ff" },
  { id: "builtin:paper", name: "Paper", bgColor: "#f6f1e4", gridColor: "#1f2937" },
];

let savedThemes = [];

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
  theme: null,
  activeThemeId: "builtin:light",
  currentStyle: {
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWidth: 2,
    fillEnabled: true,
    fillColor: "#4aa3ff",
    fillOpacity: 1,
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
  stylePreviewChip.style.color = toRgba(style.strokeColor, 1);
  stylePreviewChip.style.borderColor = toRgba(style.strokeColor, 0.45);
  strokeChipSwatch.style.background = style.strokeColor;
  fillChipSwatch.style.background = style.fillColor;
  strokeChip.classList.toggle("color-chip--active", activeColorTarget === "primary");
  fillChip.classList.toggle("color-chip--active", activeColorTarget === "secondary");
}


function resetStyleAlphaDefaults() {
  appState.currentStyle.fillOpacity = 1;
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

function isValidHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value || "");
}

function getThemeById(themeId) {
  return BUILTIN_THEMES.find((theme) => theme.id === themeId) || savedThemes.find((theme) => theme.id === themeId) || null;
}

function loadSavedThemes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.savedThemes) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((theme) => theme && theme.id && theme.name && isValidHexColor(theme.bgColor) && isValidHexColor(theme.gridColor))
      .map((theme) => ({
        id: String(theme.id),
        name: String(theme.name),
        bgColor: theme.bgColor,
        gridColor: theme.gridColor,
      }));
  } catch {
    return [];
  }
}

function persistSavedThemes() {
  localStorage.setItem(STORAGE_KEYS.savedThemes, JSON.stringify(savedThemes));
}

function applyTheme(theme, activeThemeId = theme.id) {
  appState.theme = {
    id: theme.id,
    name: theme.name,
    bgColor: theme.bgColor,
    gridColor: theme.gridColor,
  };
  appState.activeThemeId = activeThemeId;

  if (canvasWrap) {
    canvasWrap.style.background = appState.theme.bgColor;
    canvasWrap.style.backgroundImage = "none";
  }

  if (canvasThemeSelect) {
    canvasThemeSelect.value = activeThemeId;
  }
  if (customBgColorPicker) {
    customBgColorPicker.value = appState.theme.bgColor;
  }
  if (customGridColorPicker) {
    customGridColorPicker.value = appState.theme.gridColor;
  }
  if (deleteThemeButton) {
    deleteThemeButton.disabled = !savedThemes.some((themeItem) => themeItem.id === activeThemeId);
  }

  localStorage.setItem(STORAGE_KEYS.activeThemeId, activeThemeId);
}

function populateThemeSelect() {
  if (!canvasThemeSelect) return;
  canvasThemeSelect.textContent = "";

  for (const theme of BUILTIN_THEMES) {
    const option = document.createElement("option");
    option.value = theme.id;
    option.textContent = theme.name;
    canvasThemeSelect.appendChild(option);
  }

  if (savedThemes.length > 0) {
    const savedGroup = document.createElement("optgroup");
    savedGroup.label = "Saved";
    for (const theme of savedThemes) {
      const option = document.createElement("option");
      option.value = theme.id;
      option.textContent = theme.name;
      savedGroup.appendChild(option);
    }
    canvasThemeSelect.appendChild(savedGroup);
  }

  canvasThemeSelect.value = appState.activeThemeId;
}

function saveCurrentTheme() {
  const name = themeNameInput?.value.trim() || "";
  if (!name) {
    appState.notifyStatus?.("Theme name is required");
    return;
  }

  const existingByName = savedThemes.find((theme) => theme.name.toLowerCase() === name.toLowerCase());
  const id = existingByName?.id || `saved:${Date.now()}`;
  const themePreset = {
    id,
    name,
    bgColor: appState.theme.bgColor,
    gridColor: appState.theme.gridColor,
  };

  if (existingByName) {
    savedThemes = savedThemes.map((theme) => (theme.id === existingByName.id ? themePreset : theme));
  } else {
    savedThemes.push(themePreset);
  }

  persistSavedThemes();
  appState.activeThemeId = themePreset.id;
  populateThemeSelect();
  applyTheme(themePreset, themePreset.id);
  appState.notifyStatus?.("Theme saved");
}

function deleteSelectedSavedTheme() {
  const selectedId = appState.activeThemeId;
  const existing = savedThemes.find((theme) => theme.id === selectedId);
  if (!existing) return;

  savedThemes = savedThemes.filter((theme) => theme.id !== selectedId);
  persistSavedThemes();
  const fallbackTheme = BUILTIN_THEMES[0];
  appState.activeThemeId = fallbackTheme.id;
  populateThemeSelect();
  applyTheme(fallbackTheme, fallbackTheme.id);
  appState.notifyStatus?.("Saved theme deleted");
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
  const selectedTheme = getThemeById(event.target.value) || BUILTIN_THEMES[0];
  applyTheme(selectedTheme, selectedTheme.id);
  if (themeNameInput) {
    themeNameInput.value = "";
  }
});

customBgColorPicker?.addEventListener("input", (event) => {
  if (!appState.theme) return;
  appState.theme.bgColor = event.target.value;
  if (canvasWrap) {
    canvasWrap.style.background = appState.theme.bgColor;
    canvasWrap.style.backgroundImage = "none";
  }
});

customGridColorPicker?.addEventListener("input", (event) => {
  if (!appState.theme) return;
  appState.theme.gridColor = event.target.value;
});

saveThemeButton?.addEventListener("click", saveCurrentTheme);
deleteThemeButton?.addEventListener("click", deleteSelectedSavedTheme);

showDimensionsToggle.addEventListener("change", (event) => {
  appState.showDimensions = event.target.checked;
});

strokeWidthInput.addEventListener("input", (event) => {
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
resetStyleAlphaDefaults();
refreshStyleUI();
appState.showGridUnits = localStorage.getItem("showGridUnits") === "1";
savedThemes = loadSavedThemes();
const storedActiveThemeId = localStorage.getItem(STORAGE_KEYS.activeThemeId) || BUILTIN_THEMES[0].id;
const initialTheme = getThemeById(storedActiveThemeId) || BUILTIN_THEMES[0];
appState.activeThemeId = initialTheme.id;
populateThemeSelect();
applyTheme(initialTheme, initialTheme.id);
const debugSnapResetV1 = localStorage.getItem("debugSnapResetV1");
if (debugSnapResetV1 !== "1") {
  localStorage.setItem("debugSnap", "0");
  localStorage.setItem("debugSnapResetV1", "1");
}
appState.debugSnap = localStorage.getItem("debugSnap") === "1";
debugSnapToggle.checked = appState.debugSnap;
showGridUnitsToggle.checked = appState.showGridUnits;
setActiveTool("select");
refreshScaleDisplay();
refreshStatus();

function frame() {
  renderer.renderFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
