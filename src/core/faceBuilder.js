import { worldToIsoUV } from "./isoGrid.js";

const EPS = 1e-9;

function vertexKey(point) {
  return `${point.u},${point.v}`;
}

function parseVertexKey(key) {
  const [u, v] = key.split(",").map(Number);
  return { u, v };
}

function cross(a, b, c) {
  return (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);
}

function dot(a, b, c) {
  return (c.u - a.u) * (b.u - a.u) + (c.v - a.v) * (b.v - a.v);
}

function segmentLengthSquared(a, b) {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  return du * du + dv * dv;
}

function isPointOnSegment(point, start, end) {
  if (Math.abs(cross(start, end, point)) > EPS) return false;
  const projection = dot(start, end, point);
  if (projection < -EPS) return false;
  const lenSq = segmentLengthSquared(start, end);
  if (projection - lenSq > EPS) return false;
  return true;
}

function polygonSignedArea(points) {
  if (!points || points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.u * next.v - next.u * current.v;
  }
  return area / 2;
}

function polygonCentroid(points) {
  const sums = points.reduce((acc, p) => ({ u: acc.u + p.u, v: acc.v + p.v }), { u: 0, v: 0 });
  return { u: sums.u / points.length, v: sums.v / points.length };
}

function isPointInPolygonUV(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects =
      pi.v > point.v !== pj.v > point.v
      && point.u < ((pj.u - pi.u) * (point.v - pi.v)) / ((pj.v - pi.v) || EPS) + pi.u;
    if (intersects) inside = !inside;
  }
  return inside;
}

function toSnappedUVPoint(worldPoint, maybeUV) {
  const uv = maybeUV ?? worldToIsoUV(worldPoint);
  return { u: Math.round(uv.u), v: Math.round(uv.v) };
}

function buildSplitGraph(lines) {
  const vertices = new Map();
  const segments = [];

  for (const line of lines) {
    const start = toSnappedUVPoint(line.start, line.startUV);
    const end = toSnappedUVPoint(line.end, line.endUV);
    const startKey = vertexKey(start);
    const endKey = vertexKey(end);
    vertices.set(startKey, start);
    vertices.set(endKey, end);
    if (startKey === endKey) continue;
    segments.push({ start, end });
  }

  const allVertices = [...vertices.values()];
  const undirectedEdges = new Set();

  for (const segment of segments) {
    const splitPoints = allVertices.filter((vertex) => isPointOnSegment(vertex, segment.start, segment.end));
    splitPoints.sort((a, b) => segmentLengthSquared(segment.start, a) - segmentLengthSquared(segment.start, b));

    for (let i = 0; i < splitPoints.length - 1; i += 1) {
      const aKey = vertexKey(splitPoints[i]);
      const bKey = vertexKey(splitPoints[i + 1]);
      if (aKey === bKey) continue;
      undirectedEdges.add(aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`);
    }
  }

  const adjacency = new Map([...vertices.keys()].map((key) => [key, new Set()]));
  for (const edgeKey of undirectedEdges) {
    const [aKey, bKey] = edgeKey.split("|");
    adjacency.get(aKey)?.add(bKey);
    adjacency.get(bKey)?.add(aKey);
  }

  return { vertices, undirectedEdges, adjacency };
}

export function buildFacesFromLines(lines) {
  const { vertices, undirectedEdges } = buildSplitGraph(lines);
  if (!undirectedEdges.size) return [];

  const halfEdges = new Map();
  const outgoing = new Map();

  const addHalfEdge = (fromKey, toKey) => {
    const from = vertices.get(fromKey) ?? parseVertexKey(fromKey);
    const to = vertices.get(toKey) ?? parseVertexKey(toKey);
    const key = `${fromKey}>${toKey}`;
    const angle = Math.atan2(to.v - from.v, to.u - from.u);
    halfEdges.set(key, { key, fromKey, toKey, angle });
    if (!outgoing.has(fromKey)) outgoing.set(fromKey, []);
    outgoing.get(fromKey).push(key);
  };

  for (const edgeKey of undirectedEdges) {
    const [aKey, bKey] = edgeKey.split("|");
    addHalfEdge(aKey, bKey);
    addHalfEdge(bKey, aKey);
  }

  for (const keys of outgoing.values()) {
    keys.sort((aKey, bKey) => halfEdges.get(aKey).angle - halfEdges.get(bKey).angle);
  }

  const visited = new Set();
  const tracedFaces = [];
  const maxSteps = halfEdges.size + 4;

  for (const startKey of halfEdges.keys()) {
    if (visited.has(startKey)) continue;

    const loop = [];
    let currentKey = startKey;
    let closed = false;

    for (let steps = 0; steps < maxSteps; steps += 1) {
      if (visited.has(currentKey)) {
        if (currentKey === startKey) closed = true;
        break;
      }

      visited.add(currentKey);
      loop.push(currentKey);
      const current = halfEdges.get(currentKey);
      const reverseKey = `${current.toKey}>${current.fromKey}`;
      const nextCandidates = outgoing.get(current.toKey);
      if (!nextCandidates?.length) break;

      const reverseIndex = nextCandidates.indexOf(reverseKey);
      if (reverseIndex === -1) break;
      currentKey = nextCandidates[(reverseIndex + 1) % nextCandidates.length];
      if (currentKey === startKey) {
        closed = true;
        break;
      }
    }

    if (!closed || loop.length < 3) continue;

    const polygon = loop.map((edgeKey) => {
      const edge = halfEdges.get(edgeKey);
      return vertices.get(edge.fromKey) ?? parseVertexKey(edge.fromKey);
    });

    const signedArea = polygonSignedArea(polygon);
    if (Math.abs(signedArea) < EPS) continue;

    tracedFaces.push({ pointsUV: polygon, signedArea, areaAbs: Math.abs(signedArea) });
  }

  if (!tracedFaces.length) return [];
  const outsideFace = tracedFaces.reduce((largest, face) => (face.areaAbs > largest.areaAbs ? face : largest), tracedFaces[0]);

  return tracedFaces
    .filter((face) => face !== outsideFace)
    .filter((face) => face.signedArea > 0)
    .map((face) => ({ pointsUV: face.pointsUV.map((point) => ({ ...point })), area: face.areaAbs, holesUV: [] }));
}

function extractSimpleCycleLoops(lines) {
  const { vertices, undirectedEdges, adjacency } = buildSplitGraph(lines);
  const visitedVertices = new Set();
  const loops = [];

  const connectedComponents = [];
  for (const key of vertices.keys()) {
    if (visitedVertices.has(key)) continue;
    const queue = [key];
    const component = [];
    visitedVertices.add(key);
    while (queue.length) {
      const current = queue.pop();
      component.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!visitedVertices.has(next)) {
          visitedVertices.add(next);
          queue.push(next);
        }
      }
    }
    connectedComponents.push(component);
  }

  for (const component of connectedComponents) {
    if (!component.length) continue;
    const isDegreeTwo = component.every((key) => (adjacency.get(key)?.size ?? 0) === 2);
    if (!isDegreeTwo) continue;

    const componentSet = new Set(component);
    const componentEdgeCount = [...undirectedEdges].filter((edgeKey) => {
      const [aKey, bKey] = edgeKey.split("|");
      return componentSet.has(aKey) && componentSet.has(bKey);
    }).length;
    if (componentEdgeCount !== component.length) continue;

    const start = component[0];
    const ordered = [start];
    let prev = null;
    let current = start;

    for (let guard = 0; guard < component.length + 2; guard += 1) {
      const neighbors = [...(adjacency.get(current) ?? [])];
      const next = neighbors.find((candidate) => candidate !== prev);
      if (!next) break;
      if (next === start) break;
      ordered.push(next);
      prev = current;
      current = next;
    }

    if (ordered.length >= 3) {
      const pointsUV = ordered.map((key) => vertices.get(key));
      const area = Math.abs(polygonSignedArea(pointsUV));
      if (area > EPS) {
        loops.push({ pointsUV, area, centroid: polygonCentroid(pointsUV) });
      }
    }
  }

  return loops;
}

export function findRegionFromNestedLoops(lines, pointUV) {
  const loops = extractSimpleCycleLoops(lines);
  const containing = loops.filter((loop) => isPointInPolygonUV(pointUV, loop.pointsUV));
  if (!containing.length) return null;
  containing.sort((a, b) => a.area - b.area);
  const outer = containing[0];

  const children = loops.filter((candidate) => {
    if (candidate === outer || candidate.area >= outer.area) return false;
    if (!isPointInPolygonUV(candidate.centroid, outer.pointsUV)) return false;
    return !loops.some((between) => {
      if (between === outer || between === candidate) return false;
      if (between.area >= outer.area || between.area <= candidate.area) return false;
      return isPointInPolygonUV(candidate.centroid, between.pointsUV) && isPointInPolygonUV(between.centroid, outer.pointsUV);
    });
  });

  return {
    pointsUV: outer.pointsUV,
    holesUV: children.map((child) => child.pointsUV),
    area: outer.area,
  };
}

export function findSmallestFaceContainingPoint(faces, pointUV) {
  const containing = faces.filter((face) => isPointInPolygonUV(pointUV, face.pointsUV));
  if (!containing.length) return null;
  containing.sort((a, b) => a.area - b.area);
  return containing[0];
}
