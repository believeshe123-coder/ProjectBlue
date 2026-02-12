const ISO_ANGLE = Math.PI / 6;
const ISO_AXIS_A = { x: Math.cos(ISO_ANGLE), y: Math.sin(ISO_ANGLE) };
const ISO_AXIS_B = { x: Math.cos(Math.PI - ISO_ANGLE), y: Math.sin(Math.PI - ISO_ANGLE) };
const ISO_AXIS_C = { x: 0, y: 1 };
const ISO_SPACING_WORLD = 32;

function getIsoBasis(spacingWorld) {
  return {
    e1: { x: ISO_AXIS_A.x * spacingWorld, y: ISO_AXIS_A.y * spacingWorld },
    e2: { x: ISO_AXIS_B.x * spacingWorld, y: ISO_AXIS_B.y * spacingWorld },
  };
}

export function getIsoSpacingWorld() {
  return ISO_SPACING_WORLD;
}

export function snapWorldToIso(worldPt) {
  const spacingWorld = getIsoSpacingWorld();
  const { e1, e2 } = getIsoBasis(spacingWorld);
  const basisCandidates = [
    [e1, e2],
    [e1, { x: 0, y: spacingWorld }],
    [e2, { x: 0, y: spacingWorld }],
  ];

  let bestPoint = { ...worldPt };
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [a, b] of basisCandidates) {
    const determinant = a.x * b.y - b.x * a.y;
    if (Math.abs(determinant) < Number.EPSILON) {
      continue;
    }

    const u = (worldPt.x * b.y - b.x * worldPt.y) / determinant;
    const v = (a.x * worldPt.y - worldPt.x * a.y) / determinant;
    const snapped = {
      x: Math.round(u) * a.x + Math.round(v) * b.x,
      y: Math.round(u) * a.y + Math.round(v) * b.y,
    };
    const distance = Math.hypot(worldPt.x - snapped.x, worldPt.y - snapped.y);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestPoint = snapped;
    }
  }

  return bestPoint;
}

function getVisibleWorldCorners(camera, canvasCssW, canvasCssH) {
  return [
    camera.screenToWorld({ x: 0, y: 0 }),
    camera.screenToWorld({ x: canvasCssW, y: 0 }),
    camera.screenToWorld({ x: 0, y: canvasCssH }),
    camera.screenToWorld({ x: canvasCssW, y: canvasCssH }),
  ];
}

function drawIsoFamily(ctx, camera, corners, spacingWorld, axisDir) {
  const normal = { x: -axisDir.y, y: axisDir.x };
  const values = corners.map((corner) => corner.x * normal.x + corner.y * normal.y);
  const min = Math.min(...values) - spacingWorld * 2;
  const max = Math.max(...values) + spacingWorld * 2;
  const start = Math.floor(min / spacingWorld) * spacingWorld;
  const end = Math.ceil(max / spacingWorld) * spacingWorld;
  const span = 100000;

  for (let c = start; c <= end; c += spacingWorld) {
    const isMajor = Math.round(c / spacingWorld) % 5 === 0;
    const base = { x: normal.x * c, y: normal.y * c };
    const p1 = { x: base.x + axisDir.x * span, y: base.y + axisDir.y * span };
    const p2 = { x: base.x - axisDir.x * span, y: base.y - axisDir.y * span };
    const s1 = camera.worldToScreen(p1);
    const s2 = camera.worldToScreen(p2);

    ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.06)";
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }
}

export function drawIsoGrid(ctx, camera, canvasCssW, canvasCssH) {
  const spacingWorld = getIsoSpacingWorld();
  const corners = getVisibleWorldCorners(camera, canvasCssW, canvasCssH);

  ctx.save();
  ctx.lineWidth = 1;

  drawIsoFamily(ctx, camera, corners, spacingWorld, ISO_AXIS_A);
  drawIsoFamily(ctx, camera, corners, spacingWorld, ISO_AXIS_B);
  drawIsoFamily(ctx, camera, corners, spacingWorld, ISO_AXIS_C);

  ctx.restore();
}
