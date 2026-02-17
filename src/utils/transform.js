export const IDENTITY_TRANSFORM = { x: 0, y: 0, rot: 0 };

function normalize(t) {
  return {
    x: Number.isFinite(t?.x) ? t.x : 0,
    y: Number.isFinite(t?.y) ? t.y : 0,
    rot: Number.isFinite(t?.rot) ? t.rot : 0,
  };
}

export function applyTransformPoint(transform, point) {
  const t = normalize(transform);
  const p = point ?? { x: 0, y: 0 };
  const c = Math.cos(t.rot);
  const s = Math.sin(t.rot);
  return {
    x: (p.x * c) - (p.y * s) + t.x,
    y: (p.x * s) + (p.y * c) + t.y,
  };
}

export function composeTransform(parent, child) {
  const a = normalize(parent);
  const b = normalize(child);
  const translated = applyTransformPoint(a, { x: b.x, y: b.y });
  return {
    x: translated.x,
    y: translated.y,
    rot: a.rot + b.rot,
  };
}

export function invertTransform(transform) {
  const t = normalize(transform);
  const c = Math.cos(-t.rot);
  const s = Math.sin(-t.rot);
  const tx = -t.x;
  const ty = -t.y;
  return {
    x: (tx * c) - (ty * s),
    y: (tx * s) + (ty * c),
    rot: -t.rot,
  };
}

export function pointToLocal(worldPoint, worldFromLocal) {
  return applyTransformPoint(invertTransform(worldFromLocal), worldPoint);
}
