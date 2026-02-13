import { BaseTool } from "./baseTool.js";
import { PolygonShape } from "../models/polygonShape.js";
import { distance, isPointInPolygon } from "../utils/math.js";

const MAX_CYCLE_LENGTH = 48;
const MIN_AREA = 1e-4;

function isPolygonShape(shape) {
  return shape.type === "polygon-shape";
}

function isLineShape(shape) {
  return shape.type === "line";
}

export function pointInPolygon(point, polygonPoints) {
  return isPointInPolygon(point, polygonPoints);
}

export function polygonArea(points) {
  if (!points || points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return area / 2;
}

export function clusterPoints(points, eps) {
  const clusters = [];
  const assignments = [];

  points.forEach((point) => {
    let clusterIndex = -1;
    for (let i = 0; i < clusters.length; i += 1) {
      const cluster = clusters[i];
      if (distance(point, cluster) <= eps) {
        clusterIndex = i;
        break;
      }
    }

    if (clusterIndex === -1) {
      clusterIndex = clusters.length;
      clusters.push({ x: point.x, y: point.y, count: 1 });
      assignments.push(clusterIndex);
      return;
    }

    const cluster = clusters[clusterIndex];
    const nextCount = cluster.count + 1;
    cluster.x = (cluster.x * cluster.count + point.x) / nextCount;
    cluster.y = (cluster.y * cluster.count + point.y) / nextCount;
    cluster.count = nextCount;
    assignments.push(clusterIndex);
  });

  return {
    nodes: clusters.map((cluster, id) => ({ id, x: cluster.x, y: cluster.y })),
    assignments,
  };
}

function canonicalizeCycle(nodeIds) {
  if (!nodeIds.length) {
    return "";
  }

  const rotations = [];
  for (let i = 0; i < nodeIds.length; i += 1) {
    rotations.push(nodeIds.slice(i).concat(nodeIds.slice(0, i)).join("-"));
  }

  const reversed = [...nodeIds].reverse();
  for (let i = 0; i < reversed.length; i += 1) {
    rotations.push(reversed.slice(i).concat(reversed.slice(0, i)).join("-"));
  }

  rotations.sort();
  return rotations[0];
}

export function findCycles(graph) {
  const unique = new Set();
  const cycles = [];
  const { nodes, adjacency } = graph;

  const dfs = (start, current, path, visited) => {
    const neighbors = adjacency.get(current) ?? [];
    for (const next of neighbors) {
      if (next === start && path.length >= 3) {
        const key = canonicalizeCycle(path);
        if (!unique.has(key)) {
          unique.add(key);
          cycles.push([...path]);
        }
        continue;
      }

      if (visited.has(next) || path.length >= MAX_CYCLE_LENGTH) {
        continue;
      }

      visited.add(next);
      path.push(next);
      dfs(start, next, path, visited);
      path.pop();
      visited.delete(next);
    }
  };

  for (const node of nodes) {
    const start = node.id;
    const visited = new Set([start]);
    dfs(start, start, [start], visited);
  }

  return cycles;
}

function buildLineGraph(lines, eps) {
  const endpoints = lines.flatMap((line) => [line.start, line.end]);
  const { nodes, assignments } = clusterPoints(endpoints, eps);
  const adjacency = new Map(nodes.map((node) => [node.id, new Set()]));

  for (let i = 0; i < lines.length; i += 1) {
    const startNodeId = assignments[i * 2];
    const endNodeId = assignments[i * 2 + 1];
    if (startNodeId === endNodeId) {
      continue;
    }

    adjacency.get(startNodeId)?.add(endNodeId);
    adjacency.get(endNodeId)?.add(startNodeId);
  }

  return {
    nodes,
    adjacency: new Map([...adjacency.entries()].map(([nodeId, neighbors]) => [nodeId, [...neighbors]])),
  };
}

export class FillTool extends BaseTool {
  constructor(context) {
    super(context);
    this.usesRightClick = true;
  }

  onMouseDown({ event, worldPoint }) {
    const { shapeStore, historyStore, appState, camera } = this.context;

    const shapes = shapeStore.getShapes();
    const clickFillColor = event?.button === 2 ? appState.currentStyle.fillColor : appState.currentStyle.strokeColor;
    const target = [...shapes]
      .reverse()
      .find((shape) => shape.visible !== false && shape.locked !== true && isPolygonShape(shape) && shape.containsPoint(worldPoint));

    if (target) {
      this.context.pushHistoryState?.() ?? historyStore.pushState(shapeStore.serialize());
      target.fillColor = clickFillColor;
      target.fillAlpha = 1;
      target.fillOpacity = 1;
      target.fillEnabled = true;
      return;
    }

    const lines = shapes.filter((shape) => shape.visible !== false && shape.locked !== true && isLineShape(shape));
    const eps = 2 / Math.max(camera.zoom, 1e-6);
    const graph = buildLineGraph(lines, eps);
    const cycles = findCycles(graph);

    const candidates = cycles
      .map((cycleNodeIds) => cycleNodeIds.map((nodeId) => graph.nodes[nodeId]))
      .map((cyclePoints) => ({
        pointsWorld: cyclePoints.map((point) => ({ x: point.x, y: point.y })),
        area: Math.abs(polygonArea(cyclePoints)),
      }))
      .filter((cycle) => cycle.area > Math.max(MIN_AREA, eps * eps * 0.25))
      .filter((cycle) => pointInPolygon(worldPoint, cycle.pointsWorld))
      .sort((a, b) => a.area - b.area);

    const selected = candidates[0];

    if (!selected) {
      appState.notifyStatus?.("No closed shape found—close the loop (snap endpoints).", 1800);
      return;
    }

    this.context.pushHistoryState?.() ?? historyStore.pushState(shapeStore.serialize());

    const polygon = new PolygonShape({
      pointsWorld: selected.pointsWorld,
      strokeColor: appState.currentStyle.strokeColor,
      strokeWidth: appState.currentStyle.strokeWidth,
      fillColor: clickFillColor,
      fillAlpha: 1,
    });

    shapeStore.addShape(polygon);
  }
}
