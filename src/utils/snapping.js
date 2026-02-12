const SQRT3_OVER_2 = Math.sqrt(3) / 2;

export function worldSnapDistance(camera, snapPixels = 12) {
  return snapPixels / camera.zoom;
}

export function snapToGrid2D(point, spacing) {
  return {
    x: Math.round(point.x / spacing) * spacing,
    y: Math.round(point.y / spacing) * spacing,
  };
}

export function snapToIsoGrid(point, spacing) {
  const j = point.y / (spacing * SQRT3_OVER_2);
  const i = point.x / spacing - j / 2;

  const snappedI = Math.round(i);
  const snappedJ = Math.round(j);

  return {
    x: spacing * (snappedI + snappedJ / 2),
    y: spacing * SQRT3_OVER_2 * snappedJ,
  };
}

export function getLineSnapPoints(shapes) {
  const points = [];

  for (const shape of shapes) {
    if (shape.type !== "line") {
      continue;
    }

    points.push({ x: shape.start.x, y: shape.start.y, type: "endpoint", id: shape.id });
    points.push({ x: shape.end.x, y: shape.end.y, type: "endpoint", id: shape.id });
    points.push({
      x: (shape.start.x + shape.end.x) / 2,
      y: (shape.start.y + shape.end.y) / 2,
      type: "midpoint",
      id: shape.id,
    });
  }

  return points;
}

export function snapPoint(
  worldPt,
  { camera, mode, gridSize, isoSpacing, shapes, enableGridSnap, enableMidSnap, snapPixels = 12 }
) {
  const threshold = worldSnapDistance(camera, snapPixels);
  const candidates = [];

  if (enableGridSnap) {
    const gridPoint =
      mode === "ISO" ? snapToIsoGrid(worldPt, isoSpacing) : snapToGrid2D(worldPt, gridSize);
    candidates.push({ point: gridPoint, kind: "grid" });
  }

  if (enableMidSnap) {
    for (const snapCandidate of getLineSnapPoints(shapes)) {
      candidates.push({
        point: { x: snapCandidate.x, y: snapCandidate.y },
        kind: snapCandidate.type,
      });
    }
  }

  let winner = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const dist = Math.hypot(worldPt.x - candidate.point.x, worldPt.y - candidate.point.y);

    if (dist <= threshold && dist < bestDistance) {
      bestDistance = dist;
      winner = candidate;
    }
  }

  if (!winner) {
    return { point: worldPt, snapped: false, kind: null };
  }

  return {
    point: winner.point,
    snapped: true,
    kind: winner.kind,
  };
}
