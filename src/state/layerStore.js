function makeLayerId() {
  return `layer_${Math.random().toString(36).slice(2, 10)}`;
}

export class LayerStore {
  constructor() {
    this.clear();
  }

  clear() {
    const defaultLayerId = makeLayerId();
    this.layersById = {
      [defaultLayerId]: {
        id: defaultLayerId,
        name: "Layer 1",
        visible: true,
        locked: false,
        createdAt: Date.now(),
      },
    };
    this.orderedLayerIds = [defaultLayerId];
    this.activeLayerId = defaultLayerId;
  }

  getActiveLayerId() {
    return this.activeLayerId;
  }

  getOrderedLayerIds() {
    return [...this.orderedLayerIds];
  }

  getLayerById(id) {
    return this.layersById[id] ?? null;
  }

  createLayer({ name } = {}) {
    const id = makeLayerId();
    const index = this.orderedLayerIds.length + 1;
    this.layersById[id] = {
      id,
      name: name || `Layer ${index}`,
      visible: true,
      locked: false,
      createdAt: Date.now(),
    };
    this.orderedLayerIds.push(id);
    this.activeLayerId = id;
    return id;
  }

  setActiveLayer(id) {
    if (!this.layersById[id]) return false;
    this.activeLayerId = id;
    return true;
  }

  setLayerVisibility(id, visible) {
    if (!this.layersById[id]) return false;
    this.layersById[id].visible = visible !== false;
    return true;
  }

  setLayerLocked(id, locked) {
    if (!this.layersById[id]) return false;
    this.layersById[id].locked = locked === true;
    return true;
  }

  reorderLayers(nextOrderedIds = []) {
    const known = new Set(Object.keys(this.layersById));
    const filtered = nextOrderedIds.filter((id) => known.has(id));
    const missing = this.orderedLayerIds.filter((id) => !filtered.includes(id));
    this.orderedLayerIds = [...filtered, ...missing];
    return this.getOrderedLayerIds();
  }

  serialize() {
    return {
      layersById: { ...this.layersById },
      orderedLayerIds: [...this.orderedLayerIds],
      activeLayerId: this.activeLayerId,
    };
  }

  replaceFromSerialized(serialized) {
    if (!serialized || typeof serialized !== "object") return false;
    const ids = Array.isArray(serialized.orderedLayerIds) ? serialized.orderedLayerIds : [];
    const layersById = serialized.layersById ?? {};
    const validIds = ids.filter((id) => layersById[id]);
    if (!validIds.length) return false;
    this.layersById = { ...layersById };
    this.orderedLayerIds = validIds;
    this.activeLayerId = layersById[serialized.activeLayerId] ? serialized.activeLayerId : validIds[0];
    return true;
  }
}
