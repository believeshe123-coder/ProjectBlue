import { CanvasEngine } from "./core/canvasEngine.js";
import { Camera } from "./core/camera.js";
import { Renderer } from "./core/renderer.js";
import { HistoryStore } from "./state/history.js";
import { ShapeStore } from "./state/shapeStore.js";
import { IsoLineTool } from "./tools/isoLineTool.js";
import { SelectTool } from "./tools/selectTool.js";
import { MeasureTool } from "./tools/measureTool.js";
import { PolylineTool } from "./tools/polylineTool.js";
import { EraseTool } from "./tools/eraseTool.js";
import { FillTool } from "./tools/fillTool.js";
import { GroupShape } from "./models/groupShape.js";

const canvas = document.getElementById("canvas");
const canvasWrap = document.querySelector(".canvas-wrap");
const statusEl = document.getElementById("status");
const undoButton = document.getElementById("undo-btn");
const redoButton = document.getElementById("redo-btn");
const closeShapeButton = document.getElementById("close-shape-btn");
const eraseModeToggle = document.getElementById("erase-mode-toggle");
const eraserSizeInput = document.getElementById("eraser-size-input");
const eraserSizeDisplay = document.getElementById("eraser-size-display");
const snapGridToggle = document.getElementById("snap-grid-toggle");
const snapMidToggle = document.getElementById("snap-mid-toggle");
const debugSnapToggle = document.getElementById("debug-snap-toggle");
const unitPerCellInput = document.getElementById("unit-per-cell");
const unitNameInput = document.getElementById("unit-name");
const scaleDisplay = document.getElementById("scale-display");
const measurementModeToggle = document.getElementById("measurement-mode-toggle");
const continuePolylineToggle = document.getElementById("continue-polyline-toggle");
const showGridUnitsToggle = document.getElementById("show-grid-units-toggle");
const canvasThemeSelect = document.getElementById("canvas-theme-select");
const customBgColorPicker = document.getElementById("custom-bg-color-picker");
const customGridColorPicker = document.getElementById("custom-grid-color-picker");
const themeNameInput = document.getElementById("theme-name-input");
const saveThemeButton = document.getElementById("save-theme-btn");
const deleteThemeButton = document.getElementById("delete-theme-btn");

const strokeWidthInput = document.getElementById("stroke-width-input");
const styleSwatches = document.getElementById("style-swatches");
const paletteColorButton = document.getElementById("palette-color-btn");
const customColorPicker = document.getElementById("customColorPicker");
const fillColorPicker = document.getElementById("fill-color-picker");
const fillOpacityInput = document.getElementById("fill-opacity-input");
const fillOpacityDisplay = document.getElementById("fill-opacity-display");
const recentRow = document.getElementById("recent-row");
const selectionCountEl = document.getElementById("selection-count");
const selectionPanel = document.getElementById("selection-panel");
const selectionLineColor = document.getElementById("selection-line-color");
const selectionStrokeWidth = document.getElementById("selection-stroke-width");
const selectionFillColor = document.getElementById("selection-fill-color");
const saveGroupButton = document.getElementById("save-group-btn");
const selectionBar = document.getElementById("selection-bar");
const selectionBarCountEl = document.getElementById("selection-bar-count");
const selectionKeepCheckbox = document.getElementById("selection-keep-checkbox");
const selectionDoneButton = document.getElementById("selection-done-btn");
const selectionClearButton = document.getElementById("selection-clear-btn");
const selectionDeleteButton = document.getElementById("selection-delete-btn");
const selectionGroupButton = document.getElementById("selection-group-btn");
const selectionUngroupButton = document.getElementById("selection-ungroup-btn");

const menuFileButton = document.getElementById("menuFileBtn");
const menuFileDropdown = document.getElementById("menuFileDropdown");
const projectSaveButton = document.getElementById("project-save-btn");
const projectLoadButton = document.getElementById("project-load-btn");
const projectLoadInput = document.getElementById("project-load-input");
const projectResetButton = document.getElementById("project-reset-btn");

const menuSettingsButton = document.getElementById("menuSettingsBtn");
const menuSettingsDropdown = document.getElementById("menuSettingsDropdown");
const menuEditButton = document.getElementById("menuEditBtn");
const menuEditDropdown = document.getElementById("menuEditDropdown");
const clearGroupsButton = document.getElementById("clear-groups-btn");


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
  autosaveProject: "bp_autosave_project",
};

const BUILTIN_THEMES = [
  { id: "builtin:light", name: "Light blueprint", bgColor: "#3e6478", gridColor: "#d0f1ff" },
  { id: "builtin:dark", name: "Dark blueprint", bgColor: "#1a2430", gridColor: "#b3d7ff" },
  { id: "builtin:paper", name: "Paper", bgColor: "#f6f1e4", gridColor: "#1f2937" },
];

let savedThemes = [];

const camera = new Camera();
const shapeStore = new ShapeStore();
const historyStore = new HistoryStore();

const appState = {
  activeTool: "select",
  currentMode: "ISO",
  previewShape: null,
  snapIndicator: null,
  snapToGrid: true,
  snapToMidpoints: true,
  debugSnap: false,
  debugFillWorkflow: false,
  snapDebugStatus: "SNAP: OFF",
  unitName: "ft",
  unitPerCell: 1,
  measurementMode: "smart",
  continuePolyline: true,
  showGridUnits: false,
  selectionSet: new Set(),
  selectedIds: [],
  keepSelecting: false,
  lastSelectedId: null,
  marqueeRect: null,
  selectionPanelOpen: false,
  eraseMode: "object",
  eraserSizePx: 16,
  erasePreview: null,
  deleteSourceLinesOnPolygonDelete: false,
  theme: null,
  activeThemeId: "builtin:light",
  currentStyle: {
    strokeColor: "#ffffff",
    strokeOpacity: 1,
    strokeWidth: 2,
    fillColor: "#4aa3ff",
    fillOpacity: 1,
  },
};

const sharedContext = { canvas, camera, shapeStore, historyStore, appState, pushHistoryState: () => pushHistoryState() };

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
  getToolName: () => getCurrentToolName(),
  onViewChange: refreshStatus,
});

const renderer = new Renderer({
  ctx: canvasEngine.getContext(),
  camera,
  shapeStore,
  appState,
  getCanvasMetrics: () => canvasEngine.getCanvasMetrics(),
  ensureCanvasSize: () => canvasEngine.resizeCanvasToContainer(),
});


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

function applySampledColor(target, color) {
  applyColorToTarget(target, color);
  activeColorTarget = target;
  addRecentColor(color);
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
      appState.currentStyle.strokeColor = color;
  refreshStyleUI();
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
      appState.currentStyle.strokeColor = color;
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
  strokeWidthInput.value = String(style.strokeWidth);
  customColorPicker.value = style.strokeColor;
  if (fillColorPicker) fillColorPicker.value = style.fillColor;
  if (fillOpacityInput) fillOpacityInput.value = String(style.fillOpacity ?? 1);
  if (fillOpacityDisplay) fillOpacityDisplay.textContent = Number(style.fillOpacity ?? 1).toFixed(2);

  for (const swatch of document.querySelectorAll(".swatch-grid .swatch, .recent-row .swatch")) {
    swatch.classList.toggle("active", swatch.title.toLowerCase() === style.strokeColor.toLowerCase());
  }
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

function normalizeMeasurementMode(mode) {
  return ["on", "smart", "off"].includes(mode) ? mode : "smart";
}

function getNextMeasurementMode(mode) {
  if (mode === "on") return "smart";
  if (mode === "smart") return "off";
  return "on";
}

function updateMeasurementModeControl() {
  if (!measurementModeToggle) return;
  measurementModeToggle.textContent = `Measurements: ${appState.measurementMode.toUpperCase()}`;
}

function getNextEraseMode(mode) {
  return mode === "object" ? "segment" : "object";
}

function updateEraseControls() {
  if (eraseModeToggle) {
    eraseModeToggle.textContent = `Erase: ${appState.eraseMode === "object" ? "Object" : "Segment"}`;
  }
  if (eraserSizeInput) {
    eraserSizeInput.value = String(appState.eraserSizePx);
  }
  if (eraserSizeDisplay) {
    eraserSizeDisplay.textContent = `${appState.eraserSizePx}px`;
  }
}

function toggleEraseMode() {
  appState.eraseMode = getNextEraseMode(appState.eraseMode);
  localStorage.setItem("eraseMode", appState.eraseMode);
  updateEraseControls();
}

function setActiveTool(toolName) {
  const normalizedToolName = normalizeToolName(toolName);
  if (!tools[normalizedToolName]) return;
  currentTool.onDeactivate();
  currentTool = tools[normalizedToolName];
  appState.activeTool = normalizedToolName;
  currentTool.onActivate();

  if (normalizedToolName === "fill") {
    console.log("[UI] Fill button clicked -> activating fill tool");
  }

  document.querySelectorAll('.tool-grid [data-tool]').forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === normalizedToolName);
  });
  refreshStatus();
  updateSelectionBar();
}

function getCurrentToolName() {
  return appState.activeTool ?? "select";
}

function getToolStatusLabel() {
  const toolName = getCurrentToolName();
  if (toolName === "iso-line") return "Line";
  return toolName.charAt(0).toUpperCase() + toolName.slice(1);
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
let busyStatusMessage = null;

function refreshStatus() {
  if (busyStatusMessage) {
    statusEl.textContent = busyStatusMessage;
    return;
  }

  if (statusMessage) {
    statusEl.textContent = statusMessage;
    return;
  }

  const polygonCount = shapeStore.getShapes().filter((shape) => shape.type === "polygon" && shape.visible !== false).length;
  statusEl.textContent = `Mode: ISO | Tool: ${getToolStatusLabel()} | Zoom: ${camera.zoom.toFixed(2)}x | polygons: ${polygonCount} | ${getSnapStatusLabel()}`;
}

appState.setSelection = setSelection;
appState.addToSelection = addToSelection;
appState.removeFromSelection = removeFromSelection;
appState.clearSelection = clearSelectionState;

function openSelectionPanel(screenPoint) {
  if (!selectionPanel) return;
  selectionPanel.hidden = false;
  appState.selectionPanelOpen = true;
  if (screenPoint) {
    selectionPanel.style.left = `${Math.max(12, screenPoint.x + 12)}px`;
    selectionPanel.style.top = `${Math.max(36, screenPoint.y + 12)}px`;
    selectionPanel.style.right = "auto";
  }
}

function closeSelectionPanel() {
  if (!selectionPanel) return;
  selectionPanel.hidden = true;
  appState.selectionPanelOpen = false;
}

appState.openSelectionPanel = openSelectionPanel;
appState.closeSelectionPanel = closeSelectionPanel;

appState.applySampledColor = applySampledColor;

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

appState.setBusyStatus = (message) => {
  busyStatusMessage = message;
  refreshStatus();
};

appState.clearBusyStatus = () => {
  busyStatusMessage = null;
  refreshStatus();
};

function normalizeShapePayload(shapes = []) {
  if (!Array.isArray(shapes)) return [];
  return shapes.map((shape) => {
    if (!shape || typeof shape !== "object") return shape;
    const { layerId, ...rest } = shape;
    return rest;
  });
}

function getSnapshot() {
  return {
    shapes: shapeStore.serialize().map(({ layerId, ...shape }) => shape),
    selectedIds: [...appState.selectedIds],
    keepSelecting: appState.keepSelecting === true,
  };
}

function applySnapshot(snapshot) {
  if (!snapshot) return;

  if (Array.isArray(snapshot)) {
    shapeStore.replaceFromSerialized(normalizeShapePayload(snapshot));
    return;
  }

  shapeStore.replaceFromSerialized(normalizeShapePayload(snapshot.shapes ?? []));
  appState.keepSelecting = snapshot.keepSelecting === true;
}

function pushHistoryState() {
  historyStore.pushState(getSnapshot());
}

function undo() {
  const previous = historyStore.undo(getSnapshot());
  if (!previous) return;
  applySnapshot(previous);
  appState.previewShape = null;
  clearSelectionState();
}

function redo() {
  const next = historyStore.redo(getSnapshot());
  if (!next) return;
  applySnapshot(next);
  appState.previewShape = null;
  clearSelectionState();
}

function zoomBy(factor) {
  camera.zoomAt(getCanvasCenterScreenPoint(), factor);
  refreshStatus();
}

function clearAutosaveProject() {
  if (autosaveTimeout) {
    clearTimeout(autosaveTimeout);
    autosaveTimeout = null;
  }
  autosaveSignature = "";
  pendingAutosaveSignature = "";
  localStorage.removeItem(STORAGE_KEYS.autosaveProject);
}

function resetProject() {
  const confirmed = window.confirm("Reset project? This will erase all shapes and settings.");
  if (!confirmed) {
    return;
  }

  shapeStore.clear();
  camera.resetView();
  setActiveTool("select");
  historyStore.undoStack = [];
  historyStore.redoStack = [];
  appState.previewShape = null;
  appState.snapIndicator = null;
  clearSelectionState();
  clearAutosaveProject();
  appState.notifyStatus?.("Project reset", 1600);
}

function isShapeInteractive(shape) {
  return !!shape && shape.visible !== false && shape.locked !== true;
}

function canGroupSelection() {
  if (appState.selectedIds.length < 2) return false;
  for (const id of appState.selectedIds) {
    const shape = shapeStore.getShapeById(id);
    if (!shape || shape.type === "group" || shape.groupId) return false;
  }
  return true;
}

function isSingleSelectedGroup() {
  if (appState.selectedIds.length !== 1) return false;
  const shape = shapeStore.getShapeById(appState.selectedIds[0]);
  return shape?.type === "group";
}

function updateSelectionBar() {
  if (!selectionBar) return;
  const shouldShow = getCurrentToolName() === "select" && appState.selectedIds.length > 0;
  selectionBar.hidden = !shouldShow;
  if (selectionBarCountEl) selectionBarCountEl.textContent = `Selection (${appState.selectedIds.length})`;
  if (selectionKeepCheckbox) selectionKeepCheckbox.checked = appState.keepSelecting === true;
  if (selectionGroupButton) selectionGroupButton.disabled = !canGroupSelection();
  if (selectionUngroupButton) selectionUngroupButton.hidden = !isSingleSelectedGroup();
  if (selectionUngroupButton) selectionUngroupButton.disabled = !isSingleSelectedGroup();
}

function updateSelectedFlags() {
  const ids = appState.selectionSet;
  for (const shape of shapeStore.getShapes()) {
    shape.selected = ids.has(shape.id);
  }
  const count = ids.size;
  selectionCountEl.textContent = count > 0 ? `${count} selected` : "";
  if (count === 0) closeSelectionPanel();
  updateSelectionBar();
}

function setSelection(ids = [], lastId = null) {
  appState.selectedIds = [...ids];
  appState.selectionSet = new Set(ids);
  appState.lastSelectedId = lastId;
  updateSelectedFlags();
}

function addToSelection(id) {
  if (!appState.selectionSet.has(id)) appState.selectedIds.push(id);
  appState.selectionSet.add(id);
  appState.lastSelectedId = id;
  updateSelectedFlags();
}

function removeFromSelection(id) {
  appState.selectedIds = appState.selectedIds.filter((selectedId) => selectedId !== id);
  appState.selectionSet.delete(id);
  if (appState.lastSelectedId === id) appState.lastSelectedId = null;
  updateSelectedFlags();
}

function clearSelectionState() {
  appState.selectedIds = [];
  appState.selectionSet = new Set();
  appState.lastSelectedId = null;
  shapeStore.clearSelection();
  updateSelectedFlags();
}

function getSelectedShapes() {
  return appState.selectedIds.map((id) => shapeStore.getShapeById(id)).filter(Boolean);
}

function getSelectedMeasurableShape() {
  if (appState.selectionSet.size !== 1) return null;
  const shape = shapeStore.getShapeById(appState.lastSelectedId) || getSelectedShapes()[0] || null;
  return (shape && (shape.type === "line" || shape.type === "polygon")) ? shape : null;
}

function deleteSelection() {
  const selectedShapes = getSelectedShapes();
  if (!selectedShapes.length) return;
  pushHistoryState();
  for (const selectedShape of selectedShapes) {
    if (selectedShape.type === "group") {
      shapeStore.removeShape(selectedShape.id);
      continue;
    }
    if (selectedShape.type === "polygon" && appState.deleteSourceLinesOnPolygonDelete && Array.isArray(selectedShape.sourceLineIds)) {
      for (const lineId of selectedShape.sourceLineIds) shapeStore.removeShape(lineId);
    }
    shapeStore.removeShape(selectedShape.id);
  }
  clearSelectionState();
}


function applyToSelected(updater) {
  const selectedShapes = getSelectedShapes();
  if (!selectedShapes.length) return;
  for (const shape of selectedShapes) updater(shape);
}

function createGroupFromSelection() {
  const selectedShapes = getSelectedShapes();
  if (!canGroupSelection()) return;
  pushHistoryState();
  const childIds = selectedShapes.map((shape) => shape.id);
  const group = new GroupShape({
    strokeColor: "#ffffff",
    strokeWidth: 1,
    fillColor: appState.currentStyle.fillColor,
    childIds,
  });
  shapeStore.addShape(group);
  for (const shape of selectedShapes) {
    shape.groupId = group.id;
    shape.selected = false;
  }
  setSelection([group.id], group.id);
  appState.keepSelecting = false;
}

function ungroupSelection() {
  if (!isSingleSelectedGroup()) return;
  const group = shapeStore.getShapeById(appState.selectedIds[0]);
  if (!group || group.type !== "group") return;
  pushHistoryState();
  shapeStore.removeShape(group.id);
  clearSelectionState();
}

function clearAllGroups() {
  const groups = shapeStore.getShapes().filter((shape) => shape.type === "group");
  if (!groups.length) return;
  pushHistoryState();
  shapeStore.clearAllGroups();
  appState.keepSelecting = false;
  clearSelectionState();
}

function buildProjectData() {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    settings: {
      unitPerGrid: appState.unitPerCell,
      unit: appState.unitName,
      snapGrid: appState.snapToGrid,
      snapMidpoint: appState.snapToMidpoints,
      measurementMode: appState.measurementMode,
      showGridUnits: appState.showGridUnits,
      lastTool: getCurrentToolName(),
      eraseMode: appState.eraseMode,
      eraserSizePx: appState.eraserSizePx,
      fillOpacity: appState.currentStyle.fillOpacity,
    },
    themes: {
      builtInSelectedId: appState.activeThemeId,
      savedThemes: savedThemes,
    },
    shapes: shapeStore.serialize(),
  };
}

function updateControlsFromState() {
  unitPerCellInput.value = String(appState.unitPerCell);
  unitNameInput.value = appState.unitName;
  snapGridToggle.checked = appState.snapToGrid;
  snapMidToggle.checked = appState.snapToMidpoints;
  updateMeasurementModeControl();
  showGridUnitsToggle.checked = appState.showGridUnits;
  refreshScaleDisplay();
  updateEraseControls();
  refreshStatus();
}

function applyProjectData(project, { announce = true } = {}) {
  if (!project || !Array.isArray(project.shapes)) {
    throw new Error("Unsupported project file");
  }

  const settings = project.settings ?? {};
  appState.unitPerCell = Number.isFinite(settings.unitPerGrid) && settings.unitPerGrid > 0 ? settings.unitPerGrid : 1;
  appState.unitName = typeof settings.unit === "string" && settings.unit ? settings.unit : "ft";
  appState.snapToGrid = settings.snapGrid !== false;
  appState.snapToMidpoints = settings.snapMidpoint !== false;
  appState.measurementMode = normalizeMeasurementMode(settings.measurementMode ?? (settings.smartMeasurements === false ? "off" : "smart"));
  appState.showGridUnits = settings.showGridUnits === true;
  appState.eraseMode = settings.eraseMode === "segment" ? "segment" : "object";
  appState.eraserSizePx = Number.isFinite(settings.eraserSizePx) ? Math.min(40, Math.max(6, settings.eraserSizePx)) : 16;
  appState.currentStyle.fillOpacity = Number.isFinite(settings.fillOpacity)
    ? Math.max(0, Math.min(1, settings.fillOpacity))
    : 1;

  const loadedThemes = project.themes?.savedThemes;
  savedThemes = Array.isArray(loadedThemes) ? loadedThemes.filter((theme) => (
    theme && theme.id && theme.name && isValidHexColor(theme.bgColor) && isValidHexColor(theme.gridColor)
  )) : [];
  persistSavedThemes();

  const selectedThemeId = project.themes?.builtInSelectedId;
  const fallbackTheme = getThemeById(selectedThemeId) || BUILTIN_THEMES[0];
  appState.activeThemeId = fallbackTheme.id;
  populateThemeSelect();
  applyTheme(fallbackTheme, fallbackTheme.id);

  shapeStore.replaceFromSerialized(normalizeShapePayload(project.shapes));

  historyStore.undoStack = [];
  historyStore.redoStack = [];
  appState.previewShape = null;
  clearSelectionState();
  const toolName = normalizeToolName(settings.lastTool || "select");
  setActiveTool(tools[toolName] ? toolName : "select");

  localStorage.setItem("showGridUnits", appState.showGridUnits ? "1" : "0");
  localStorage.setItem("measurementMode", appState.measurementMode);
  localStorage.setItem("debugSnap", appState.debugSnap ? "1" : "0");
  localStorage.setItem("eraseMode", appState.eraseMode);
  localStorage.setItem("eraserSizePx", String(appState.eraserSizePx));
  updateControlsFromState();

  if (announce) {
    appState.notifyStatus?.("Project loaded");
  }
}

function saveProjectToFile() {
  const data = JSON.stringify(buildProjectData(), null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "blueprint-project.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  appState.notifyStatus?.("Project saved");
}

function loadProjectFromText(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    appState.notifyStatus?.("Failed to parse project JSON", 2200);
    return;
  }

  try {
    applyProjectData(parsed);
  } catch {
    appState.notifyStatus?.("Invalid project schema", 2200);
  }
}

function handleProjectFileLoad(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadProjectFromText(String(reader.result || ""));
  reader.onerror = () => appState.notifyStatus?.("Failed to read project file", 2200);
  reader.readAsText(file);
}

let autosaveTimeout = null;
let autosaveSignature = "";
let pendingAutosaveSignature = "";

function queueAutosave() {
  const serialized = JSON.stringify(buildProjectData());
  if (serialized === autosaveSignature || serialized === pendingAutosaveSignature) {
    return;
  }

  pendingAutosaveSignature = serialized;

  if (autosaveTimeout) {
    clearTimeout(autosaveTimeout);
  }

  autosaveTimeout = window.setTimeout(() => {
    autosaveSignature = pendingAutosaveSignature;
    pendingAutosaveSignature = "";
    localStorage.setItem(STORAGE_KEYS.autosaveProject, autosaveSignature);
    autosaveTimeout = null;
  }, 500);
}

function restoreAutosaveIfAvailable() {
  const serialized = localStorage.getItem(STORAGE_KEYS.autosaveProject);
  if (!serialized) {
    return false;
  }

  try {
    const parsed = JSON.parse(serialized);
    applyProjectData(parsed, { announce: false });
    autosaveSignature = serialized;
    pendingAutosaveSignature = "";
    appState.notifyStatus?.("Restored last session", 1800);
    return true;
  } catch {
    localStorage.removeItem(STORAGE_KEYS.autosaveProject);
    return false;
  }
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

function setFileMenuOpen(open) {
  if (!menuFileDropdown || !menuFileButton) return;
  menuFileDropdown.dataset.open = open ? "true" : "false";
  menuFileButton.setAttribute("aria-expanded", open ? "true" : "false");
}

function closeAllMenus() {
  setFileMenuOpen(false);
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
  button.addEventListener("click", () => {
    setActiveTool(button.dataset.tool);
  });
}

menuFileButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  setSettingsMenuOpen(false);
  setEditMenuOpen(false);
  setFileMenuOpen(menuFileDropdown?.dataset.open !== "true");
});

menuFileDropdown?.addEventListener("click", (event) => {
  event.stopPropagation();
});

projectSaveButton?.addEventListener("click", () => {
  saveProjectToFile();
  closeAllMenus();
});

projectLoadButton?.addEventListener("click", () => {
  projectLoadInput?.click();
});

projectResetButton?.addEventListener("click", () => {
  resetProject();
  closeAllMenus();
});

projectLoadInput?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  handleProjectFileLoad(file);
  event.target.value = "";
  closeAllMenus();
});

menuSettingsButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  setEditMenuOpen(false);
  setFileMenuOpen(false);
  setSettingsMenuOpen(menuSettingsDropdown?.dataset.open !== "true");
});

menuEditButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  setSettingsMenuOpen(false);
  setFileMenuOpen(false);
  setEditMenuOpen(menuEditDropdown?.dataset.open !== "true");
});

menuSettingsDropdown?.addEventListener("click", (event) => {
  event.stopPropagation();
});

menuEditDropdown?.addEventListener("click", (event) => {
  event.stopPropagation();
});

clearGroupsButton?.addEventListener("click", () => {
  clearAllGroups();
  closeAllMenus();
});

document.addEventListener("click", () => {
  closeAllMenus();
});


undoButton.addEventListener("click", undo);
redoButton.addEventListener("click", redo);
closeShapeButton?.addEventListener("click", () => {
  tools.polyline.closeShapeNow?.();
});

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

measurementModeToggle?.addEventListener("click", () => {
  appState.measurementMode = getNextMeasurementMode(appState.measurementMode);
  localStorage.setItem("measurementMode", appState.measurementMode);
  updateMeasurementModeControl();
});

eraseModeToggle?.addEventListener("click", () => {
  toggleEraseMode();
});

eraserSizeInput?.addEventListener("input", (event) => {
  const value = Number.parseInt(event.target.value, 10);
  appState.eraserSizePx = Number.isFinite(value) ? Math.min(40, Math.max(6, value)) : 16;
  localStorage.setItem("eraserSizePx", String(appState.eraserSizePx));
  updateEraseControls();
});

strokeWidthInput.addEventListener("input", (event) => {
  appState.currentStyle.strokeWidth = Number.parseInt(event.target.value, 10);
  refreshStyleUI();
});

strokeWidthInput.addEventListener("change", (event) => {
  const value = Number.parseInt(event.target.value, 10);
  if (!Number.isFinite(value)) return;
  pushHistoryState();
  appState.currentStyle.strokeWidth = value;
  applyToSelected((shape) => { if ("strokeWidth" in shape) shape.strokeWidth = value; });
  refreshStyleUI();
});

selectionLineColor?.addEventListener("input", (event) => {
  const value = event.target.value;
  applyToSelected((shape) => { if ("strokeColor" in shape) shape.strokeColor = value; });
});
selectionLineColor?.addEventListener("change", () => pushHistoryState());

selectionStrokeWidth?.addEventListener("input", (event) => {
  const value = Number.parseInt(event.target.value, 10);
  if (!Number.isFinite(value)) return;
  applyToSelected((shape) => { if ("strokeWidth" in shape) shape.strokeWidth = value; });
});
selectionStrokeWidth?.addEventListener("change", () => pushHistoryState());

selectionFillColor?.addEventListener("input", (event) => {
  const value = event.target.value;
  applyToSelected((shape) => {
    shape.fillColor = value;
  });
});
selectionFillColor?.addEventListener("change", () => pushHistoryState());

saveGroupButton?.addEventListener("click", createGroupFromSelection);

selectionKeepCheckbox?.addEventListener("change", (event) => {
  appState.keepSelecting = event.target.checked;
  updateSelectionBar();
});

selectionDoneButton?.addEventListener("click", () => {
  appState.keepSelecting = false;
  updateSelectionBar();
});

selectionClearButton?.addEventListener("click", () => {
  appState.keepSelecting = false;
  clearSelectionState();
});

selectionDeleteButton?.addEventListener("click", () => {
  deleteSelection();
  appState.keepSelecting = false;
  updateSelectionBar();
});

selectionGroupButton?.addEventListener("click", () => {
  createGroupFromSelection();
  updateSelectionBar();
});

selectionUngroupButton?.addEventListener("click", () => {
  ungroupSelection();
  updateSelectionBar();
});

paletteColorButton?.addEventListener("click", () => {
  customColorPicker?.click();
});

customColorPicker?.addEventListener("input", (event) => {
  const color = event.target.value;
  appState.currentStyle.strokeColor = color;
  refreshStyleUI();
  addRecentColor(color);
});

fillColorPicker?.addEventListener("input", (event) => {
  appState.currentStyle.fillColor = event.target.value;
  refreshStyleUI();
  addRecentColor(event.target.value);
});

fillOpacityInput?.addEventListener("input", (event) => {
  const value = Number.parseFloat(event.target.value);
  appState.currentStyle.fillOpacity = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
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
  appState.unitName = event.target.value || "ft";
  refreshScaleDisplay();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAllMenus();
    closeSelectionPanel();
    appState.keepSelecting = false;
    clearSelectionState();
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

  if (event.key === "Enter") {
    event.preventDefault();
    appState.keepSelecting = false;
    updateSelectionBar();
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelection();
    return;
  }

  if (key === "e" && getCurrentToolName() === "erase") {
    event.preventDefault();
    toggleEraseMode();
    return;
  }

  if (key === "m") {
    const selectedShape = getSelectedMeasurableShape();
    if (selectedShape) {
      event.preventDefault();
      pushHistoryState();
      selectedShape.pinnedMeasure = !selectedShape.pinnedMeasure;
      appState.notifyStatus(selectedShape.pinnedMeasure ? "Measurements pinned" : "Measurements unpinned");
      return;
    }
  }

  currentTool.onKeyDown(event);
});

renderStyleSwatches();
renderRecentColors();
resetStyleAlphaDefaults();
refreshStyleUI();
appState.showGridUnits = localStorage.getItem("showGridUnits") === "1";
appState.measurementMode = normalizeMeasurementMode(localStorage.getItem("measurementMode") || (localStorage.getItem("smartMeasurements") === "0" ? "off" : "smart"));
appState.eraseMode = localStorage.getItem("eraseMode") === "segment" ? "segment" : "object";
const storedEraserSizePx = Number.parseInt(localStorage.getItem("eraserSizePx") || "16", 10);
appState.eraserSizePx = Number.isFinite(storedEraserSizePx) ? Math.min(40, Math.max(6, storedEraserSizePx)) : 16;
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
updateMeasurementModeControl();
updateEraseControls();
setActiveTool("select");
restoreAutosaveIfAvailable();
updateControlsFromState();

function frame() {
  queueAutosave();
  renderer.renderFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
