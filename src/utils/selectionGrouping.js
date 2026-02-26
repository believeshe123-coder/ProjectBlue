export function resolveSelectionGroupingAction({
  enableGrouping = true,
  selectedType = null,
  selectedCount = 0,
  enclosedFillCount = 0,
} = {}) {
  if (!enableGrouping) return null;
  if (!Number.isFinite(selectedCount) || selectedCount <= 0) return null;

  if (selectedType === "line") {
    if (Number.isFinite(enclosedFillCount) && enclosedFillCount > 0) return { kind: "make-face", label: "Group as Face" };
    if (selectedCount >= 2) return { kind: "make-object", label: "Group to Object" };
    return null;
  }

  if (selectedType === "face" && selectedCount >= 2) {
    return { kind: "make-object", label: "Group to Object" };
  }

  return null;
}
