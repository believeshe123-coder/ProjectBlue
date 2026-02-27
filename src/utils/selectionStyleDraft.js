export function getSelectionStyleSummaryFromShapes(selectedShapes, currentStyle) {
  const styleTargets = selectedShapes.filter((shape) => shape && ("strokeColor" in shape || "strokeWidth" in shape));
  if (!styleTargets.length) {
    return {
      supportsColor: false,
      supportsStrokeWidth: false,
      color: currentStyle.strokeColor,
      strokeWidth: currentStyle.strokeWidth,
    };
  }

  const colorTarget = styleTargets.find((shape) => "strokeColor" in shape);
  const strokeTarget = styleTargets.find((shape) => "strokeWidth" in shape);

  return {
    supportsColor: !!colorTarget,
    supportsStrokeWidth: !!strokeTarget,
    color: colorTarget?.strokeColor ?? currentStyle.strokeColor,
    strokeWidth: strokeTarget?.strokeWidth ?? currentStyle.strokeWidth,
  };
}

export function applySelectionDraftToShapes(selectedShapes, draft) {
  for (const shape of selectedShapes) {
    if (draft.supportsColor) {
      if ("strokeColor" in shape) shape.strokeColor = draft.color;
      if ("fillColor" in shape && shape.type === "face") shape.fillColor = draft.color;
    }
    if (draft.supportsStrokeWidth && "strokeWidth" in shape) {
      shape.strokeWidth = draft.strokeWidth;
    }
  }
}

export function getSelectionApplyDisabledState({ supportsColor, supportsStrokeWidth }) {
  return !supportsColor && !supportsStrokeWidth;
}
