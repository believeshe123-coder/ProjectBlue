import { BaseTool } from "./baseTool.js";
import { FillRegion } from "../models/fillRegion.js";
import { getCurrentStyle } from "./toolUtils.js";

const MAX_FILL_RATIO = 0.95;

function getPixel(mask, width, x, y) {
  return mask[y * width + x] === 1;
}

function floodFill(mask, width, height, seedX, seedY) {
  if (seedX < 0 || seedX >= width || seedY < 0 || seedY >= height || getPixel(mask, width, seedX, seedY)) {
    return { filled: null, count: 0 };
  }

  const filled = new Uint8Array(width * height);
  const queue = [{ x: seedX, y: seedY }];
  let head = 0;
  let count = 0;
  const maxCount = Math.floor(width * height * MAX_FILL_RATIO);

  while (head < queue.length) {
    const { x, y } = queue[head++];
    const idx = y * width + x;

    if (filled[idx] === 1 || mask[idx] === 1) {
      continue;
    }

    filled[idx] = 1;
    count += 1;
    if (count > maxCount) {
      return { filled: null, count };
    }

    if (x > 0) queue.push({ x: x - 1, y });
    if (x < width - 1) queue.push({ x: x + 1, y });
    if (y > 0) queue.push({ x, y: y - 1 });
    if (y < height - 1) queue.push({ x, y: y + 1 });
  }

  return { filled, count };
}

function buildSegmentsFromMask(mask, width, height) {
  const segments = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!getPixel(mask, width, x, y)) continue;

      const leftFilled = x > 0 && getPixel(mask, width, x - 1, y);
      const rightFilled = x < width - 1 && getPixel(mask, width, x + 1, y);
      const upFilled = y > 0 && getPixel(mask, width, x, y - 1);
      const downFilled = y < height - 1 && getPixel(mask, width, x, y + 1);

      if (!upFilled) segments.push([{ x, y }, { x: x + 1, y }]);
      if (!rightFilled) segments.push([{ x: x + 1, y }, { x: x + 1, y: y + 1 }]);
      if (!downFilled) segments.push([{ x: x + 1, y: y + 1 }, { x, y: y + 1 }]);
      if (!leftFilled) segments.push([{ x, y: y + 1 }, { x, y }]);
    }
  }

  return segments;
}

function segmentsToLoop(segments) {
  const nextByStart = new Map();

  for (const [a, b] of segments) {
    const key = `${a.x},${a.y}`;
    if (!nextByStart.has(key)) nextByStart.set(key, []);
    nextByStart.get(key).push(b);
  }

  if (segments.length === 0) return [];
  const start = segments[0][0];
  const loop = [start];
  let current = start;
  let guard = 0;

  while (guard < segments.length + 5) {
    guard += 1;
    const key = `${current.x},${current.y}`;
    const nextList = nextByStart.get(key);
    if (!nextList || nextList.length === 0) break;

    const next = nextList.shift();
    current = next;
    if (current.x === start.x && current.y === start.y) break;
    loop.push(current);
  }

  return loop;
}

export class FillTool extends BaseTool {
  onMouseDown({ screenPoint }) {
    const { shapeStore, layerStore, historyStore, camera, appState } = this.context;
    const activeLayer = layerStore.getActiveLayer();
    if (!activeLayer || activeLayer.locked) {
      return;
    }

    const canvas = this.context.canvas;
    const width = Math.floor(canvas.clientWidth);
    const height = Math.floor(canvas.clientHeight);
    if (width < 2 || height < 2) {
      return;
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = width;
    offscreen.height = height;
    const bctx = offscreen.getContext("2d", { willReadFrequently: true });

    bctx.clearRect(0, 0, width, height);
    bctx.globalAlpha = 1;
    bctx.strokeStyle = "#000";
    bctx.lineCap = "round";
    bctx.lineJoin = "round";

    for (const shape of shapeStore.getShapes()) {
      if (shape.type !== "line") continue;
      const s = camera.worldToScreen(shape.start);
      const e = camera.worldToScreen(shape.end);
      bctx.lineWidth = Math.max(1, Number(shape.strokeWidth) || 1);
      bctx.beginPath();
      bctx.moveTo(s.x, s.y);
      bctx.lineTo(e.x, e.y);
      bctx.stroke();
    }

    const imageData = bctx.getImageData(0, 0, width, height);
    const boundaryMask = new Uint8Array(width * height);
    for (let i = 0; i < boundaryMask.length; i += 1) {
      const px = i * 4;
      boundaryMask[i] = imageData.data[px + 3] > 0 ? 1 : 0;
    }

    const seedX = Math.max(0, Math.min(width - 1, Math.floor(screenPoint.x)));
    const seedY = Math.max(0, Math.min(height - 1, Math.floor(screenPoint.y)));
    const { filled } = floodFill(boundaryMask, width, height, seedX, seedY);

    if (!filled) {
      appState.notifyStatus?.("No enclosed region found");
      return;
    }

    const segments = buildSegmentsFromMask(filled, width, height);
    const loop = segmentsToLoop(segments);

    if (loop.length < 3) {
      appState.notifyStatus?.("No enclosed region found");
      return;
    }

    const worldPoints = loop.map((point) => camera.screenToWorld(point));

    const currentStyle = getCurrentStyle(appState);

    historyStore.pushState(shapeStore.serialize());
    shapeStore.addShape(
      new FillRegion({
        layerId: activeLayer.id,
        points: worldPoints,
        fillEnabled: true,
        fillColor: currentStyle.fillColor,
        fillOpacity: currentStyle.fillOpacity,
        strokeColor: "transparent",
        strokeOpacity: 0,
        strokeWidth: 0,
      }),
    );
  }
}
