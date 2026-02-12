const SNAP_PIXELS = 14;
const ISO_ANGLE = Math.PI / 6;
const ISO_DIR_A = { x: Math.cos(ISO_ANGLE), y: Math.sin(ISO_ANGLE) };
const ISO_DIR_B = { x: Math.cos(Math.PI - ISO_ANGLE), y: Math.sin(Math.PI - ISO_ANGLE) };

export function worldSnapDistance(camera) {
  return SNAP_PIXELS / camera.zoom;
}

export function snapToGrid2D(point, spacing) {
  return {
    x: Math.round(point.x / spacing) * spacing,
    y: Math.round(point.y / spacing) * spacing,
  };
}

export function snapToIsoLattice(point, spacing) {
  const e1 = { x: ISO_DIR_A.x * spacing, y: ISO_DIR_A.y * spacing };
  const e2 = { x: ISO_DIR_B.x * spacing, y: ISO_DIR_B.y * spacing };
  const determinant = e1.x * e2.y - e2.x * e1.y;

  if (Math.abs(determinant) < Number.EPSILON) {
    return { ...point };
  }

  const u = (point.x * e2.y - e2.x * point.y) / determinant;
  const v = (e1.x * point.y - point.x * e1.y) / determinant;
  const uRounded = Math.round(u);
  const vRounded = Math.round(v);

  return {
    x: uRounded * e1.x + vRounded * e2.x,
    y: uRounded * e1.y + vRounded * e2.y,
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

export function snapWorldPoint(
  rawWorldPt,
  { camera, mode, gridSize, isoSpacing, shapes, snapGridEnabled, snapMidEnabled }
) {
  const threshold = worldSnapDistance(camera);
  const candidates = [];

  if (snapGridEnabled) {
    const gridPoint =
      mode === "ISO" ? snapToIsoLattice(rawWorldPt, isoSpacing) : snapToGrid2D(rawWorldPt, gridSize);
    candidates.push({ point: gridPoint, kind: "grid" });
  }

  if (snapMidEnabled) {
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
    const dist = Math.hypot(rawWorldPt.x - candidate.point.x, rawWorldPt.y - candidate.point.y);

    if (dist <= threshold && dist < bestDistance) {
      bestDistance = dist;
      winner = candidate;
    }
  }

  if (!winner) {
    return { pt: rawWorldPt, snapped: false, kind: null };
  }

  return {
    pt: winner.point,
    snapped: true,
    kind: winner.kind,
  };
}

export { ISO_DIR_A, ISO_DIR_B, SNAP_PIXELS };
