import { BaseTool } from "./baseTool.js";
import { FillRegion } from "../models/fillRegion.js";
import { worldToIsoUV } from "../core/isoGrid.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function simplifyRdp(points, epsilon) {
  if (!Array.isArray(points) || points.length <= 3) return points;

  const sqEpsilon = epsilon * epsilon;

  function sqDistancePointToSegment(point, start, end) {
    let x = start.x;
    let y = start.y;
    let dx = end.x - x;
    let dy = end.y - y;

    if (dx !== 0 || dy !== 0) {
      const t = ((point.x - x) * dx + (point.y - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = end.x;
        y = end.y;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }

    dx = point.x - x;
    dy = point.y - y;
    return dx * dx + dy * dy;
  }

  function simplifySection(startIndex, endIndex, input, output) {
    let maxDistance = sqEpsilon;
    let index = -1;

    for (let i = startIndex + 1; i < endIndex; i += 1) {
      const distance = sqDistancePointToSegment(input[i], input[startIndex], input[endIndex]);
      if (distance > maxDistance) {
        index = i;
        maxDistance = distance;
      }
    }

    if (index !== -1) {
      if (index - startIndex > 1) simplifySection(startIndex, index, input, output);
      output.push(input[index]);
      if (endIndex - index > 1) simplifySection(index, endIndex, input, output);
    }
  }

  const output = [points[0]];
  simplifySection(0, points.length - 1, points, output);
  output.push(points[points.length - 1]);
  return output;
}

function contourArea(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function buildContoursFromMask(mask, width, height) {
  const getMask = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x]);

  const adjacency = new Map();
  const addEdge = (ax, ay, bx, by) => {
    const a = `${ax},${ay}`;
    const b = `${bx},${by}`;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!getMask(x, y)) continue;
      if (!getMask(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!getMask(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!getMask(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!getMask(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }

  const visited = new Set();
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const parsePoint = (key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  };

  const contours = [];
  for (const [start, neighbors] of adjacency.entries()) {
    for (const next of neighbors) {
      const startEdge = edgeKey(start, next);
      if (visited.has(startEdge)) continue;

      const contour = [];
      let previous = start;
      let current = next;
      contour.push(parsePoint(start));

      visited.add(startEdge);

      while (current !== start) {
        contour.push(parsePoint(current));
        const options = [...(adjacency.get(current) ?? [])].filter((node) => node !== previous);
        if (!options.length) break;
        let nextNode = options[0];
        if (options.length > 1) {
          const prevPoint = parsePoint(previous);
          const currentPoint = parsePoint(current);
          const incoming = { x: currentPoint.x - prevPoint.x, y: currentPoint.y - prevPoint.y };
          let bestScore = Infinity;
          for (const option of options) {
            const optionPoint = parsePoint(option);
            const outgoing = { x: optionPoint.x - currentPoint.x, y: optionPoint.y - currentPoint.y };
            const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
            const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
            const angle = Math.atan2(cross, dot);
            const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
            if (normalized < bestScore) {
              bestScore = normalized;
              nextNode = option;
            }
          }
        }

        const currentEdge = edgeKey(current, nextNode);
        visited.add(currentEdge);
        previous = current;
        current = nextNode;
      }

      if (contour.length >= 3) {
        contours.push(contour);
      }
    }
  }

  return contours;
}

export class FillTool extends BaseTool {
  constructor(context) {
    super(context);
    this.barrierCanvas = document.createElement("canvas");
    this.barrierCtx = this.barrierCanvas.getContext("2d", { willReadFrequently: true });
  }

  buildBarrierCanvas(canvasCssW, canvasCssH, dpr) {
    const pixelWidth = Math.max(1, Math.round(canvasCssW * dpr));
    const pixelHeight = Math.max(1, Math.round(canvasCssH * dpr));

    if (this.barrierCanvas.width !== pixelWidth) this.barrierCanvas.width = pixelWidth;
    if (this.barrierCanvas.height !== pixelHeight) this.barrierCanvas.height = pixelHeight;

    const bctx = this.barrierCtx;
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, canvasCssW, canvasCssH);
    bctx.imageSmoothingEnabled = false;
    bctx.globalAlpha = 1;
    bctx.strokeStyle = "#000";
    bctx.lineCap = "round";
    bctx.lineJoin = "round";

    const { shapeStore, camera } = this.context;
    const shapes = shapeStore.getShapes().filter((shape) => shape.visible !== false && shape.type !== "fillRegion");

    for (const shape of shapes) {
      if (shape.type === "line") {
        const start = camera.worldToScreen(shape.start);
        const end = camera.worldToScreen(shape.end);
        const barrierWidthPx = Math.max(2, Math.round(shape.strokeWidth * camera.zoom) + 2);
        bctx.lineWidth = barrierWidthPx / dpr;
        bctx.beginPath();
        bctx.moveTo(start.x, start.y);
        bctx.lineTo(end.x, end.y);
        bctx.stroke();
      }

      if (shape.type === "polygon-shape" && Array.isArray(shape.pointsWorld) && shape.pointsWorld.length >= 2) {
        const points = shape.pointsWorld.map((point) => camera.worldToScreen(point));
        const barrierWidthPx = Math.max(2, Math.round(shape.strokeWidth * camera.zoom) + 2);
        bctx.lineWidth = barrierWidthPx / dpr;
        bctx.beginPath();
        bctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) {
          bctx.lineTo(points[i].x, points[i].y);
        }
        bctx.closePath();
        bctx.stroke();
      }
    }

    return { pixelWidth, pixelHeight };
  }

  onMouseDown({ event, screenPoint }) {
    if (event.button !== 0) return;

    const { canvas, camera, shapeStore, appState } = this.context;
    const dpr = window.devicePixelRatio || 1;
    const canvasCssW = canvas.clientWidth;
    const canvasCssH = canvas.clientHeight;

    const { pixelWidth, pixelHeight } = this.buildBarrierCanvas(canvasCssW, canvasCssH, dpr);
    const clickX = clamp(Math.round(screenPoint.x * dpr), 0, pixelWidth - 1);
    const clickY = clamp(Math.round(screenPoint.y * dpr), 0, pixelHeight - 1);

    const imageData = this.barrierCtx.getImageData(0, 0, pixelWidth, pixelHeight);
    const alpha = imageData.data;
    const getAlpha = (x, y) => alpha[(y * pixelWidth + x) * 4 + 3];

    if (getAlpha(clickX, clickY) > 0) {
      return;
    }

    const size = pixelWidth * pixelHeight;
    const filledMask = new Uint8Array(size);
    const queueX = new Int32Array(size);
    const queueY = new Int32Array(size);

    let head = 0;
    let tail = 0;
    queueX[tail] = clickX;
    queueY[tail] = clickY;
    tail += 1;
    filledMask[clickY * pixelWidth + clickX] = 1;

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    while (head < tail) {
      const x = queueX[head];
      const y = queueY[head];
      head += 1;

      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= pixelWidth || ny >= pixelHeight) continue;
        const index = ny * pixelWidth + nx;
        if (filledMask[index]) continue;
        if (getAlpha(nx, ny) > 0) continue;
        filledMask[index] = 1;
        queueX[tail] = nx;
        queueY[tail] = ny;
        tail += 1;
      }
    }

    const dilatedMask = filledMask.slice();
    for (let y = 0; y < pixelHeight; y += 1) {
      for (let x = 0; x < pixelWidth; x += 1) {
        const idx = y * pixelWidth + x;
        if (!filledMask[idx]) continue;
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= pixelWidth || ny >= pixelHeight) continue;
          if (getAlpha(nx, ny) > 0) continue;
          dilatedMask[ny * pixelWidth + nx] = 1;
        }
      }
    }

    const contoursPx = buildContoursFromMask(dilatedMask, pixelWidth, pixelHeight);
    if (!contoursPx.length) return;

    const epsilonScreen = 0.75 / dpr;
    const contoursWorld = contoursPx
      .map((contour) => {
        const contourCss = contour.map((point) => ({ x: point.x / dpr, y: point.y / dpr }));
        const simplified = simplifyRdp([...contourCss, contourCss[0]], epsilonScreen).slice(0, -1);
        return simplified.map((screen) => camera.screenToWorld(screen));
      })
      .filter((contour) => contour.length >= 3)
      .sort((a, b) => Math.abs(contourArea(b)) - Math.abs(contourArea(a)));

    if (!contoursWorld.length) return;

    const contoursUV = contoursWorld.map((contour) => contour.map((point) => worldToIsoUV(point)));

    this.context.pushHistoryState?.();
    const fillRegion = new FillRegion({
      pointsWorld: contoursWorld[0],
      contoursWorld,
      contoursUV,
      color: appState.currentStyle.fillColor,
      alpha: Number.isFinite(appState.currentStyle.fillOpacity) ? appState.currentStyle.fillOpacity : 1,
      createdAt: Date.now(),
      zIndex: -1000,
    });
    shapeStore.addShape(fillRegion);
  }
}
