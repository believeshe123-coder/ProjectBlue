import { projectPointToAxis } from "./math.js";

const ISO_AXES = [
  { x: 1, y: 0 },
  { x: 0.5, y: Math.sin(Math.PI / 3) },
  { x: 0.5, y: -Math.sin(Math.PI / 3) },
];

export function snapToGrid(point, spacing) {
  return {
    x: Math.round(point.x / spacing) * spacing,
    y: Math.round(point.y / spacing) * spacing,
  };
}

export function snapToIsoAxes(start, candidate, spacing) {
  let best = null;
  let bestDist = Infinity;

  for (const axis of ISO_AXES) {
    const projected = projectPointToAxis(start, candidate, axis);
    const snapped = {
      x: Math.round(projected.x / spacing) * spacing,
      y: Math.round(projected.y / spacing) * spacing,
    };
    const dist = Math.hypot(candidate.x - snapped.x, candidate.y - snapped.y);

    if (dist < bestDist) {
      bestDist = dist;
      best = snapped;
    }
  }

  return best;
}

export function snapToEndpoint(point, _shapes, threshold = 8) {
  return { point, matched: false, threshold };
}
