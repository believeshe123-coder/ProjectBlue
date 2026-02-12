const GRID_SPACING_WORLD = 32;

export function getGridSpacingWorld() {
  return GRID_SPACING_WORLD;
}

export function snapWorldToGrid(worldPt) {
  const spacingWorld = getGridSpacingWorld();
  return {
    x: Math.round(worldPt.x / spacingWorld) * spacingWorld,
    y: Math.round(worldPt.y / spacingWorld) * spacingWorld,
  };
}

export function drawGrid(ctx, camera, canvasCssW, canvasCssH) {
  const spacingWorld = getGridSpacingWorld();
  const worldTopLeft = camera.screenToWorld({ x: 0, y: 0 });
  const worldBottomRight = camera.screenToWorld({ x: canvasCssW, y: canvasCssH });

  const startX = Math.floor(worldTopLeft.x / spacingWorld) * spacingWorld;
  const endX = Math.ceil(worldBottomRight.x / spacingWorld) * spacingWorld;
  const startY = Math.floor(worldTopLeft.y / spacingWorld) * spacingWorld;
  const endY = Math.ceil(worldBottomRight.y / spacingWorld) * spacingWorld;

  ctx.save();
  ctx.lineWidth = 1;

  for (let x = startX; x <= endX; x += spacingWorld) {
    const isMajor = Math.round(x / spacingWorld) % 5 === 0;
    const p1 = camera.worldToScreen({ x, y: startY });
    const p2 = camera.worldToScreen({ x, y: endY });
    ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  for (let y = startY; y <= endY; y += spacingWorld) {
    const isMajor = Math.round(y / spacingWorld) % 5 === 0;
    const p1 = camera.worldToScreen({ x: startX, y });
    const p2 = camera.worldToScreen({ x: endX, y });
    ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  ctx.restore();
}
