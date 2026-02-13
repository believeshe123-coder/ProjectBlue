export function computeIsoGridSteps(a, b) {
  const u1 = Math.round(a.u);
  const v1 = Math.round(a.v);
  const u2 = Math.round(b.u);
  const v2 = Math.round(b.v);
  const du = u2 - u1;
  const dv = v2 - v1;

  if (dv === 0) return Math.abs(du);
  if (du === 0) return Math.abs(dv);
  if (du === dv) return Math.abs(du);
  return Math.hypot(du, dv);
}

export function formatRealDistance(value, unitName) {
  const unit = unitName || "ft";
  const safeValue = Number.isFinite(value) ? value : 0;

  if (unit === "ft") {
    const sign = safeValue < 0 ? "-" : "";
    const abs = Math.abs(safeValue);
    const feet = Math.floor(abs);
    const inches = Math.round((abs - feet) * 12);
    const carryFeet = feet + Math.floor(inches / 12);
    const remainderInches = inches % 12;
    return `${sign}${carryFeet}' ${remainderInches}\" (${safeValue.toFixed(2)} ft)`;
  }

  return `${safeValue.toFixed(2)} ${unit}`;
}

export function buildDistanceLabel({ startUV, endUV, unitPerCell = 1, unitName = "ft" }) {
  const gridLen = computeIsoGridSteps(startUV, endUV);
  const realLen = gridLen * unitPerCell;
  const formattedReal = formatRealDistance(realLen, unitName);
  return `${gridLen.toFixed(2)} grid | ${formattedReal}`;
}
