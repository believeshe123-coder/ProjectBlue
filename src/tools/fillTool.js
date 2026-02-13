import { BaseTool } from "./baseTool.js";
import { FillRegion } from "../models/fillRegion.js";

function isLineShape(shape) {
  return shape.type === "line";
}

function isFillRegion(shape) {
  return shape.type === "fill-region";
}

function isPolygonShape(shape) {
  return shape.type === "polygon-shape";
}

function screenToPixel(screenPoint, dpr) {
  return {
    x: Math.round(screenPoint.x * dpr),
    y: Math.round(screenPoint.y * dpr),
  };
}

function isInsidePixelBounds(point, width, height) {
  return point.x >= 0 && point.y >= 0 && point.x < width && point.y < height;
}

function drawBoundaryLines(ctx, lines, camera, dpr) {
  ctx.strokeStyle = "rgba(0, 0, 0, 1)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const line of lines) {
    const startScreen = camera.worldToScreen(line.start);
    const endScreen = camera.worldToScreen(line.end);
    const start = { x: startScreen.x * dpr, y: startScreen.y * dpr };
    const end = { x: endScreen.x * dpr, y: endScreen.y * dpr };
    const boundaryWidthPx = Math.max(2, Math.round(line.strokeWidth * camera.zoom * dpr));

    ctx.lineWidth = boundaryWidthPx;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
}

function drawBoundaryPolygons(ctx, polygons, camera, dpr) {
  ctx.strokeStyle = "rgba(0, 0, 0, 1)";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const polygon of polygons) {
    if (!Array.isArray(polygon.pointsWorld) || polygon.pointsWorld.length < 2) continue;
    const points = polygon.pointsWorld.map((point) => {
      const p = camera.worldToScreen(point);
      return { x: p.x * dpr, y: p.y * dpr };
    });
    const boundaryWidthPx = Math.max(2, Math.round((polygon.strokeWidth ?? 1) * camera.zoom * dpr));

    ctx.lineWidth = boundaryWidthPx;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  }
}

function floodFillMask(imageData, width, height, startX, startY) {
  const pixels = imageData.data;
  const startIdx = (startY * width + startX) * 4;
  if (pixels[startIdx + 3] > 0) {
    return null;
  }

  const mask = new Uint8Array(width * height);
  const stack = [[startX, startY]];
  const visited = new Uint8Array(width * height);
  let touchesEdge = false;

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx]) continue;
    visited[idx] = 1;

    const pixelAlpha = pixels[idx * 4 + 3];
    if (pixelAlpha > 0) continue;

    mask[idx] = 1;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;

    stack.push([x + 1, y]);
    stack.push([x - 1, y]);
    stack.push([x, y + 1]);
    stack.push([x, y - 1]);
  }

  return { mask, touchesEdge };
}

function traceMaskContours(mask, width, height) {
  const segmentMap = new Map();
  const key = (x, y) => `${x},${y}`;

  function addSegment(a, b) {
    const aKey = key(a.x, a.y);
    const bKey = key(b.x, b.y);
    if (!segmentMap.has(aKey)) segmentMap.set(aKey, []);
    if (!segmentMap.has(bKey)) segmentMap.set(bKey, []);
    segmentMap.get(aKey).push({ from: a, to: b, toKey: bKey });
    segmentMap.get(bKey).push({ from: b, to: a, toKey: aKey });
  }

  const isFilled = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return mask[y * width + x] ? 1 : 0;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isFilled(x, y)) continue;

      if (!isFilled(x, y - 1)) addSegment({ x, y }, { x: x + 1, y });
      if (!isFilled(x + 1, y)) addSegment({ x: x + 1, y }, { x: x + 1, y: y + 1 });
      if (!isFilled(x, y + 1)) addSegment({ x: x + 1, y: y + 1 }, { x, y: y + 1 });
      if (!isFilled(x - 1, y)) addSegment({ x, y: y + 1 }, { x, y });
    }
  }

  const usedSegments = new Set();
  const contours = [];

  function segmentId(a, b) {
    return `${a.x},${a.y}->${b.x},${b.y}`;
  }

  for (const [startKey, edges] of segmentMap.entries()) {
    for (const edge of edges) {
      const id = segmentId(edge.from, edge.to);
      if (usedSegments.has(id)) continue;

      const contour = [];
      let current = edge;
      let currentKey = startKey;

      while (current) {
        const currentId = segmentId(current.from, current.to);
        if (usedSegments.has(currentId)) break;
        usedSegments.add(currentId);
        contour.push({ x: current.from.x, y: current.from.y });

        const nextKey = current.toKey;
        const nextEdges = segmentMap.get(nextKey) ?? [];
        let next = null;
        for (const candidate of nextEdges) {
          const candidateId = segmentId(candidate.from, candidate.to);
          if (usedSegments.has(candidateId)) continue;
          if (candidate.toKey === currentKey) continue;
          next = candidate;
          break;
        }

        currentKey = nextKey;
        current = next;

        if (!current && contour.length > 2) {
          contour.push({ ...contour[0] });
        }
      }

      if (contour.length > 3) {
        contours.push(contour);
      }
    }
  }

  return contours;
}

function perpendicularDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const projX = start.x + clamped * dx;
  const projY = start.y + clamped * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

function simplifyRdp(points, epsilon) {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let maxIndex = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDistance) {
      maxDistance = d;
      maxIndex = i;
    }
  }

  if (maxDistance > epsilon) {
    const left = simplifyRdp(points.slice(0, maxIndex + 1), epsilon);
    const right = simplifyRdp(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[points.length - 1]];
}

function simplifyClosedContour(contour, epsilon = 0.5) {
  if (contour.length < 4) return contour;
  const open = contour.slice(0, -1);
  const simplified = simplifyRdp(open, epsilon);
  if (simplified.length < 3) return contour;
  return [...simplified, { ...simplified[0] }];
}

function signedArea(points) {
  let area = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area / 2;
}

export class FillTool extends BaseTool {
  constructor(context) {
    super(context);
    this.usesRightClick = true;
  }

  onMouseDown({ event, worldPoint }) {
    const { shapeStore, historyStore, appState, canvas, camera } = this.context;
    const shapes = shapeStore.getShapes();
    const clickFillColor = event?.button === 2 ? appState.currentStyle.fillColor : appState.currentStyle.strokeColor;

    const existingFillRegion = [...shapes]
      .reverse()
      .find((shape) => shape.visible !== false && shape.locked !== true && isFillRegion(shape) && shape.containsPoint(worldPoint));

    if (existingFillRegion) {
      this.context.pushHistoryState?.() ?? historyStore.pushState(shapeStore.serialize());
      existingFillRegion.fillColor = clickFillColor;
      existingFillRegion.fillOpacity = appState.currentStyle.fillOpacity ?? 1;
      existingFillRegion.fillEnabled = true;
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const clickScreen = camera.worldToScreen(worldPoint);
    const clickPixel = screenToPixel(clickScreen, dpr);
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    if (!isInsidePixelBounds(clickPixel, canvasWidth, canvasHeight)) {
      return;
    }

    const offscreen = document.createElement("canvas");
    offscreen.width = canvasWidth;
    offscreen.height = canvasHeight;
    const offscreenCtx = offscreen.getContext("2d", { willReadFrequently: true });
    offscreenCtx.clearRect(0, 0, canvasWidth, canvasHeight);

    const lines = shapes.filter((shape) => shape.visible !== false && shape.locked !== true && isLineShape(shape));
    const polygons = shapes.filter((shape) => shape.visible !== false && shape.locked !== true && isPolygonShape(shape));

    drawBoundaryLines(offscreenCtx, lines, camera, dpr);
    drawBoundaryPolygons(offscreenCtx, polygons, camera, dpr);

    const imageData = offscreenCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    const fillResult = floodFillMask(imageData, canvasWidth, canvasHeight, clickPixel.x, clickPixel.y);

    if (!fillResult) {
      appState.notifyStatus?.("Click inside an enclosed region (not on a boundary).", 1800);
      return;
    }

    if (fillResult.touchesEdge) {
      appState.notifyStatus?.("Region is open; fill requires a closed boundary.", 1800);
      return;
    }

    const contours = traceMaskContours(fillResult.mask, canvasWidth, canvasHeight)
      .map((contour) => simplifyClosedContour(contour, 0.5))
      .filter((contour) => contour.length >= 4);

    if (!contours.length) {
      appState.notifyStatus?.("No enclosed face found at click point.", 1800);
      return;
    }

    const contourByArea = contours
      .map((contour) => ({ contour, area: Math.abs(signedArea(contour)) }))
      .sort((a, b) => b.area - a.area);

    const [outer, ...rest] = contourByArea;
    const toWorld = (point) => camera.screenToWorld({ x: point.x / dpr, y: point.y / dpr });

    const outerPoints = outer.contour.slice(0, -1).map(toWorld);
    const holes = rest
      .map((entry) => entry.contour.slice(0, -1).map(toWorld))
      .filter((hole) => hole.length >= 3);

    if (outerPoints.length < 3) {
      appState.notifyStatus?.("No enclosed face found at click point.", 1800);
      return;
    }

    this.context.pushHistoryState?.() ?? historyStore.pushState(shapeStore.serialize());

    const fillRegion = new FillRegion({
      points: outerPoints,
      holes,
      fillColor: clickFillColor,
      fillOpacity: appState.currentStyle.fillOpacity ?? 1,
      fillEnabled: true,
      strokeColor: "transparent",
      strokeWidth: 0,
      zIndex: -1,
    });

    shapeStore.addShape(fillRegion);
  }
}
