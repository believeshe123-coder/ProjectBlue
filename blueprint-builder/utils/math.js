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
