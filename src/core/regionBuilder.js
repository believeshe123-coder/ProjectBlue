import { worldToIsoUV } from "./isoGrid.js";

const EPS = 1e-9;

function canonicalUv(uv = { u: 0, v: 0 }) {
  const canonicalizeScalar = (value) => {
    const next = Number.isFinite(value) ? value : 0;
    const nearestInt = Math.round(next);
    if (Math.abs(next - nearestInt) <= EPS) return nearestInt;

    const nearestHalf = Math.round(next * 2) / 2;
    if (Math.abs(next - nearestHalf) <= EPS) return nearestHalf;

    return Math.round(next * 10000) / 10000;
  };

  return {
    u: canonicalizeScalar(uv.u),
    v: canonicalizeScalar(uv.v),
  };
}

function vertexKey(point) {
  return `${point.u},${point.v}`;
}

function parseVertexKey(key) {
  const [u, v] = key.split(",").map(Number);
  return { u, v };
}

function crossUv(a, b, c) {
  return (b.u - a.u) * (c.v - a.v) - (b.v - a.v) * (c.u - a.u);
}

function segmentLengthSquared(a, b) {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  return du * du + dv * dv;
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

function normalizeIntersectionNumber(value) {
  if (!Number.isFinite(value)) return value;
  const roundedInt = Math.round(value);
  if (Math.abs(value - roundedInt) < EPS) return roundedInt;
  const roundedHalf = Math.round(value * 2) / 2;
  if (Math.abs(value - roundedHalf) < EPS) return roundedHalf;
  return value;
}

function isSamePointUv(a, b) {
  return Math.abs(a.u - b.u) <= EPS && Math.abs(a.v - b.v) <= EPS;
}

function pointOnSegmentUv(point, start, end) {
  if (Math.abs(crossUv(start, end, point)) > EPS) return false;
  const minU = Math.min(start.u, end.u) - EPS;
  const maxU = Math.max(start.u, end.u) + EPS;
  const minV = Math.min(start.v, end.v) - EPS;
  const maxV = Math.max(start.v, end.v) + EPS;
  return point.u >= minU && point.u <= maxU && point.v >= minV && point.v <= maxV;
}

function segmentIntersectionUv(a, b, c, d) {
  const r = { u: b.u - a.u, v: b.v - a.v };
  const s = { u: d.u - c.u, v: d.v - c.v };
  const denom = r.u * s.v - r.v * s.u;
  const ca = { u: c.u - a.u, v: c.v - a.v };

  if (Math.abs(denom) <= EPS) {
    if (Math.abs(ca.u * r.v - ca.v * r.u) > EPS) return [];
    const points = [a, b, c, d].filter((pt) => pointOnSegmentUv(pt, a, b) && pointOnSegmentUv(pt, c, d));
    const unique = new Map();
    for (const point of points) {
      const normalized = {
        u: normalizeIntersectionNumber(point.u),
        v: normalizeIntersectionNumber(point.v),
      };
      unique.set(vertexKey(normalized), normalized);
    }
    return [...unique.values()];
  }

  const t = (ca.u * s.v - ca.v * s.u) / denom;
  const u = (ca.u * r.v - ca.v * r.u) / denom;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return [];

  return [{
    u: normalizeIntersectionNumber(a.u + t * r.u),
    v: normalizeIntersectionNumber(a.v + t * r.v),
  }];
}

function edgeCanonicalKey(aKey, bKey) {
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function cycleKey(pointsUV) {
  const canonical = normalizeCycleForId(pointsUV);
  return canonical.map((point) => vertexKey(point)).join(";");
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
    segments.push({ start, end, startKey, endKey });
  }

  const pointsBySegment = segments.map((segment) => {
    const pointMap = new Map();
    pointMap.set(segment.startKey, segment.start);
    pointMap.set(segment.endKey, segment.end);
    return pointMap;
  });

  for (let i = 0; i < segments.length; i += 1) {
    const first = segments[i];
    for (let j = i + 1; j < segments.length; j += 1) {
      const second = segments[j];
      const intersections = segmentIntersectionUv(first.start, first.end, second.start, second.end);
      for (const point of intersections) {
        const canonical = canonicalUv(point);
        const key = vertexKey(canonical);
        vertices.set(key, canonical);
        pointsBySegment[i].set(key, canonical);
        pointsBySegment[j].set(key, canonical);
      }
    }
  }

  const allVertices = [...vertices.values()];
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    const segmentPoints = pointsBySegment[segmentIndex];
    for (const point of allVertices) {
      if (!pointOnSegmentUv(point, segment.start, segment.end)) continue;
      const key = vertexKey(point);
      segmentPoints.set(key, point);
    }
  }

  const undirectedEdges = new Set();
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex];
    const splitPoints = [...pointsBySegment[segmentIndex].values()]
      .sort((a, b) => segmentLengthSquared(segment.start, a) - segmentLengthSquared(segment.start, b));

    for (let i = 0; i < splitPoints.length - 1; i += 1) {
      const from = splitPoints[i];
      const to = splitPoints[i + 1];
      if (isSamePointUv(from, to)) continue;
      const aKey = vertexKey(from);
      const bKey = vertexKey(to);
      undirectedEdges.add(edgeCanonicalKey(aKey, bKey));
    }
  }

  return { vertices, undirectedEdges };
}

export function isPointInPolygonUV(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];

    if (pointOnSegmentUv(point, pj, pi)) return true;

    const intersects =
      pi.v > point.v !== pj.v > point.v
      && point.u < ((pj.u - pi.u) * (point.v - pi.v)) / ((pj.v - pi.v) || EPS) + pi.u;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isPointStrictlyInPolygonUV(point, polygon) {
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    if (pointOnSegmentUv(point, polygon[j], polygon[i])) return false;
  }

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

function regionFullyContainsRegion(containerRegion, nestedRegion) {
  if (containerRegion.id === nestedRegion.id) return false;
  return nestedRegion.uvCycle.every((point) => isPointInPolygonUV(point, containerRegion.uvCycle));
}

export function buildRegionsFromLines(lines) {
  const { vertices, undirectedEdges } = buildSplitGraph(lines);
  if (!undirectedEdges.size) return { boundedFaces: [], debug: { totalEdges: 0, totalVertices: vertices.size, totalRegions: 0, outerArea: 0 } };

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

  for (const startKey of halfEdges.keys()) {
    if (visited.has(startKey)) continue;

    const loop = [];
    let currentKey = startKey;

    while (true) {
      if (visited.has(currentKey)) break;
      visited.add(currentKey);
      loop.push(currentKey);

      const current = halfEdges.get(currentKey);
      const incomingDirectionKey = `${current.toKey}>${current.fromKey}`;
      const nextCandidates = outgoing.get(current.toKey);
      if (!nextCandidates?.length) break;

      const incomingIndex = nextCandidates.indexOf(incomingDirectionKey);
      if (incomingIndex === -1) break;

      const nextIndex = (incomingIndex + 1) % nextCandidates.length;
      const nextKey = nextCandidates[nextIndex];
      if (nextKey === startKey) {
        loop.push(nextKey);
        break;
      }
      currentKey = nextKey;
    }

    if (loop.length < 4 || loop[loop.length - 1] !== startKey) continue;

    const cycleUV = loop.slice(0, -1).map((edgeKey) => {
      const edge = halfEdges.get(edgeKey);
      return vertices.get(edge.fromKey) ?? parseVertexKey(edge.fromKey);
    });

    const signedArea = polygonSignedArea(cycleUV);
    if (Math.abs(signedArea) <= EPS) continue;

    tracedFaces.push({ cycleUV, signedArea, areaAbs: Math.abs(signedArea) });
  }

  if (!tracedFaces.length) {
    return {
      boundedFaces: [],
      debug: {
        totalEdges: undirectedEdges.size,
        totalVertices: vertices.size,
        totalRegions: 0,
        outerArea: 0,
      },
    };
  }

  const seenCycles = new Set();
  const dedupedFaces = [];
  for (const face of tracedFaces) {
    const key = cycleKey(face.cycleUV);
    if (seenCycles.has(key)) continue;
    seenCycles.add(key);
    dedupedFaces.push(face);
  }

  const outsideFace = dedupedFaces.length > 1
    ? dedupedFaces.reduce((largest, face) => (face.areaAbs > largest.areaAbs ? face : largest), dedupedFaces[0])
    : null;

  const boundedFaces = dedupedFaces
    .filter((face) => face !== outsideFace)
    .map((face) => ({
      id: hashCycle(face.cycleUV),
      uvCycle: face.cycleUV.map((point) => ({ ...point })),
      area: face.areaAbs,
      signedArea: face.signedArea,
    }));

  return {
    boundedFaces,
    debug: {
      totalEdges: undirectedEdges.size,
      totalVertices: vertices.size,
      totalRegions: boundedFaces.length,
      outerArea: outsideFace?.signedArea ?? 0,
    },
  };
}

export function findSmallestRegionContainingPoint(regions, pointUV) {
  const boundedRegions = regions.filter((region) => Array.isArray(region?.uvCycle) && region.uvCycle.length >= 3);
  let candidateRegions = boundedRegions.filter((region) => isPointStrictlyInPolygonUV(pointUV, region.uvCycle));
  if (!candidateRegions.length) {
    candidateRegions = boundedRegions.filter((region) => isPointInPolygonUV(pointUV, region.uvCycle));
  }
  console.debug("[FillTool] candidate region ids:", candidateRegions.map((region) => region.id));

  if (!candidateRegions.length) {
    console.debug("[FillTool] eliminated parent regions:", []);
    console.debug("[FillTool] final selected region id:", null);
    return null;
  }

  const eliminatedParentRegions = [];
  const filteredRegions = candidateRegions.filter((candidate) => {
    const isParent = candidateRegions.some((other) => regionFullyContainsRegion(candidate, other));
    if (isParent) eliminatedParentRegions.push(candidate.id);
    return !isParent;
  });

  console.debug("[FillTool] eliminated parent regions:", eliminatedParentRegions);

  const pool = filteredRegions.length ? filteredRegions : candidateRegions;
  pool.sort((a, b) => Math.abs(a.area) - Math.abs(b.area));
  const selected = pool[0] ?? null;
  console.debug("[FillTool] final selected region id:", selected?.id ?? null);
  return selected;
}
