import { ISO_DIR_A, ISO_DIR_B } from "../utils/snapping.js";

const ISO_DIR_C = { x: 0, y: 1 };

function getWorldCorners(camera, viewport) {
  return [
    camera.screenToWorld({ x: 0, y: 0 }),
    camera.screenToWorld({ x: viewport.width, y: 0 }),
    camera.screenToWorld({ x: 0, y: viewport.height }),
    camera.screenToWorld({ x: viewport.width, y: viewport.height }),
  ];
}

function drawIsoFamily(ctx, camera, corners, spacing, axisDir) {
  const normal = { x: -axisDir.y, y: axisDir.x };
  const values = corners.map((c) => c.x * normal.x + c.y * normal.y);
  const min = Math.min(...values) - spacing * 2;
  const max = Math.max(...values) + spacing * 2;
  const start = Math.floor(min / spacing) * spacing;
  const end = Math.ceil(max / spacing) * spacing;
  const span = 100000;

  for (let c = start; c <= end; c += spacing) {
    const isMajor = Math.round(c / spacing) % 5 === 0;
    ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.06)";

    const base = { x: normal.x * c, y: normal.y * c };
    const p1 = { x: base.x + axisDir.x * span, y: base.y + axisDir.y * span };
    const p2 = { x: base.x - axisDir.x * span, y: base.y - axisDir.y * span };

    const s1 = camera.worldToScreen(p1);
    const s2 = camera.worldToScreen(p2);

    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }
}

export function drawIsoGrid(ctx, camera, viewport, spacing = 32) {
  const corners = getWorldCorners(camera, viewport);

  ctx.save();
  ctx.lineWidth = 1;

  drawIsoFamily(ctx, camera, corners, spacing, ISO_DIR_A);
  drawIsoFamily(ctx, camera, corners, spacing, ISO_DIR_B);
  drawIsoFamily(ctx, camera, corners, spacing, ISO_DIR_C);

  ctx.restore();
}
