const SQRT3_OVER_2 = Math.sqrt(3) / 2;

function drawIsoFamily(ctx, camera, viewport, spacing, vector) {
  const corners = [
    camera.screenToWorld({ x: 0, y: 0 }),
    camera.screenToWorld({ x: viewport.width, y: 0 }),
    camera.screenToWorld({ x: 0, y: viewport.height }),
    camera.screenToWorld({ x: viewport.width, y: viewport.height }),
  ];

  const values = corners.map((c) => c.x * vector.y - c.y * vector.x);
  const min = Math.min(...values) - spacing * 2;
  const max = Math.max(...values) + spacing * 2;
  const start = Math.floor(min / spacing) * spacing;
  const end = Math.ceil(max / spacing) * spacing;

  ctx.save();
  ctx.lineWidth = 1;

  for (let c = start; c <= end; c += spacing) {
    const isMajor = Math.round(c / spacing) % 5 === 0;
    ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.06)";

    const p1 = { x: -100000, y: (vector.y * -100000 - c) / vector.x };
    const p2 = { x: 100000, y: (vector.y * 100000 - c) / vector.x };

    const s1 = camera.worldToScreen(p1);
    const s2 = camera.worldToScreen(p2);

    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawIsoGrid(ctx, camera, viewport, spacing = 32) {
  drawIsoFamily(ctx, camera, viewport, spacing, { x: 1, y: 0 });
  drawIsoFamily(ctx, camera, viewport, spacing, { x: 0.5, y: SQRT3_OVER_2 });
  drawIsoFamily(ctx, camera, viewport, spacing, { x: 0.5, y: -SQRT3_OVER_2 });
}
