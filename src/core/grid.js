export function draw2DGrid(ctx, camera, viewport, spacing = 32) {
  const topLeft = camera.screenToWorld({ x: 0, y: 0 });
  const bottomRight = camera.screenToWorld({ x: viewport.width, y: viewport.height });

  const startX = Math.floor(topLeft.x / spacing) * spacing;
  const endX = Math.ceil(bottomRight.x / spacing) * spacing;
  const startY = Math.floor(topLeft.y / spacing) * spacing;
  const endY = Math.ceil(bottomRight.y / spacing) * spacing;

  ctx.save();
  ctx.lineWidth = 1;

  for (let x = startX; x <= endX; x += spacing) {
    const sx = camera.worldToScreen({ x, y: 0 }).x;
    const isMajor = Math.round(x / spacing) % 5 === 0;
    ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, viewport.height);
    ctx.stroke();
  }

  for (let y = startY; y <= endY; y += spacing) {
    const sy = camera.worldToScreen({ x: 0, y }).y;
    const isMajor = Math.round(y / spacing) % 5 === 0;
    ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(viewport.width, sy);
    ctx.stroke();
  }

  ctx.restore();
}
