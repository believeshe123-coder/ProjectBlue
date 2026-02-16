export function traceContoursFromMask(mask, width, height) {
  const getMask = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : mask[y * width + x]);

  const adjacency = new Map();
  const addEdge = (ax, ay, bx, by) => {
    const a = `${ax},${ay}`;
    const b = `${bx},${by}`;
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!getMask(x, y)) continue;
      if (!getMask(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!getMask(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!getMask(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!getMask(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }

  const visited = new Set();
  const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const parsePoint = (key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  };

  const contours = [];
  for (const [start, neighbors] of adjacency.entries()) {
    for (const next of neighbors) {
      const startEdge = edgeKey(start, next);
      if (visited.has(startEdge)) continue;

      const contour = [];
      let previous = start;
      let current = next;
      contour.push(parsePoint(start));

      visited.add(startEdge);

      while (current !== start) {
        contour.push(parsePoint(current));
        const options = [...(adjacency.get(current) ?? [])].filter((node) => node !== previous);
        if (!options.length) break;

        let nextNode = options[0];
        if (options.length > 1) {
          const prevPoint = parsePoint(previous);
          const currentPoint = parsePoint(current);
          const incoming = { x: currentPoint.x - prevPoint.x, y: currentPoint.y - prevPoint.y };

          let bestScore = Infinity;
          for (const option of options) {
            const optionPoint = parsePoint(option);
            const outgoing = { x: optionPoint.x - currentPoint.x, y: optionPoint.y - currentPoint.y };
            const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
            const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;
            const angle = Math.atan2(cross, dot);
            const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
            if (normalized < bestScore) {
              bestScore = normalized;
              nextNode = option;
            }
          }
        }

        const currentEdge = edgeKey(current, nextNode);
        visited.add(currentEdge);
        previous = current;
        current = nextNode;
      }

      if (contour.length >= 3) {
        contours.push(contour);
      }
    }
  }

  return contours;
}
