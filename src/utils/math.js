export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

export function nearlyEqual(a, b, epsilon = 1e-6) {
  return Math.abs(a - b) <= epsilon;
}

export function projectPointToAxis(from, to, axis) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lenSq = axis.x * axis.x + axis.y * axis.y;
  const dot = dx * axis.x + dy * axis.y;
  const t = lenSq === 0 ? 0 : dot / lenSq;

  return {
    x: from.x + axis.x * t,
    y: from.y + axis.y * t,
  };
}

export function distancePointToSegment(point, start, end) {
  const segX = end.x - start.x;
  const segY = end.y - start.y;
  const lenSq = segX * segX + segY * segY;

  if (lenSq <= Number.EPSILON) {
    return distance(point, start);
  }

  const t = clamp(((point.x - start.x) * segX + (point.y - start.y) * segY) / lenSq, 0, 1);
  const proj = {
    x: start.x + t * segX,
    y: start.y + t * segY,
  };

  return distance(point, proj);
}

export function isPointInPolygon(point, polygonPoints) {
  if (!polygonPoints || polygonPoints.length < 3) {
    return false;
  }

  const epsilon = 1e-6;

  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i, i += 1) {
    const a = polygonPoints[j];
    const b = polygonPoints[i];
    const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
    if (Math.abs(cross) > epsilon) continue;
    const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
    if (dot < -epsilon) continue;
    const lenSq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (dot - lenSq > epsilon) continue;
    return true;
  }

  let inside = false;

  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i, i += 1) {
    const xi = polygonPoints[i].x;
    const yi = polygonPoints[i].y;
    const xj = polygonPoints[j].x;
    const yj = polygonPoints[j].y;

    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}
