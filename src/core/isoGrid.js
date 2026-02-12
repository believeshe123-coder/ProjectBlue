const ISO_ANGLE = Math.PI / 6; // 30 degrees
const dirA = { x: Math.cos(ISO_ANGLE), y: Math.sin(ISO_ANGLE) }; // +30°
const dirB = { x: Math.cos(Math.PI - ISO_ANGLE), y: Math.sin(Math.PI - ISO_ANGLE) }; // 150°
const isoSpacingWorld = 60;

const e1 = { x: dirA.x * isoSpacingWorld, y: dirA.y * isoSpacingWorld };
const e2 = { x: dirB.x * isoSpacingWorld, y: dirB.y * isoSpacingWorld };

function getVisibleWorldCorners(camera, canvasCssW, canvasCssH) {
  return [
    camera.screenToWorld({ x: 0, y: 0 }),
    camera.screenToWorld({ x: canvasCssW, y: 0 }),
    camera.screenToWorld({ x: 0, y: canvasCssH }),
    camera.screenToWorld({ x: canvasCssW, y: canvasCssH }),
  ];
}

export function getIsoSpacingWorld() {
  return isoSpacingWorld;
}

export function getIsoBasis() {
  return {
    e1: { ...e1 },
    e2: { ...e2 },
  };
}

export function worldToIsoUV(worldPt) {
  const a = e1.x;
  const b = e1.y;
  const c = e2.x;
  const d = e2.y;
  const det = a * d - b * c;

  if (Math.abs(det) < Number.EPSILON) {
    return { u: 0, v: 0 };
  }

  return {
    u: (worldPt.x * d - worldPt.y * c) / det,
    v: (worldPt.y * a - worldPt.x * b) / det,
  };
}

export function isoUVToWorld(u, v) {
  return {
    x: u * e1.x + v * e2.x,
    y: u * e1.y + v * e2.y,
  };
}

export function snapWorldToIso(worldPt) {
  const { u, v } = worldToIsoUV(worldPt);
  const uRounded = Math.round(u);
  const vRounded = Math.round(v);

  return {
    point: isoUVToWorld(uRounded, vRounded),
    u: uRounded,
    v: vRounded,
  };
}

export function drawIsoGrid(ctx, camera, canvasCssW, canvasCssH) {
  const corners = getVisibleWorldCorners(camera, canvasCssW, canvasCssH);
  const uvCorners = corners.map(worldToIsoUV);

  const uValues = uvCorners.map((value) => value.u);
  const vValues = uvCorners.map((value) => value.v);

  const pad = 3;
  const uMin = Math.floor(Math.min(...uValues)) - pad;
  const uMax = Math.ceil(Math.max(...uValues)) + pad;
  const vMin = Math.floor(Math.min(...vValues)) - pad;
  const vMax = Math.ceil(Math.max(...vValues)) + pad;

  ctx.save();
  ctx.lineWidth = 1;

  for (let u = uMin; u <= uMax; u += 1) {
    const p0 = isoUVToWorld(u, vMin);
    const p1 = isoUVToWorld(u, vMax);
    const s0 = camera.worldToScreen(p0);
    const s1 = camera.worldToScreen(p1);
    const isMajor = u % 5 === 0;

    ctx.strokeStyle = isMajor ? "rgba(208, 241, 255, 0.17)" : "rgba(208, 241, 255, 0.09)";
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.stroke();
  }

  for (let v = vMin; v <= vMax; v += 1) {
    const p0 = isoUVToWorld(uMin, v);
    const p1 = isoUVToWorld(uMax, v);
    const s0 = camera.worldToScreen(p0);
    const s1 = camera.worldToScreen(p1);
    const isMajor = v % 5 === 0;

    ctx.strokeStyle = isMajor ? "rgba(208, 241, 255, 0.17)" : "rgba(208, 241, 255, 0.09)";
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.stroke();
  }

  ctx.restore();
}
