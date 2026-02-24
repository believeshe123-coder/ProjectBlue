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
import { normalizeEraseMode } from "./state/eraseMode.js";

const DISABLE_SCENE_GRAPH = true;
const ENABLE_GROUPING = true;
const STABILITY_MODE = true;
const ENABLE_FILL = true;
const FILL_ENABLED = STABILITY_MODE === true ? ENABLE_FILL === true : true;

const canvas = document.getElementById("canvas");
const canvasWrap = document.querySelector(".canvas-wrap");
const statusEl = document.getElementById("status");
const statusHelperEl = document.getElementById("status-helper");
const undoButton = document.getElementById("undo-btn");
const redoButton = document.getElementById("redo-btn");
const eraseModeToggle = document.getElementById("erase-mode-toggle");
const snapGridToggle = document.getElementById("snap-grid-toggle");
const snapMidToggle = document.getElementById("snap-mid-toggle");
const debugSnapToggle = document.getElementById("debug-snap-toggle");
const debugPolygonsToggle = document.getElementById("debug-polygons-toggle");
const debugRegionsToggle = document.getElementById("debug-regions-toggle");
const debugSelectionDragToggle = document.getElementById("debug-selection-drag-toggle");
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
const toolHelpButton = document.getElementById("tool-help-btn");
const helpModalBackdrop = document.getElementById("help-modal-backdrop");
const helpModalCloseButton = document.getElementById("help-modal-close-btn");
const helpModalContent = document.getElementById("help-modal-content");

const strokeWidthInput = document.getElementById("stroke-width-input");
const fillColorPicker = document.getElementById("fill-color-picker");
const saveColorButton = document.getElementById("save-color-button");
const fillOpacityInput = document.getElementById("fill-opacity-input");
const fillOpacityDisplay = document.getElementById("fill-opacity-display");
const recentRow = document.getElementById("recent-row");
const selectionCountEl = document.getElementById("selection-count");
const selectionPanel = document.getElementById("selection-panel");
const selectionLineColor = document.getElementById("selection-line-color");
const selectionStrokeWidth = document.getElementById("selection-stroke-width");
const selectionFillColor = document.getElementById("selection-fill-color");
const selectionBar = document.getElementById("selection-bar");
const selectionBarCountEl = document.getElementById("selection-bar-count");
const selectionKeepCheckbox = document.getElementById("selection-keep-checkbox");
const selectionGroupButton = document.getElementById("btnGroup");
const selectionDoneButton = document.getElementById("selection-done-btn");
const selectionDeleteButton = document.getElementById("selection-delete-btn");
const zOrderMenu = document.getElementById("z-order-context-menu");
const zOrderFrontButton = document.getElementById("z-order-front-btn");
const zOrderForwardButton = document.getElementById("z-order-forward-btn");
const zOrderBackwardButton = document.getElementById("z-order-backward-btn");
const zOrderBackButton = document.getElementById("z-order-back-btn");

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
const menuFileCloseButton = document.getElementById("menu-file-close-btn");
const menuEditCloseButton = document.getElementById("menu-edit-close-btn");
const menuSettingsCloseButton = document.getElementById("menu-settings-close-btn");
const resetTipsButton = document.getElementById("reset-tips-btn");
const selectionPanelCloseButton = document.getElementById("selection-panel-close-btn");
const zOrderMenuCloseButton = document.getElementById("z-order-menu-close-btn");
const onboardingOverlay = document.getElementById("onboarding-overlay");
const onboardingStepTitle = document.getElementById("onboarding-step-title");
const onboardingStepBody = document.getElementById("onboarding-step-body");
const onboardingNextButton = document.getElementById("onboarding-next-btn");
const onboardingDismissButton = document.getElementById("onboarding-dismiss-btn");



let recentColors = [];
const RECENT_COLOR_LIMIT = 5;

const STORAGE_KEYS = {
  savedThemes: "bp_savedThemes",
  activeThemeId: "bp_activeThemeId",
  autosaveProject: "bp_autosave_project",
  historyState: "bp_history_state_v1",
  walkthroughSeen: "bp_walkthrough_seen_v1",
};

const BUILTIN_THEMES = [
  { id: "builtin:light", name: "Light blueprint", bgColor: "#3e6478", gridColor: "#d0f1ff" },
  { id: "builtin:dark", name: "Dark blueprint", bgColor: "#1a2430", gridColor: "#b3d7ff" },
  { id: "builtin:paper", name: "Paper", bgColor: "#f6f1e4", gridColor: "#1f2937" },
];

let savedThemes = [];


const TOOL_METADATA = {
  select: { displayName: "Select", shortcut: "V", clickSummary: "Select and move lines/groups" },
  "iso-line": { displayName: "Line", shortcut: "L", clickSummary: "Click start and end points" },
  polyline: { displayName: "Polyline", shortcut: "P", clickSummary: "Click to chain segments; Enter/Escape to finish" },
  measure: { displayName: "Measure", shortcut: "M", clickSummary: "Click two points to place measurement" },
  fill: { displayName: "Fill", shortcut: "F", clickSummary: "Click inside a closed region to fill" },
  erase: { displayName: "Erase", shortcut: "E", clickSummary: "Line mode erases line geometry only. Fill mode erases fill regions only." },
};

const camera = new Camera();
const shapeStore = new ShapeStore();
const historyStore = new HistoryStore(20);

const appState = {
  disableSceneGraph: DISABLE_SCENE_GRAPH,
  enableGrouping: ENABLE_GROUPING,
  enableFill: FILL_ENABLED,
  activeTool: "select",
  currentMode: "ISO",
  previewShape: null,
  snapIndicator: null,
  snapToGrid: true,
  snapToMidpoints: true,
  debugSnap: false,
  debugPolygons: false,
  debugRegions: false,
  debugSelectionDrag: false,
  debugPolygonStrokeColor: "#ff3cf7",
  flashPolygonDebugOutlines: false,
  debugFillWorkflow: false,
  snapDebugStatus: "SNAP: OFF",
  unitName: "ft",
  unitPerCell: 1,
  measurementMode: "smart",
  continuePolyline: true,
  showGridUnits: false,
  selectedType: null,
  selectedIds: new Set(),
  selectedGroupId: null,
  keepSelecting: false,
  selectedRegionKey: null,
  lastSelectedId: null,
  marqueeRect: null,
  selectionBoxWorld: null,
  selectionPanelOpen: false,
  ui: {
    fileOpen: false,
    editOpen: false,
    settingsOpen: false,
    selectionOpen: false,
    arrangeOpen: false,
  },
  onboarding: {
    active: false,
    stepIndex: 0,
  },
  eraseMode: "line",
  erasePreview: null,
  deleteSourceLinesOnPolygonDelete: false,
  theme: null,
  activeThemeId: "builtin:light",
  contextMenu: {
    open: false,
    x: 0,
    y: 0,
    targetType: null,
    targetIds: [],
  },
  currentStyle: {
    strokeColor: "#4aa3ff",
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
  getTools: () => tools,
  onContextMenuPrevent: (event) => {
    const point = canvasEngine.getScreenPointFromEvent(event);
    const worldPoint = camera.screenToWorld(point);
    const toleranceWorld = 8 / camera.zoom;
    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { lineOnly: true });
    openContextMenuForSelection(point, hit?.id ?? null);
  },
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


function setUnifiedColor(color) {
  appState.currentStyle.strokeColor = color;
  appState.currentStyle.fillColor = color;
}

function applyColorToTarget(target, color) {
  setUnifiedColor(color);
}

function addRecentColor(color) {
  recentColors = [...recentColors, color].slice(-RECENT_COLOR_LIMIT).reverse();
  renderRecentColors();
  refreshStyleUI();
}

function applySampledColor(target, color) {
  applyColorToTarget(target, color);
  addRecentColor(color);
  refreshStyleUI();
}

function renderRecentColors() {
  if (!recentRow) return;
  recentRow.textContent = "";
  for (let index = 0; index < RECENT_COLOR_LIMIT; index += 1) {
    const color = recentColors[index] ?? null;
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "swatch";

    if (color) {
      swatch.style.setProperty("--swatch", color);
      swatch.title = color;
      swatch.setAttribute("aria-label", `Recent color ${index + 1}: ${color}`);
      swatch.addEventListener("click", () => {
        setUnifiedColor(color);
        refreshStyleUI();
      });
    } else {
      swatch.classList.add("swatch-empty");
      swatch.title = "No recent color";
      swatch.setAttribute("aria-label", `Recent color slot ${index + 1}: empty`);
      swatch.disabled = true;
      swatch.textContent = "×";
    }

    recentRow.appendChild(swatch);
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
  if (fillColorPicker) fillColorPicker.value = style.strokeColor;
  if (fillOpacityInput) fillOpacityInput.value = String(style.fillOpacity ?? 1);
  if (fillOpacityDisplay) fillOpacityDisplay.textContent = Number(style.fillOpacity ?? 1).toFixed(2);

  for (const swatch of document.querySelectorAll(".recent-row .swatch")) {
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
  measurementModeToggle.textContent = `Measurement mode: ${appState.measurementMode.toUpperCase()}`;
}

function updateContinuePolylineControl() {
  if (!continuePolylineToggle) return;
  continuePolylineToggle.title = appState.continuePolyline
    ? "Polyline chaining enabled"
    : "Polyline chaining disabled";
}

function updateEraseControls() {
  if (eraseModeToggle) {
    eraseModeToggle.value = appState.eraseMode;
    eraseModeToggle.title = "Choose whether erasing affects line geometry or fill regions.";
  }
}

function setActiveTool(toolName) {
  const normalizedToolName = normalizeToolName(toolName);
  if (!tools[normalizedToolName]) return;
  if (!appState.enableFill && normalizedToolName === "fill") {
    appState.notifyStatus?.("Fill is disabled in stability mode", 1500);
    return;
  }
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
  refreshToolHelperText();
  closeContextMenu();
  updateSelectionBar();
}

function getCurrentToolName() {
  return appState.activeTool ?? "select";
}

function getEraseToolStatusLabel() {
  const modeLabel = appState.eraseMode === "fill" ? "Fill mode" : "Line mode";
  return `${TOOL_METADATA.erase.displayName}: ${modeLabel}`;
}

function getToolStatusLabel() {
  const toolName = getCurrentToolName();
  if (toolName === "erase") return getEraseToolStatusLabel();
  return TOOL_METADATA[toolName]?.displayName ?? toolName;
}

function getToolShortcutLabel(toolName) {
  return TOOL_METADATA[toolName]?.shortcut ? ` (${TOOL_METADATA[toolName].shortcut})` : "";
}

function renderToolButtons() {
  for (const button of document.querySelectorAll('.tool-grid [data-tool]')) {
    const toolName = button.dataset.tool;
    const metadata = TOOL_METADATA[toolName];
    if (!metadata) continue;
    button.textContent = metadata.displayName;
    button.title = `${metadata.displayName} [${metadata.shortcut}] — ${metadata.clickSummary}`;
    button.setAttribute("aria-label", `${metadata.displayName} tool (${metadata.shortcut})`);
  }
}

function renderHelpModal() {
  if (!helpModalContent) return;
  const rows = Object.values(TOOL_METADATA)
    .map((tool) => `<tr><td>${tool.displayName}</td><td><kbd>${tool.shortcut}</kbd></td><td>${tool.clickSummary}</td></tr>`)
    .join("");
  helpModalContent.innerHTML = `<table class="help-modal-table"><thead><tr><th>Tool</th><th>Key</th><th>Behavior</th></tr></thead><tbody>${rows}</tbody></table><p>Press <kbd>?</kbd> to toggle this help.</p>`;
}

function setHelpModalOpen(open) {
  if (!helpModalBackdrop) return;
  helpModalBackdrop.hidden = !open;
}

function getSnapStatusLabel() {
  const base = `Snap: Grid ${appState.snapToGrid ? "ON" : "OFF"} | Midpoint ${appState.snapToMidpoints ? "ON" : "OFF"}`;
  if (!appState.snapIndicator?.kind) return base;

  const kindLabel = appState.snapIndicator.kind.toUpperCase();
  if (appState.snapIndicator.kind === "axis" && appState.snapIndicator.d !== null) {
    return `${base} | SNAP: ${kindLabel} (d=${appState.snapIndicator.d})`;
  }

  if (appState.snapIndicator.u !== null && appState.snapIndicator.v !== null) {
    return `${base} | SNAP: ${kindLabel} (u=${appState.snapIndicator.u}, v=${appState.snapIndicator.v})`;
  }

  return base;
}

function refreshScaleDisplay() {
  scaleDisplay.textContent = `1 grid = ${appState.unitPerCell} ${appState.unitName}`;
}

const TOOL_HELPER_TEXT = {
  select: "Select: click-drag to marquee, click to select.",
  "iso-line": "Line: click once to start, click again to finish.",
  polyline: "Polyline: click-click to add segments, double-click to finish.",
  measure: "Measure: click and drag to measure between points.",
  fill: "Fill: click inside an enclosed region to fill it.",
  erase: "Erase: line mode erases line geometry only; fill mode erases fill regions only.",
};

const ONBOARDING_STEPS = [
  {
    title: "Tool selection",
    body: "Pick tools from the Tool Grid. Start with Select, then Line or Polyline for drawing.",
    selector: ".tool-grid",
  },
  {
    title: "Snap toggles",
    body: "Open Settings and tune Snap to grid / Snap to midpoint for precise placement.",
    selector: "#menuSettingsBtn",
  },
  {
    title: "Scale setup",
    body: "Open Edit and set Unit / grid plus Unit so measurements match your plan.",
    selector: "#menuEditBtn",
  },
  {
    title: "Save and load",
    body: "Use File → Save and File → Load to export or reopen your drawing JSON.",
    selector: "#menuFileBtn",
  },
];

function clearOnboardingHighlights() {
  document.querySelectorAll(".onboarding-highlight").forEach((el) => el.classList.remove("onboarding-highlight"));
}

function refreshToolHelperText() {
  if (!statusHelperEl) return;
  statusHelperEl.textContent = TOOL_HELPER_TEXT[getCurrentToolName()] || TOOL_HELPER_TEXT.select;
}

function dismissOnboarding({ persist = false } = {}) {
  appState.onboarding.active = false;
  if (persist) localStorage.setItem(STORAGE_KEYS.walkthroughSeen, "1");
  if (onboardingOverlay) {
    onboardingOverlay.hidden = true;
    onboardingOverlay.style.display = "none";
  }
  clearOnboardingHighlights();
}

function renderOnboardingStep() {
  if (!appState.onboarding.active || !onboardingOverlay) return;
  const step = ONBOARDING_STEPS[appState.onboarding.stepIndex];
  if (!step) {
    dismissOnboarding({ persist: true });
    return;
  }

  onboardingStepTitle.textContent = step.title;
  onboardingStepBody.textContent = step.body;
  onboardingNextButton.textContent = appState.onboarding.stepIndex === ONBOARDING_STEPS.length - 1 ? "Done" : "Next";
  clearOnboardingHighlights();
  const highlightTarget = step.selector ? document.querySelector(step.selector) : null;
  if (highlightTarget) highlightTarget.classList.add("onboarding-highlight");
}

function startOnboarding({ force = false } = {}) {
  const alreadySeen = localStorage.getItem(STORAGE_KEYS.walkthroughSeen) === "1";
  if (alreadySeen && !force) return;
  appState.onboarding.active = true;
  appState.onboarding.stepIndex = 0;
  if (onboardingOverlay) {
    onboardingOverlay.hidden = false;
    onboardingOverlay.style.display = "grid";
  }
  renderOnboardingStep();
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

  const regionCount = shapeStore.getComputedRegions().length;
  const regionStatus = appState.selectedRegionKey ? " | Region Selected" : "";
  statusEl.textContent = `Mode: ISO | Tool: ${getToolStatusLabel()}${getToolShortcutLabel(getCurrentToolName())} | Zoom: ${camera.zoom.toFixed(2)}x | Regions: ${regionCount} | Bounded faces: ${regionCount}${regionStatus} | ${getSnapStatusLabel()}`;
}

appState.setSelection = setSelection;
appState.addToSelection = addToSelection;
appState.removeFromSelection = removeFromSelection;
appState.clearSelection = clearSelectionState;
appState.openContextMenuForSelection = openContextMenuForSelection;
appState.closeContextMenu = closeContextMenu;

function openSelectionPanel(screenPoint) {
  if (!selectionPanel) return;
  appState.ui.selectionOpen = true;
  appState.selectionPanelOpen = true;
  selectionPanel.style.display = "";
  if (screenPoint) {
    selectionPanel.style.left = `${Math.max(12, screenPoint.x + 12)}px`;
    selectionPanel.style.top = `${Math.max(36, screenPoint.y + 12)}px`;
    selectionPanel.style.right = "auto";
  }
  renderUiVisibility();
}

function closeSelectionPanel() {
  if (!selectionPanel) return;
  appState.ui.selectionOpen = false;
  appState.selectionPanelOpen = false;
  selectionPanel.style.display = "none";
  renderUiVisibility();
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

function normalizeShapePayload(payload = []) {
  if (payload && payload.nodes && Array.isArray(payload.rootIds)) return payload;
  if (!Array.isArray(payload)) return [];
  return payload.map((shape) => {
    if (!shape || typeof shape !== "object") return shape;
    const { layerId, ...rest } = shape;
    return rest;
  });
}

function getSnapshot() {
  return {
    shapes: shapeStore.serialize(),
    selectedIds: [...appState.selectedIds],
    selectedType: appState.selectedType,
    keepSelecting: appState.keepSelecting === true,
    selectedGroupId: appState.selectedGroupId ?? null,
  };
}

function isSnapshotEmpty(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return true;
  const shapes = Array.isArray(snapshot.shapes)
    ? snapshot.shapes
    : (snapshot.shapes?.rootIds ?? []);
  return shapes.length === 0;
}

let hasHistoryBaseline = false;
const HISTORY_DEBUG_ENABLED = false;

function getSnapshotShapeCount(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return 0;
  const shapes = Array.isArray(snapshot.shapes)
    ? snapshot.shapes
    : (snapshot.shapes?.rootIds ?? []);
  return Array.isArray(shapes) ? shapes.length : 0;
}

function getTopSnapshotShapeCount(stack) {
  const top = stack[stack.length - 1];
  if (!top) return 0;
  try {
    return getSnapshotShapeCount(JSON.parse(top));
  } catch {
    return 0;
  }
}

function debugHistoryTransition(action, beforeUndoLen, beforeRedoLen) {
  if (!HISTORY_DEBUG_ENABLED) return;
  const undoTopShapes = getTopSnapshotShapeCount(historyStore.undoStack);
  const redoTopShapes = getTopSnapshotShapeCount(historyStore.redoStack);
  const currentShapes = getSnapshotShapeCount(getSnapshot());
  console.log(
    `[HISTORY:${action}] undo ${beforeUndoLen} -> ${historyStore.undoStack.length} (topShapes=${undoTopShapes}), redo ${beforeRedoLen} -> ${historyStore.redoStack.length} (topShapes=${redoTopShapes}), currentShapes=${currentShapes}`,
  );
}


function persistHistoryState() {
  const payload = {
    version: 1,
    hasHistoryBaseline,
    history: historyStore.serialize(),
  };
  localStorage.setItem(STORAGE_KEYS.historyState, JSON.stringify(payload));
}

function restoreHistoryState() {
  const serialized = localStorage.getItem(STORAGE_KEYS.historyState);
  if (!serialized) return false;
  try {
    const parsed = JSON.parse(serialized);
    const history = parsed?.history;
    if (!history || typeof history !== "object") return false;
    historyStore.restore(history);
    hasHistoryBaseline = parsed?.hasHistoryBaseline === true;
    return true;
  } catch {
    localStorage.removeItem(STORAGE_KEYS.historyState);
    return false;
  }
}

function resetHistoryWithBaseline() {
  historyStore.undoStack = [];
  historyStore.redoStack = [];
  historyStore.pushState(getSnapshot());
  hasHistoryBaseline = true;
  persistHistoryState();
}

function ensureHistoryBaseline({ allowEmpty = false } = {}) {
  if (hasHistoryBaseline) return false;
  const baseline = getSnapshot();
  if (!allowEmpty && isSnapshotEmpty(baseline)) return false;
  historyStore.pushState(baseline);
  hasHistoryBaseline = true;
  persistHistoryState();
  return true;
}

function applySnapshot(snapshot) {
  if (!snapshot) return;

  if (Array.isArray(snapshot)) {
    shapeStore.replaceFromSerialized(normalizeShapePayload(snapshot));
    return;
  }

  shapeStore.replaceFromSerialized(normalizeShapePayload(snapshot.shapes ?? []));
  appState.keepSelecting = snapshot.keepSelecting === true;
  appState.selectedType = snapshot.selectedType ?? null;
  appState.selectedGroupId = snapshot.selectedGroupId ?? null;
}

function pushHistoryState() {
  const snapshot = getSnapshot();
  ensureHistoryBaseline({ allowEmpty: true });
  const serialized = JSON.stringify(snapshot);
  if (historyStore.undoStack[historyStore.undoStack.length - 1] === serialized) {
    return;
  }
  historyStore.pushState(snapshot);
  persistHistoryState();
}

function undo() {
  const beforeUndoLen = historyStore.undoStack.length;
  const beforeRedoLen = historyStore.redoStack.length;
  const currentSnapshot = getSnapshot();
  if (HISTORY_DEBUG_ENABLED) {
    console.log(
      `[HISTORY:undo:before] undoLen=${beforeUndoLen}, redoLen=${beforeRedoLen}, currentShapes=${getSnapshotShapeCount(currentSnapshot)}, undoTopShapes=${getTopSnapshotShapeCount(historyStore.undoStack)}, redoTopShapes=${getTopSnapshotShapeCount(historyStore.redoStack)}`,
    );
  }
  const previous = historyStore.undo(currentSnapshot);
  persistHistoryState();
  debugHistoryTransition("undo", beforeUndoLen, beforeRedoLen);
  if (!previous) return;
  applySnapshot(previous);
  if (HISTORY_DEBUG_ENABLED) {
    console.log(
      `[HISTORY:undo:applied] restoredShapes=${getSnapshotShapeCount(previous)}, nowShapes=${getSnapshotShapeCount(getSnapshot())}`,
    );
  }
  appState.previewShape = null;
  appState.selectedRegionKey = null;
  clearSelectionState();
}

function redo() {
  const beforeUndoLen = historyStore.undoStack.length;
  const beforeRedoLen = historyStore.redoStack.length;
  const currentSnapshot = getSnapshot();
  if (HISTORY_DEBUG_ENABLED) {
    console.log(
      `[HISTORY:redo:before] undoLen=${beforeUndoLen}, redoLen=${beforeRedoLen}, currentShapes=${getSnapshotShapeCount(currentSnapshot)}, undoTopShapes=${getTopSnapshotShapeCount(historyStore.undoStack)}, redoTopShapes=${getTopSnapshotShapeCount(historyStore.redoStack)}`,
    );
  }
  const next = historyStore.redo(currentSnapshot);
  persistHistoryState();
  debugHistoryTransition("redo", beforeUndoLen, beforeRedoLen);
  if (!next) return;
  applySnapshot(next);
  if (HISTORY_DEBUG_ENABLED) {
    console.log(
      `[HISTORY:redo:applied] restoredShapes=${getSnapshotShapeCount(next)}, nowShapes=${getSnapshotShapeCount(getSnapshot())}`,
    );
  }
  appState.previewShape = null;
  appState.selectedRegionKey = null;
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
  localStorage.removeItem(STORAGE_KEYS.historyState);
}

function resetProject() {
  const confirmed = window.confirm("Reset project? This will erase all shapes and settings.");
  if (!confirmed) {
    return;
  }

  shapeStore.clear();
  camera.resetView();
  setActiveTool("select");
  appState.previewShape = null;
  appState.snapIndicator = null;
  clearSelectionState();
  resetHistoryWithBaseline();
  clearAutosaveProject();
  appState.notifyStatus?.("Project reset", 1600);
}

function isShapeInteractive(shape) {
  return !!shape && shape.visible !== false && shape.locked !== true;
}

function canGroupSelection() {
  return appState.enableGrouping && appState.selectedType === "line" && appState.selectedIds.size >= 2;
}

function updateSelectionBar() {
  if (!selectionBar) return;
  const hasSelection = appState.selectedType !== null && appState.selectedIds.size > 0;
  const shouldShow = getCurrentToolName() === "select" && hasSelection;
  if (!hasSelection) closeContextMenu();
  selectionBar.hidden = false;
  selectionBar.classList.toggle("is-visible", shouldShow);
  if (selectionBarCountEl) selectionBarCountEl.textContent = `Selection (${appState.selectedIds.size})`;
  if (selectionKeepCheckbox) selectionKeepCheckbox.checked = appState.keepSelecting === true;
  if (selectionGroupButton) selectionGroupButton.disabled = !canGroupSelection();
}

appState.updateSelectionBar = updateSelectionBar;

function updateSelectedFlags() {
  const ids = appState.selectedIds;
  for (const shape of shapeStore.getShapes()) {
    shape.selected = ids.has(shape.id);
  }
  const count = ids.size;
  selectionCountEl.textContent = count > 0 ? `${count} selected` : "";
  if (count === 0) closeSelectionPanel();
  updateSelectionBar();
}

function setSelection(ids = [], type = null, lastId = null) {
  if (ids.length === 0) appState.selectionBoxWorld = null;
  appState.selectedType = ids.length > 0 ? type : null;
  appState.selectedIds = new Set(ids);
  appState.selectedGroupId = appState.selectedType === "group" ? (lastId ?? ids[0] ?? null) : null;
  appState.lastSelectedId = lastId;
  updateSelectedFlags();
}

function addToSelection(id, type) {
  if (appState.selectedType && appState.selectedType !== type) {
    setSelection([id], type, id);
    return;
  }
  appState.selectionBoxWorld = null;
  appState.selectedType = type;
  appState.selectedIds.add(id);
  appState.lastSelectedId = id;
  updateSelectedFlags();
}

function removeFromSelection(id) {
  appState.selectedIds.delete(id);
  if (appState.lastSelectedId === id) appState.lastSelectedId = null;
  if (appState.selectedIds.size === 0) appState.selectedType = null;
  updateSelectedFlags();
}

function clearSelectionState() {
  appState.selectedType = null;
  appState.selectedIds = new Set();
  appState.lastSelectedId = null;
  appState.selectedGroupId = null;
  appState.selectedRegionKey = null;
  appState.selectionBoxWorld = null;
  shapeStore.clearSelection();
  closeContextMenu();
  updateSelectedFlags();
}

function getSelectedShapes() {
  return [...appState.selectedIds]
    .map((id) => shapeStore.getShapeById(id) ?? shapeStore.getNodeById(id))
    .filter(Boolean);
}

function getSelectedMeasurableShape() {
  if (appState.selectedIds.size !== 1) return null;
  const shape = shapeStore.getShapeById(appState.lastSelectedId) || getSelectedShapes()[0] || null;
  return (shape && (shape.type === "line" || shape.type === "polygon")) ? shape : null;
}

function deleteSelection() {
  if (appState.selectedType === "group" && appState.selectedGroupId) {
    const group = shapeStore.getLineGroup(appState.selectedGroupId);
    if (!group) return;
    const childIds = group.childIds.filter((id) => shapeStore.getNodeById(id));
    pushHistoryState();
    shapeStore.deleteNodesInEntirety(childIds);
    shapeStore.deleteLineGroup(group.id);
    clearSelectionState();
    return;
  }
  const selectedIds = [...appState.selectedIds].filter((id) => shapeStore.getNodeById(id));
  if (!selectedIds.length) return;
  pushHistoryState();
  shapeStore.deleteNodesInEntirety(selectedIds);
  clearSelectionState();
  closeSelectionPanel();
}


function applyToSelected(updater) {
  const selectedShapes = getSelectedShapes();
  if (!selectedShapes.length) return;
  for (const shape of selectedShapes) updater(shape);
}

function createGroupFromSelection() {
  if (!appState.enableGrouping) return;
  if (appState.selectedType !== "line" || appState.selectedIds.size < 2) return;
  const selectedLineIds = [...appState.selectedIds];
  pushHistoryState();
  const groupId = shapeStore.createLineGroup(selectedLineIds);
  if (!groupId) return;
  appState.selectedType = "group";
  appState.selectedGroupId = groupId;
  appState.lastSelectedId = groupId;
  appState.selectedIds = new Set(selectedLineIds);
  updateSelectedFlags();
  appState.notifyStatus?.(`Grouped ${selectedLineIds.length} lines`, 1200);
  console.log(`[GROUP] Grouped ${selectedLineIds.length} lines -> ${groupId}`);
}

function makeObjectFromSelection() {
  if (appState.disableSceneGraph) {
    appState.notifyStatus?.("Disabled while scene graph is off", 1500);
    return;
  }
  const hasSelection = appState.selectedIds.size > 0;
  const hasSelectionBox = !!appState.selectionBoxWorld;
  if (!hasSelection && !hasSelectionBox) return;

  const selectionBounds = appState.selectionBoxWorld
    ?? shapeStore.getSelectionBoundsFromIds([...appState.selectedIds]);
  if (!selectionBounds) {
    appState.notifyStatus?.("No selection bounds", 1200);
    return;
  }

  const intersectingLineIds = shapeStore.getShapes()
    .filter((shape) => shape.type === "line" && shape.visible !== false && shape.locked !== true)
    .filter((shape) => {
      const bounds = shapeStore.getShapeBounds(shape);
      if (!bounds) return false;
      return !(bounds.maxX < selectionBounds.minX
        || bounds.minX > selectionBounds.maxX
        || bounds.maxY < selectionBounds.minY
        || bounds.minY > selectionBounds.maxY);
    })
    .map((shape) => shape.id);
  const filledRegionCount = shapeStore.getFilledRegionCountInBounds(selectionBounds);

  if (!intersectingLineIds.length && !filledRegionCount) {
    appState.notifyStatus?.("Nothing in selection to group", 1500);
    return;
  }

  pushHistoryState();

  const faceIds = shapeStore.captureFilledRegionsAsFacesInBounds(selectionBounds);

  const childIds = [...new Set([...intersectingLineIds, ...faceIds])];

  const objectId = shapeStore.createObjectFromIds(childIds, { name: "Object" });

  appState.keepSelecting = false;
  appState.selectionBoxWorld = null;
  setSelection([objectId], "object", objectId);
  appState.notifyStatus?.("Object created", 1400);
}

function ungroupSelection() {
  if (appState.disableSceneGraph) {
    appState.notifyStatus?.("Disabled while scene graph is off", 1500);
    return;
  }
  if (!isSingleSelectedGroup()) return;
  const [groupId] = appState.selectedIds;
  const group = shapeStore.getNodeById(groupId);
  if (!group || group.kind !== "object") return;
  pushHistoryState();
  shapeStore.removeShape(group.id);
  clearSelectionState();
}

function clearAllGroups() {
  if (!shapeStore.hasLineGroups()) return;
  pushHistoryState();
  shapeStore.clearAllLineGroups();
  clearSelectionState();
}

function closeContextMenu() {
  appState.ui.arrangeOpen = false;
  appState.contextMenu = {
    open: false,
    x: 0,
    y: 0,
    targetType: null,
    targetIds: [],
  };
  renderUiVisibility();
}

function clampMenuPosition(x, y) {
  if (!zOrderMenu) return { x, y };
  const padding = 8;
  const rect = zOrderMenu.getBoundingClientRect();
  const maxX = window.innerWidth - rect.width - padding;
  const maxY = window.innerHeight - rect.height - padding;
  return {
    x: Math.max(padding, Math.min(x, maxX)),
    y: Math.max(padding, Math.min(y, maxY)),
  };
}

function openContextMenuForSelection(screenPoint, clickedShapeId = null) {
  const isLineSelection = appState.selectedType === "line" && appState.selectedIds.size > 0;
  const isGroupSelection = appState.selectedType === "group" && !!appState.selectedGroupId;
  if (!zOrderMenu || (!isLineSelection && !isGroupSelection)) {
    closeContextMenu();
    return;
  }

  if (clickedShapeId && !appState.selectedIds.has(clickedShapeId)) {
    closeContextMenu();
    return;
  }

  let targetIds = [...appState.selectedIds];
  let targetType = appState.selectedType;
  if (isGroupSelection) {
    const group = shapeStore.getLineGroup(appState.selectedGroupId);
    if (!group) {
      closeContextMenu();
      return;
    }
    targetIds = [...group.childIds];
    targetType = "group";
  }

  appState.ui.arrangeOpen = true;
  const { x, y } = clampMenuPosition(screenPoint?.x ?? 0, screenPoint?.y ?? 0);
  zOrderMenu.style.left = `${x}px`;
  zOrderMenu.style.top = `${y}px`;

  appState.contextMenu = {
    open: true,
    x,
    y,
    targetType,
    targetIds,
  };
  renderUiVisibility();
}

function hidePanel(panelId) {
  if (panelId === "file") {
    setFileMenuOpen(false);
    return;
  }
  if (panelId === "edit") {
    setEditMenuOpen(false);
    return;
  }
  if (panelId === "settings") {
    setSettingsMenuOpen(false);
    return;
  }
  if (panelId === "selection") {
    closeSelectionPanel();
    return;
  }
  if (panelId === "arrange") {
    closeContextMenu();
  }
}

function reorderSelectionZ(mode, idsOverride = null) {
  const targetIds = idsOverride ? [...idsOverride] : [...appState.selectedIds];
  if (!targetIds.length) return false;
  const before = getSnapshot();
  const didChange = shapeStore.reorderSelectionZ(targetIds, mode);
  if (!didChange) return false;
  historyStore.pushState(before);
  persistHistoryState();
  const statusByMode = {
    front: "Brought to front",
    forward: "Brought forward",
    backward: "Sent backward",
    back: "Sent to back",
  };
  appState.notifyStatus?.(statusByMode[mode] ?? "Reordered");
  return true;
}

function runContextMenuZOrder(mode) {
  const ids = appState.contextMenu?.targetIds ?? [];
  if (!ids.length) {
    closeContextMenu();
    return;
  }
  reorderSelectionZ(mode, ids);
  closeContextMenu();
}

function convertSelectedRegionToFace() {
  if (appState.disableSceneGraph) {
    appState.notifyStatus?.("Disabled while scene graph is off", 1500);
    return;
  }
  const regionKey = appState.selectedRegionKey;
  if (!regionKey) return;

  const existingFace = shapeStore.getFaceBySourceRegionKey?.(regionKey)
    ?? shapeStore.getShapes().find((shape) => shape.type === "face" && shape.sourceRegionKey === regionKey);
  if (existingFace) {
    setSelection([existingFace.id], "face", existingFace.id);
    appState.selectedRegionKey = null;
    appState.notifyStatus?.("Face already exists", 1500);
    return;
  }

  const region = shapeStore.getComputedRegions().find((entry) => entry.id === regionKey);
  if (!region?.uvCycle || region.uvCycle.length < 3) {
    appState.notifyStatus?.("Region no longer available", 1800);
    return;
  }

  const sourceFill = shapeStore.getShapes().find((shape) => shape.type === "fillRegion" && shape.regionId === region.id);
  if (!sourceFill) {
    appState.notifyStatus?.("Region is not filled", 1600);
    return;
  }

  pushHistoryState();
  const faceId = shapeStore.createFaceFromRegion(region, {
    color: sourceFill.color,
    alpha: sourceFill.alpha,
    fillColor: sourceFill.fillColor,
    fillOpacity: sourceFill.fillOpacity,
  });
  if (!faceId) return;
  shapeStore.removeShape(sourceFill.id);
  setSelection([faceId], "face", faceId);
  appState.selectedRegionKey = null;
  appState.notifyStatus?.("Converted to Face", 1600);
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
  refreshToolHelperText();
}

function applyProjectData(project, { announce = true } = {}) {
  if (!project || !project.shapes) {
    throw new Error("Unsupported project file");
  }

  const settings = project.settings ?? {};
  appState.unitPerCell = Number.isFinite(settings.unitPerGrid) && settings.unitPerGrid > 0 ? settings.unitPerGrid : 1;
  appState.unitName = typeof settings.unit === "string" && settings.unit ? settings.unit : "ft";
  appState.snapToGrid = settings.snapGrid !== false;
  appState.snapToMidpoints = settings.snapMidpoint !== false;
  appState.measurementMode = normalizeMeasurementMode(settings.measurementMode ?? (settings.smartMeasurements === false ? "off" : "smart"));
  appState.showGridUnits = settings.showGridUnits === true;
  appState.eraseMode = normalizeEraseMode(settings.eraseMode);
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
  resetHistoryWithBaseline();
  appState.previewShape = null;
  appState.selectedRegionKey = null;
  clearSelectionState();
  const toolName = normalizeToolName(settings.lastTool || "select");
  setActiveTool(tools[toolName] ? toolName : "select");

  localStorage.setItem("showGridUnits", appState.showGridUnits ? "1" : "0");
  localStorage.setItem("measurementMode", appState.measurementMode);
  localStorage.setItem("debugSnap", appState.debugSnap ? "1" : "0");
  localStorage.setItem("eraseMode", appState.eraseMode);
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
  appState.ui.settingsOpen = open === true;
  renderUiVisibility();
}

function setEditMenuOpen(open) {
  appState.ui.editOpen = open === true;
  renderUiVisibility();
}

function setFileMenuOpen(open) {
  appState.ui.fileOpen = open === true;
  renderUiVisibility();
}

function renderUiVisibility() {
  if (menuSettingsDropdown && menuSettingsButton) {
    menuSettingsDropdown.dataset.open = appState.ui.settingsOpen ? "true" : "false";
    menuSettingsDropdown.hidden = !appState.ui.settingsOpen;
    menuSettingsButton.setAttribute("aria-expanded", appState.ui.settingsOpen ? "true" : "false");
  }
  if (menuEditDropdown && menuEditButton) {
    menuEditDropdown.dataset.open = appState.ui.editOpen ? "true" : "false";
    menuEditDropdown.hidden = !appState.ui.editOpen;
    menuEditButton.setAttribute("aria-expanded", appState.ui.editOpen ? "true" : "false");
  }
  if (menuFileDropdown && menuFileButton) {
    menuFileDropdown.dataset.open = appState.ui.fileOpen ? "true" : "false";
    menuFileDropdown.hidden = !appState.ui.fileOpen;
    menuFileButton.setAttribute("aria-expanded", appState.ui.fileOpen ? "true" : "false");
  }
  if (selectionPanel) selectionPanel.hidden = !appState.ui.selectionOpen;
  if (zOrderMenu) zOrderMenu.hidden = !appState.ui.arrangeOpen;
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

toolHelpButton?.addEventListener("click", () => setHelpModalOpen(true));
helpModalCloseButton?.addEventListener("click", () => setHelpModalOpen(false));
helpModalBackdrop?.addEventListener("click", (event) => {
  if (event.target === helpModalBackdrop) setHelpModalOpen(false);
});

menuFileButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  setSettingsMenuOpen(false);
  setEditMenuOpen(false);
  setFileMenuOpen(!appState.ui.fileOpen);
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
  setSettingsMenuOpen(!appState.ui.settingsOpen);
});

menuEditButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  setSettingsMenuOpen(false);
  setFileMenuOpen(false);
  setEditMenuOpen(!appState.ui.editOpen);
});

menuSettingsDropdown?.addEventListener("click", (event) => {
  event.stopPropagation();
});

menuEditDropdown?.addEventListener("click", (event) => {
  event.stopPropagation();
});


menuFileCloseButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  hidePanel("file");
});

menuEditCloseButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  hidePanel("edit");
});

menuSettingsCloseButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  hidePanel("settings");
});


resetTipsButton?.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEYS.walkthroughSeen);
  startOnboarding({ force: true });
  closeAllMenus();
});

onboardingNextButton?.addEventListener("click", () => {
  if (!appState.onboarding.active) return;
  if (appState.onboarding.stepIndex >= ONBOARDING_STEPS.length - 1) {
    dismissOnboarding({ persist: true });
    return;
  }
  appState.onboarding.stepIndex += 1;
  renderOnboardingStep();
});

onboardingDismissButton?.addEventListener("click", () => {
  dismissOnboarding({ persist: true });
});

selectionPanelCloseButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  hidePanel("selection");
});

zOrderMenuCloseButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  hidePanel("arrange");
});

clearGroupsButton?.addEventListener("click", () => {
  clearAllGroups();
  closeAllMenus();
});

document.addEventListener("click", () => {
  if (!appState.ui.fileOpen && !appState.ui.editOpen && !appState.ui.settingsOpen) return;
  closeAllMenus();
});

document.addEventListener("pointerdown", (event) => {
  if (!appState.contextMenu.open) return;
  if (zOrderMenu?.contains(event.target)) return;
  closeContextMenu();
});

zOrderMenu?.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
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

debugPolygonsToggle?.addEventListener("change", (event) => {
  appState.debugPolygons = event.target.checked;
  localStorage.setItem("debugPolygons", appState.debugPolygons ? "1" : "0");
});

debugRegionsToggle?.addEventListener("change", (event) => {
  appState.debugRegions = event.target.checked;
  localStorage.setItem("debugRegions", appState.debugRegions ? "1" : "0");
});

debugSelectionDragToggle?.addEventListener("change", (event) => {
  appState.debugSelectionDrag = event.target.checked;
  localStorage.setItem("debugSelectionDrag", appState.debugSelectionDrag ? "1" : "0");
});

continuePolylineToggle.addEventListener("change", (event) => {
  appState.continuePolyline = event.target.checked;
  updateContinuePolylineControl();
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

eraseModeToggle?.addEventListener("change", (event) => {
  appState.eraseMode = normalizeEraseMode(event.target.value);
  localStorage.setItem("eraseMode", appState.eraseMode);
  appState.notifyStatus?.(`Erase mode: ${appState.eraseMode === "line" ? "Erase line" : "Erase fill"}`, 2200);
  updateEraseControls();
  refreshStatus();
  refreshToolHelperText();
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



selectionKeepCheckbox?.addEventListener("change", (event) => {
  appState.keepSelecting = event.target.checked;
  updateSelectionBar();
});

selectionGroupButton?.addEventListener("click", () => {
  createGroupFromSelection();
  updateSelectionBar();
});
selectionDoneButton?.addEventListener("click", () => {
  clearSelectionState();
});
selectionDeleteButton?.addEventListener("click", () => {
  deleteSelection();
  updateSelectionBar();
});

zOrderFrontButton?.addEventListener("click", () => runContextMenuZOrder("front"));
zOrderForwardButton?.addEventListener("click", () => runContextMenuZOrder("forward"));
zOrderBackwardButton?.addEventListener("click", () => runContextMenuZOrder("backward"));
zOrderBackButton?.addEventListener("click", () => runContextMenuZOrder("back"));

fillColorPicker?.addEventListener("input", (event) => {
  setUnifiedColor(event.target.value);
  refreshStyleUI();
});

saveColorButton?.addEventListener("click", () => {
  if (!fillColorPicker) return;
  addRecentColor(fillColorPicker.value);
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

function isTypingInInput(event) {
  const target = event.target;
  if (!target) return false;
  const tagName = target.tagName?.toLowerCase();
  return target.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select";
}

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAllMenus();
    closeContextMenu();
    closeSelectionPanel();
    setHelpModalOpen(false);
    appState.keepSelecting = false;
    appState.selectedRegionKey = null;
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

  if (!isTypingInInput(event)) {
    if (event.key === "?" || (event.shiftKey && key === "/")) {
      event.preventDefault();
      setHelpModalOpen(helpModalBackdrop?.hidden === true);
      return;
    }

    const shortcutTool = Object.entries(TOOL_METADATA).find(([, metadata]) => metadata.shortcut.toLowerCase() === key)?.[0];
    if (shortcutTool) {
      event.preventDefault();
      setActiveTool(shortcutTool);
      return;
    }

    if (event.key === "]" && event.shiftKey) {
      event.preventDefault();
      reorderSelectionZ("front");
      return;
    }

    if (event.key === "[" && event.shiftKey) {
      event.preventDefault();
      reorderSelectionZ("back");
      return;
    }

    if (event.key === "]") {
      event.preventDefault();
      reorderSelectionZ("forward");
      return;
    }

    if (event.key === "[") {
      event.preventDefault();
      reorderSelectionZ("backward");
      return;
    }
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

function initializeEraseModePreference() {
  const storedEraseMode = localStorage.getItem("eraseMode");
  appState.eraseMode = normalizeEraseMode(storedEraseMode);
  localStorage.setItem("eraseMode", appState.eraseMode);
  return appState.eraseMode;
}

renderRecentColors();
resetStyleAlphaDefaults();
refreshStyleUI();
appState.showGridUnits = localStorage.getItem("showGridUnits") === "1";
appState.measurementMode = normalizeMeasurementMode(localStorage.getItem("measurementMode") || (localStorage.getItem("smartMeasurements") === "0" ? "off" : "smart"));
appState.eraseMode = initializeEraseModePreference();
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
appState.debugPolygons = localStorage.getItem("debugPolygons") === "1";
if (debugPolygonsToggle) debugPolygonsToggle.checked = appState.debugPolygons;
appState.debugRegions = localStorage.getItem("debugRegions") === "1";
if (debugRegionsToggle) debugRegionsToggle.checked = appState.debugRegions;
appState.debugSelectionDrag = localStorage.getItem("debugSelectionDrag") === "1";
if (debugSelectionDragToggle) debugSelectionDragToggle.checked = appState.debugSelectionDrag;
showGridUnitsToggle.checked = appState.showGridUnits;
updateMeasurementModeControl();
updateContinuePolylineControl();
updateEraseControls();
renderToolButtons();
renderHelpModal();
setActiveTool("select");
const didRestoreAutosave = restoreAutosaveIfAvailable();
const didRestoreHistory = didRestoreAutosave ? restoreHistoryState() : false;
if (!didRestoreHistory) {
  resetHistoryWithBaseline();
}
if (!didRestoreAutosave && !didRestoreHistory && HISTORY_DEBUG_ENABLED) {
  console.log("[HISTORY:start] initialized empty baseline for new session");
}
renderUiVisibility();
updateControlsFromState();
startOnboarding();

function triggerProjectLoadFromEntry() {
  if (!projectLoadInput) return;
  const hasUserActivation = navigator.userActivation?.isActive === true;
  if (hasUserActivation) {
    projectLoadInput.click();
    return;
  }

  setFileMenuOpen(true);
  projectLoadButton?.focus();
  appState.notifyStatus?.("Browser blocked automatic file picker. Use File → Load.", 3200);
}

const entryAction = new URLSearchParams(window.location.search).get("start");
if (entryAction === "open") {
  window.setTimeout(triggerProjectLoadFromEntry, 120);
}

function frame() {
  queueAutosave();
  renderer.renderFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
