const ISO_ANGLE = Math.PI / 6; // 30 degrees
const dirA = { x: Math.cos(ISO_ANGLE), y: Math.sin(ISO_ANGLE) }; // +30°
const dirB = { x: Math.cos(Math.PI - ISO_ANGLE), y: Math.sin(Math.PI - ISO_ANGLE) }; // 150°
const isoSpacingWorld = 60;

const e1 = { x: dirA.x * isoSpacingWorld, y: dirA.y * isoSpacingWorld };
const e2 = { x: dirB.x * isoSpacingWorld, y: dirB.y * isoSpacingWorld };

function hexToRgba(hex, alpha) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return null;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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


export function snapIsoUV(uvPt, step = 1) {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  return {
    u: Math.round((uvPt.u ?? 0) / safeStep) * safeStep,
    v: Math.round((uvPt.v ?? 0) / safeStep) * safeStep,
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

export function snapWorldToIsoAxis(worldPt) {
  const uv = worldToIsoUV(worldPt);
  const projectToLine = (axisPoint, axisDirection) => {
    const delta = {
      x: worldPt.x - axisPoint.x,
      y: worldPt.y - axisPoint.y,
    };
    const directionLengthSq = axisDirection.x * axisDirection.x + axisDirection.y * axisDirection.y;
    const t = directionLengthSq > Number.EPSILON
      ? (delta.x * axisDirection.x + delta.y * axisDirection.y) / directionLengthSq
      : 0;
    return {
      x: axisPoint.x + axisDirection.x * t,
      y: axisPoint.y + axisDirection.y * t,
    };
  };

  const uAxis = Math.round(uv.u);
  const vAxis = Math.round(uv.v);
  const dAxis = Math.round(uv.u - uv.v);

  const candidates = [
    {
      axis: "u",
      point: projectToLine(isoUVToWorld(uAxis, 0), e2),
    },
    {
      axis: "v",
      point: projectToLine(isoUVToWorld(0, vAxis), e1),
    },
    {
      axis: "d",
      point: projectToLine(isoUVToWorld(dAxis, 0), { x: e1.x + e2.x, y: e1.y + e2.y }),
    },
  ].map((candidate) => ({
    ...candidate,
    distance: Math.hypot(worldPt.x - candidate.point.x, worldPt.y - candidate.point.y),
  }));

  candidates.sort((a, b) => a.distance - b.distance);
  const winner = candidates[0];
  const projectedUv = worldToIsoUV(winner.point);

  return {
    point: winner.point,
    axis: winner.axis,
    u: projectedUv.u,
    v: projectedUv.v,
    d: projectedUv.u - projectedUv.v,
  };
}

export function drawIsoGrid(ctx, camera, canvasCssW, canvasCssH, options = {}) {
  const corners = getVisibleWorldCorners(camera, canvasCssW, canvasCssH);
  const uvCorners = corners.map(worldToIsoUV);

  const uValues = uvCorners.map((value) => value.u);
  const vValues = uvCorners.map((value) => value.v);
  const dValues = uvCorners.map((value) => value.u - value.v);

  const pad = 3;
  const uMin = Math.floor(Math.min(...uValues)) - pad;
  const uMax = Math.ceil(Math.max(...uValues)) + pad;
  const vMin = Math.floor(Math.min(...vValues)) - pad;
  const vMax = Math.ceil(Math.max(...vValues)) + pad;
  const dMin = Math.floor(Math.min(...dValues)) - pad;
  const dMax = Math.ceil(Math.max(...dValues)) + pad;

  ctx.save();
  ctx.lineWidth = 1;
  const major = hexToRgba(options.gridColor, 0.24) || "rgba(208, 241, 255, 0.13)";
  const minor = hexToRgba(options.gridColor, 0.1) || "rgba(208, 241, 255, 0.05)";
  const gridColors = { major, minor };

  for (let u = uMin; u <= uMax; u += 1) {
    const p0 = isoUVToWorld(u, vMin);
    const p1 = isoUVToWorld(u, vMax);
    const s0 = camera.worldToScreen(p0);
    const s1 = camera.worldToScreen(p1);
    const isMajor = u % 5 === 0;

    ctx.strokeStyle = isMajor ? gridColors.major : gridColors.minor;
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

    ctx.strokeStyle = isMajor ? gridColors.major : gridColors.minor;
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.stroke();
  }

  for (let d = dMin; d <= dMax; d += 1) {
    const p0 = isoUVToWorld(d + vMin, vMin);
    const p1 = isoUVToWorld(d + vMax, vMax);
    const s0 = camera.worldToScreen(p0);
    const s1 = camera.worldToScreen(p1);
    const isMajor = d % 5 === 0;

    ctx.strokeStyle = isMajor ? gridColors.major : gridColors.minor;
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.stroke();
  }

  ctx.restore();
}
