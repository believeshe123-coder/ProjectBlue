const DEFAULT_GRID_SPACING_WORLD = 32;

export function getGridSpacingWorld(spacing = DEFAULT_GRID_SPACING_WORLD) {
  return spacing;
}

export function snapWorldToGrid(worldPt, spacing = DEFAULT_GRID_SPACING_WORLD) {
  const spacingWorld = getGridSpacingWorld(spacing);
  return {
    x: Math.round(worldPt.x / spacingWorld) * spacingWorld,
    y: Math.round(worldPt.y / spacingWorld) * spacingWorld,
  };
}

function getWorldBounds(camera, viewport) {
  const corners = [
    camera.screenToWorld({ x: 0, y: 0 }),
    camera.screenToWorld({ x: viewport.width, y: 0 }),
    camera.screenToWorld({ x: 0, y: viewport.height }),
    camera.screenToWorld({ x: viewport.width, y: viewport.height }),
  ];

  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function drawGrid(ctx, camera, options = {}) {
  const { width, height } = options;
  const spacingWorld = getGridSpacingWorld(options.spacing);
  const bounds = getWorldBounds(camera, { width, height });

  const startX = Math.floor(bounds.minX / spacingWorld) * spacingWorld;
  const endX = Math.ceil(bounds.maxX / spacingWorld) * spacingWorld;
  const startY = Math.floor(bounds.minY / spacingWorld) * spacingWorld;
  const endY = Math.ceil(bounds.maxY / spacingWorld) * spacingWorld;

  ctx.save();
  ctx.lineWidth = 1;

  for (let x = startX; x <= endX; x += spacingWorld) {
    const sx = camera.worldToScreen({ x, y: 0 }).x;
    const isMajor = Math.round(x / spacingWorld) % 5 === 0;
    ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, height);
    ctx.stroke();
  }

  for (let y = startY; y <= endY; y += spacingWorld) {
    const sy = camera.worldToScreen({ x: 0, y }).y;
    const isMajor = Math.round(y / spacingWorld) % 5 === 0;
    ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.07)";
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(width, sy);
    ctx.stroke();
  }

  ctx.restore();
}
