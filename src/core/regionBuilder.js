import { worldToIsoUV } from "./isoGrid.js";

const EPS = 1e-9;

function canonicalUv(uv = { u: 0, v: 0 }) {
  return {
    u: Math.round((uv.u ?? 0) * 2) / 2,
    v: Math.round((uv.v ?? 0) * 2) / 2,
  };
}

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

function rotateToSmallestVertex(pointsUV) {
  let smallestIndex = 0;
  for (let i = 1; i < pointsUV.length; i += 1) {
    const current = pointsUV[i];
    const best = pointsUV[smallestIndex];
    if (current.u < best.u || (current.u === best.u && current.v < best.v)) {
      smallestIndex = i;
    }
  }
  return [...pointsUV.slice(smallestIndex), ...pointsUV.slice(0, smallestIndex)];
}

function normalizeCycleForId(pointsUV) {
  const forward = rotateToSmallestVertex(pointsUV);
  const reverse = rotateToSmallestVertex([...pointsUV].reverse());
  const forwardKey = forward.map((point) => vertexKey(point)).join("|");
  const reverseKey = reverse.map((point) => vertexKey(point)).join("|");
  return reverseKey < forwardKey ? reverse : forward;
}

function hashCycle(pointsUV) {
  const canonical = normalizeCycleForId(pointsUV);
  return `region:${canonical.map((point) => vertexKey(point)).join(";")}`;
}

function toUvPoint(linePoint, maybeUV) {
  return canonicalUv(maybeUV ?? worldToIsoUV(linePoint));
}

function buildSplitGraph(lines) {
  const vertices = new Map();
  const segments = [];

  for (const line of lines) {
    const start = toUvPoint(line.start, line.startUV);
    const end = toUvPoint(line.end, line.endUV);
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

  return { vertices, undirectedEdges };
}

export function isPointInPolygonUV(point, polygon) {
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

export function buildRegionsFromLines(lines) {
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

    const cycleUV = loop.map((edgeKey) => {
      const edge = halfEdges.get(edgeKey);
      return vertices.get(edge.fromKey) ?? parseVertexKey(edge.fromKey);
    });

    const signedArea = polygonSignedArea(cycleUV);
    if (Math.abs(signedArea) < EPS) continue;

    tracedFaces.push({ cycleUV, signedArea, areaAbs: Math.abs(signedArea) });
  }

  if (!tracedFaces.length) return [];
  const outsideFace = tracedFaces.reduce((largest, face) => (face.areaAbs > largest.areaAbs ? face : largest), tracedFaces[0]);

  return tracedFaces
    .filter((face) => face !== outsideFace)
    .filter((face) => face.signedArea > 0)
    .map((face) => ({
      id: hashCycle(face.cycleUV),
      uvCycle: face.cycleUV.map((point) => ({ ...point })),
      area: face.areaAbs,
    }));
}

export function findSmallestRegionContainingPoint(regions, pointUV) {
  const containing = regions.filter((region) => isPointInPolygonUV(pointUV, region.uvCycle));
  if (!containing.length) return null;
  containing.sort((a, b) => a.area - b.area);
  return containing[0];
}
