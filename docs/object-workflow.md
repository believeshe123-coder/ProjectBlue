# Object workflow spec

This spec defines expected behavior for object selection, creation, move, and duplication in the scene graph workflow.

## 1) Selection rules

Anchor: `getTopmostHitShape`.

- A click resolves a hit using `getTopmostHitShape(...)`.
- If the hit is a child of an object, default click selection resolves to the selectable/movable root (prefer topmost object ancestor when present).
- If the clicked chain already includes a selected object, keep that selected object as the selection root (do not drill into descendants on plain click).
- Multi-select modifier behavior:
  - With additive selection mode enabled (e.g., keep-select / modifier-driven additive flow), clicking toggles the resolved root in the current selection when type-compatible.
  - Without additive selection mode, clicking replaces selection with the resolved root.
- Locked shapes are not hit-selectable in normal selection flow when `includeLocked: false` is used.

## 2) Object creation

Anchor: `makeObjectFromSelection`.

- Object creation is initiated only from explicit user selection (current selection IDs and/or an active marquee selection bounds).
- Creation candidates are restricted to selected lines/faces (or shapes captured from explicit marquee bounds).
- Existing object roots alone are not valid input for creating a new object; user must select concrete line/face content.
- Optional toggle: **Include enclosed faces**.
  - When ON, enclosed regions in selection bounds may be captured and added as face children.
  - When OFF, only explicitly selected line/face nodes are used.
- On success, create one new object node from valid child IDs and set resulting selection to that new object.

## 3) Move behavior

Anchors: `applyWorldDeltaToNode`, `getWorldTransform`.

- Dragging a selected object applies a world-space delta through `applyWorldDeltaToNode(...)`.
- Object drag updates the object transform (not per-child direct edits in screen logic).
- Descendants move together through inherited transforms (`getWorldTransform(...)` composition), preserving parent/child spatial relationships.
- Mixed drag sets that include objects should use object-aware move options so object transforms remain authoritative.

## 4) Duplicate behavior

Anchor: `duplicateSelection` (invokes store duplication APIs).

- Trigger sources:
  - Keyboard shortcut: `Ctrl/Cmd + D`.
  - Selection/menu button action for Duplicate.
- Duplication acts on currently selected root IDs.
- Default duplicate offset is zero (`{ x: 0, y: 0 }`) so duplicates are created directly on top of the source selection.
- Resulting selection is replaced with duplicated root IDs, with the last duplicated ID as active/last-selected.

## 5) Edge cases

- **Locked or hidden layers/items**
  - Locked items are not movable; standard hit-testing for selection excludes locked targets when `includeLocked: false`.
  - Hidden-layer behavior should follow store-level visibility filtering for hit-testing and intersection queries.
- **Nested objects**
  - Click/drag resolve to a stable movable root to avoid accidental partial edits of deep descendants.
  - Object creation must reject self-referential or cyclic child inclusion.
- **Mixed-type selections**
  - Object creation accepts only line/face inputs (plus optional enclosed-face capture).
  - Selection operations that require a unified type should filter to compatible roots and ignore incompatible hits.
