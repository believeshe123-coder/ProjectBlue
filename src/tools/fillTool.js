import { BaseTool } from "./baseTool.js";
import { FillRegion } from "../models/fillRegion.js";
import { worldToIsoUV } from "../core/isoGrid.js";
import { traceContoursFromMask } from "../utils/marchingSquares.js";

const MAX_FILL_SIDE = 1536;
const FILL_CHUNK_SIZE = 50_000;
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

export class FillTool extends BaseTool {
  constructor(context) {
    super(context);
    this.barrierCanvas = document.createElement("canvas");
    this.barrierCtx = this.barrierCanvas.getContext("2d", { willReadFrequently: true });
    this.activeFillToken = 0;
  }

  cancelCurrentFill(reason = "Cancelled") {
    this.activeFillToken += 1;
    this.context.appState.fillAbort = true;
    if (reason) {
      console.info("[fill] abort requested", reason);
    }
  }

  onDeactivate() {
    this.cancelCurrentFill("tool changed");
  }

  onKeyDown(event) {
    if (event.key === "Escape") {
      this.cancelCurrentFill("Escape key");
    }
  }

  getViewportRasterSizing() {
    const viewW = Math.max(1, Math.floor(this.context.camera.viewW || this.context.canvas?.clientWidth || this.context.canvas?.width || 1));
    const viewH = Math.max(1, Math.floor(this.context.camera.viewH || this.context.canvas?.clientHeight || this.context.canvas?.height || 1));
    const largestSide = Math.max(viewW, viewH);
    const scaleDown = largestSide > MAX_FILL_SIDE ? MAX_FILL_SIDE / largestSide : 1;

    return {
      viewW,
      viewH,
      scaleDown,
      offW: Math.max(1, Math.floor(viewW * scaleDown)),
      offH: Math.max(1, Math.floor(viewH * scaleDown)),
    };
  }

  drawBoundaryRaster(boundaryShapes, scaleDown, offW, offH) {
    if (this.barrierCanvas.width !== offW) this.barrierCanvas.width = offW;
    if (this.barrierCanvas.height !== offH) this.barrierCanvas.height = offH;

    const bctx = this.barrierCtx;
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, offW, offH);
    bctx.imageSmoothingEnabled = false;
    bctx.globalAlpha = 1;
    bctx.strokeStyle = "#000";
    bctx.lineCap = "round";
    bctx.lineJoin = "round";

    const toOffscreen = (point) => {
      const screenPoint = this.context.camera.worldToScreen(point);
      return {
        x: screenPoint.x * scaleDown,
        y: screenPoint.y * scaleDown,
      };
    };

    for (const shape of boundaryShapes) {
      if (shape.type === "line") {
        const start = toOffscreen(shape.start);
        const end = toOffscreen(shape.end);
        bctx.lineWidth = Math.max(1, ((Number.isFinite(shape.strokeWidth) ? shape.strokeWidth : 1) + 2) * scaleDown);
        bctx.beginPath();
        bctx.moveTo(start.x, start.y);
        bctx.lineTo(end.x, end.y);
        bctx.stroke();
      }

      if (shape.type === "polygon-shape" && Array.isArray(shape.pointsWorld) && shape.pointsWorld.length >= 2) {
        const points = shape.pointsWorld.map(toOffscreen);
        bctx.lineWidth = Math.max(1, ((Number.isFinite(shape.strokeWidth) ? shape.strokeWidth : 1) + 2) * scaleDown);
        bctx.beginPath();
        bctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) {
          bctx.lineTo(points[i].x, points[i].y);
        }
        bctx.closePath();
        bctx.stroke();
      }
    }
  }

  async floodFill(alpha, width, height, seedX, seedY, token) {
    const getAlpha = (x, y) => alpha[(y * width + x) * 4 + 3];
    if (getAlpha(seedX, seedY) > 0) {
      return { fillMask: null, status: "hit_boundary", visitedCount: 0 };
    }

    const size = width * height;
    const visitedMask = new Uint8Array(size);
    const queue = new Uint32Array(size);

    let head = 0;
    let tail = 0;
    let touchesEdge = false;
    let visitCount = 0;
    let processedSinceYield = 0;

    queue[tail] = seedY * width + seedX;
    tail += 1;
    visitedMask[seedY * width + seedX] = 1;


    while (head < tail) {
      const index = queue[head];
      head += 1;
      visitCount += 1;

      const x = index % width;
      const y = Math.floor(index / width);

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesEdge = true;
      }

      const tryQueueNeighbor = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
        const neighborIndex = ny * width + nx;
        if (visitedMask[neighborIndex]) return;
        if (getAlpha(nx, ny) > 0) return;
        visitedMask[neighborIndex] = 1;
        queue[tail] = neighborIndex;
        tail += 1;
      };

      tryQueueNeighbor(x + 1, y);
      tryQueueNeighbor(x - 1, y);
      tryQueueNeighbor(x, y + 1);
      tryQueueNeighbor(x, y - 1);

      processedSinceYield += 1;
      if (processedSinceYield >= FILL_CHUNK_SIZE) {
        processedSinceYield = 0;
        if (this.context.appState.fillAbort || token !== this.activeFillToken) {
          return { fillMask: null, status: "cancelled", visitedCount: visitCount };
        }
        await new Promise((resolve) => window.requestAnimationFrame(resolve));
      }
    }

    if (touchesEdge) {
      return { fillMask: null, status: "touches_edge", visitedCount: visitCount };
    }

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    let dilatedMask = visitedMask;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const nextMask = dilatedMask.slice();
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if (!dilatedMask[idx]) continue;
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            if (getAlpha(nx, ny) > 0) continue;
            nextMask[ny * width + nx] = 1;
          }
        }
      }
      dilatedMask = nextMask;

      if (this.context.appState.fillAbort || token !== this.activeFillToken) {
        return { fillMask: null, status: "cancelled", visitedCount: visitCount };
      }
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    }

    return { fillMask: dilatedMask, status: "ok", visitedCount: visitCount };
  }

  async onMouseDown({ event, screenPoint }) {
    if (event.button !== 0) return;

    const fillToken = this.activeFillToken + 1;
    this.activeFillToken = fillToken;
    this.context.appState.fillAbort = false;
    this.context.appState.setBusyStatus?.("Filling…");

    const startMs = performance.now();

    const { shapeStore, appState } = this.context;
    const boundaryShapes = shapeStore
      .getShapes()
      .filter((shape) => shape.visible !== false && (shape.type === "line" || shape.type === "polygon-shape"));

    if (!boundaryShapes.length) {
      this.context.appState.clearBusyStatus?.();
      return;
    }

    const { viewW, viewH, scaleDown, offW, offH } = this.getViewportRasterSizing();
    this.drawBoundaryRaster(boundaryShapes, scaleDown, offW, offH);

    const clickOffX = clamp(Math.floor(screenPoint.x * scaleDown), 0, offW - 1);
    const clickOffY = clamp(Math.floor(screenPoint.y * scaleDown), 0, offH - 1);

    const imageData = this.barrierCtx.getImageData(0, 0, offW, offH);
    const { fillMask, status, visitedCount } = await this.floodFill(imageData.data, offW, offH, clickOffX, clickOffY, fillToken);
    if (!fillMask) {
      if (status === "cancelled") {
        appState.notifyStatus?.("Fill cancelled", 1200);
        console.info("[fill] cancelled", { offW, offH, visitedCount });
      } else if (status === "touches_edge") {
        console.info("[fill] abort: region touches raster edge", { offW, offH, visitedCount });
      }
      this.context.appState.clearBusyStatus?.();
      return;
    }

    if (this.context.appState.fillAbort || fillToken !== this.activeFillToken) {
      this.context.appState.clearBusyStatus?.();
      return;
    }

    const contoursPx = traceContoursFromMask(fillMask, offW, offH);
    if (!contoursPx.length) {
      this.context.appState.clearBusyStatus?.();
      return;
    }

    const epsilonWorld = 0.75 / Math.max(this.context.camera.zoom * scaleDown, 0.001);
    const contoursWorld = contoursPx
      .map((contour) => {
        const contourWorld = contour.map((point) => ({
          x: this.context.camera.x + point.x / Math.max(this.context.camera.zoom * scaleDown, 0.001),
          y: this.context.camera.y + point.y / Math.max(this.context.camera.zoom * scaleDown, 0.001),
        }));
        const simplified = simplifyRdp([...contourWorld, contourWorld[0]], epsilonWorld).slice(0, -1);
        return simplified;
      })
      .filter((contour) => contour.length >= 3)
      .sort((a, b) => Math.abs(contourArea(b)) - Math.abs(contourArea(a)));

    if (!contoursWorld.length) {
      this.context.appState.clearBusyStatus?.();
      return;
    }

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

    const elapsed = performance.now() - startMs;
    console.info("[fill] stats", {
      offW,
      offH,
      viewW,
      viewH,
      scaleDown,
      visitedCount,
      elapsedMs: Number(elapsed.toFixed(1)),
    });
    this.context.appState.clearBusyStatus?.();
  }
}
