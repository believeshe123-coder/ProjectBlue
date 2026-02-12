export const SNAP_PIXELS = 14;

export function worldSnapDistance(camera) {
  return SNAP_PIXELS / camera.zoom;
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
