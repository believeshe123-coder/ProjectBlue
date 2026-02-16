import { BaseTool } from "./baseTool.js";

function normalizeHex(color) {
  if (typeof color !== "string") {
    return null;
  }

  const trimmed = color.trim();
  if (!trimmed.startsWith("#")) {
    return null;
  }

  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [r, g, b] = trimmed.slice(1);
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return null;
}

const PIPETTE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%23ffffff' stroke='%231f2937' stroke-width='1.4' d='M14.5 2.5l7 7-2.1 2.1-1.4-1.4-3.5 3.5 1.1 1.1-8.9 8.9-2.8.7.7-2.8 8.9-8.9 1.1 1.1 3.5-3.5-1.4-1.4z'/%3E%3C/svg%3E") 2 20, crosshair`;

export class EyedropperTool extends BaseTool {
  constructor(context) {
    super(context);
    this.usesRightClick = true;
  }

  onActivate() {
    this.context.canvas.style.cursor = PIPETTE_CURSOR;
  }

  onDeactivate() {
    this.context.canvas.style.cursor = "";
  }

  onMouseDown({ event, worldPoint }) {
    const { shapeStore, camera, appState } = this.context;
    const toleranceWorld = 8 / camera.zoom;
    const hit = shapeStore.getTopmostHitShape(worldPoint, toleranceWorld, { includeLocked: true });
    if (!hit) {
      return;
    }

    let sampledColor = null;
    if (hit.type === "polygon" || hit.type === "fillRegion") {
      sampledColor = normalizeHex(hit.fillColor);
    } else if (hit.type === "line") {
      sampledColor = normalizeHex(hit.strokeColor);
    }

    if (!sampledColor) {
      return;
    }

    const target = event.button === 2 ? "secondary" : "primary";
    appState.applySampledColor?.(target, sampledColor);
    appState.notifyStatus?.(`Picked ${sampledColor}`);
  }
}
