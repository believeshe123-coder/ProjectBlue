import { BaseTool } from "./baseTool.js";
import { FillRegion } from "../models/fillRegion.js";
import { getIsoSpacingWorld, worldToIsoUV } from "../core/isoGrid.js";
import { traceContoursFromMask } from "../utils/marchingSquares.js";

const MIN_PIXELS_PER_WORLD = 8;
const MAX_PIXELS_PER_WORLD = 32;
const MAX_OFFSCREEN_DIMENSION = 4096;

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

function expandBounds(bounds, padding) {
  return {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  };
}

function boundsFromPoints(points) {
  if (!Array.isArray(points) || !points.length) return null;

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

function unionBounds(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function getShapeBounds(shape) {
  if (shape.type === "line") {
    return boundsFromPoints([shape.start, shape.end]);
  }

  if (shape.type === "polygon-shape" && Array.isArray(shape.pointsWorld) && shape.pointsWorld.length >= 2) {
    return shape.getBounds?.() ?? boundsFromPoints(shape.pointsWorld);
  }

  return null;
}

export class FillTool extends BaseTool {
  constructor(context) {
    super(context);
    this.barrierCanvas = document.createElement("canvas");
    this.barrierCtx = this.barrierCanvas.getContext("2d", { willReadFrequently: true });
  }

  resolveWorldRasterBounds(clickWorld, boundaryShapes) {
    const { camera } = this.context;

    const containingPolygons = boundaryShapes
      .filter((shape) => shape.type === "polygon-shape" && shape.containsPoint?.(clickWorld))
      .map((shape) => ({
        shape,
        bounds: shape.getBounds?.() ?? boundsFromPoints(shape.pointsWorld),
      }))
      .filter(({ bounds }) => !!bounds)
      .sort((a, b) => {
        const areaA = Math.abs((a.bounds.maxX - a.bounds.minX) * (a.bounds.maxY - a.bounds.minY));
        const areaB = Math.abs((b.bounds.maxX - b.bounds.minX) * (b.bounds.maxY - b.bounds.minY));
        return areaA - areaB;
      });

    const maxStrokeWidthPx = boundaryShapes.reduce(
      (max, shape) => Math.max(max, Number.isFinite(shape.strokeWidth) ? shape.strokeWidth : 1),
      1,
    );
    const strokeWidthWorld = maxStrokeWidthPx / Math.max(camera.zoom, 0.001);
    const paddingWorld = strokeWidthWorld * 4 + getIsoSpacingWorld() * 10;

    if (containingPolygons.length) {
      return expandBounds(containingPolygons[0].bounds, paddingWorld);
    }

    let union = null;
    for (const shape of boundaryShapes) {
      union = unionBounds(union, getShapeBounds(shape));
    }

    if (!union) return null;
    return expandBounds(union, paddingWorld);
  }

  getRasterSizing(worldBounds) {
    const dpr = window.devicePixelRatio || 1;
    const worldWidth = Math.max(0.001, worldBounds.maxX - worldBounds.minX);
    const worldHeight = Math.max(0.001, worldBounds.maxY - worldBounds.minY);

    let pixelsPerWorld = clamp(Math.round(16 * dpr), MIN_PIXELS_PER_WORLD, MAX_PIXELS_PER_WORLD);
    let offW = Math.max(1, Math.ceil(worldWidth * pixelsPerWorld));
    let offH = Math.max(1, Math.ceil(worldHeight * pixelsPerWorld));

    while ((offW > MAX_OFFSCREEN_DIMENSION || offH > MAX_OFFSCREEN_DIMENSION) && pixelsPerWorld > 1) {
      pixelsPerWorld -= 1;
      offW = Math.max(1, Math.ceil(worldWidth * pixelsPerWorld));
      offH = Math.max(1, Math.ceil(worldHeight * pixelsPerWorld));
    }

    return { pixelsPerWorld, offW, offH };
  }

  drawBoundaryRaster(boundaryShapes, worldBounds, pixelsPerWorld, offW, offH) {
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

    const toOffscreen = (point) => ({
      x: (point.x - worldBounds.minX) * pixelsPerWorld,
      y: (point.y - worldBounds.minY) * pixelsPerWorld,
    });

    for (const shape of boundaryShapes) {
      if (shape.type === "line") {
        const start = toOffscreen(shape.start);
        const end = toOffscreen(shape.end);
        const strokeWidthWorld = (Number.isFinite(shape.strokeWidth) ? shape.strokeWidth : 1) / Math.max(this.context.camera.zoom, 0.001);
        bctx.lineWidth = Math.max(1, strokeWidthWorld * pixelsPerWorld + 2);
        bctx.beginPath();
        bctx.moveTo(start.x, start.y);
        bctx.lineTo(end.x, end.y);
        bctx.stroke();
      }

      if (shape.type === "polygon-shape" && Array.isArray(shape.pointsWorld) && shape.pointsWorld.length >= 2) {
        const points = shape.pointsWorld.map(toOffscreen);
        const strokeWidthWorld = (Number.isFinite(shape.strokeWidth) ? shape.strokeWidth : 1) / Math.max(this.context.camera.zoom, 0.001);
        bctx.lineWidth = Math.max(1, strokeWidthWorld * pixelsPerWorld + 2);
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

  floodFill(alpha, width, height, seedX, seedY) {
    const getAlpha = (x, y) => alpha[(y * width + x) * 4 + 3];
    if (getAlpha(seedX, seedY) > 0) return null;

    const size = width * height;
    const filledMask = new Uint8Array(size);
    const queueX = new Int32Array(size);
    const queueY = new Int32Array(size);

    let head = 0;
    let tail = 0;
    let touchesEdge = false;

    queueX[tail] = seedX;
    queueY[tail] = seedY;
    tail += 1;
    filledMask[seedY * width + seedX] = 1;

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

      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        touchesEdge = true;
      }

      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const index = ny * width + nx;
        if (filledMask[index]) continue;
        if (getAlpha(nx, ny) > 0) continue;
        filledMask[index] = 1;
        queueX[tail] = nx;
        queueY[tail] = ny;
        tail += 1;
      }
    }

    if (touchesEdge) {
      return null;
    }

    let dilatedMask = filledMask;
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
    }

    return dilatedMask;
  }

  onMouseDown({ event, worldPoint }) {
    if (event.button !== 0) return;

    const { shapeStore, appState } = this.context;
    const clickWorld = worldPoint;
    const boundaryShapes = shapeStore
      .getShapes()
      .filter((shape) => shape.visible !== false && (shape.type === "line" || shape.type === "polygon-shape"));

    if (!boundaryShapes.length) return;

    const worldBounds = this.resolveWorldRasterBounds(clickWorld, boundaryShapes);
    if (!worldBounds) return;

    const { pixelsPerWorld, offW, offH } = this.getRasterSizing(worldBounds);
    this.drawBoundaryRaster(boundaryShapes, worldBounds, pixelsPerWorld, offW, offH);

    const clickOffX = clamp(Math.round((clickWorld.x - worldBounds.minX) * pixelsPerWorld), 0, offW - 1);
    const clickOffY = clamp(Math.round((clickWorld.y - worldBounds.minY) * pixelsPerWorld), 0, offH - 1);

    const imageData = this.barrierCtx.getImageData(0, 0, offW, offH);
    const fillMask = this.floodFill(imageData.data, offW, offH, clickOffX, clickOffY);
    if (!fillMask) return;

    const contoursPx = traceContoursFromMask(fillMask, offW, offH);
    if (!contoursPx.length) return;

    const epsilonWorld = 0.75 / pixelsPerWorld;
    const contoursWorld = contoursPx
      .map((contour) => {
        const contourWorld = contour.map((point) => ({
          x: worldBounds.minX + point.x / pixelsPerWorld,
          y: worldBounds.minY + point.y / pixelsPerWorld,
        }));
        const simplified = simplifyRdp([...contourWorld, contourWorld[0]], epsilonWorld).slice(0, -1);
        return simplified;
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
