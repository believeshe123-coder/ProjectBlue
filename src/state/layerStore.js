function makeLayerId() {
  return `layer_${Math.random().toString(36).slice(2, 10)}`;
}

function makeLayerRecord(id, { name, visible = true, locked = false, createdAt } = {}, index = 1) {
  return {
    id,
    name: name || `Layer ${index}`,
    visible: visible !== false,
    locked: locked === true,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
}

export class LayerStore {
  constructor() {
    this.clear();
  }

  clear() {
    const id = makeLayerId();
    this.layersById = { [id]: makeLayerRecord(id, { name: "Layer 1" }, 1) };
    this.orderedLayerIds = [id];
    this.activeLayerId = id;
  }

  getActiveLayerId() {
    return this.layersById[this.activeLayerId] ? this.activeLayerId : this.orderedLayerIds[0] ?? null;
  }

  getOrderedLayerIds() {
    return [...this.orderedLayerIds];
  }

  getLayerById(id) {
    return this.layersById[id] ?? null;
  }

  createLayer({ name } = {}) {
    const id = makeLayerId();
    const layer = makeLayerRecord(id, { name }, this.orderedLayerIds.length + 1);
    this.layersById[id] = layer;
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
    const layer = this.layersById[id];
    if (!layer) return false;
    layer.visible = visible !== false;
    return true;
  }

  setLayerLocked(id, locked) {
    const layer = this.layersById[id];
    if (!layer) return false;
    layer.locked = locked === true;
    return true;
  }

  reorderLayers(nextOrderedIds = []) {
    const known = new Set(Object.keys(this.layersById));
    const filtered = nextOrderedIds.filter((id) => known.has(id));
    const missing = this.orderedLayerIds.filter((id) => !filtered.includes(id));
    this.orderedLayerIds = [...filtered, ...missing];
    if (!this.layersById[this.activeLayerId]) this.activeLayerId = this.orderedLayerIds[0] ?? null;
    return this.getOrderedLayerIds();
  }

  serialize() {
    return {
      layersById: { ...this.layersById },
      orderedLayerIds: [...this.orderedLayerIds],
      activeLayerId: this.getActiveLayerId(),
    };
  }

  replaceFromSerialized(serialized) {
    if (!serialized || typeof serialized !== "object") return false;

    const layerIds = Array.isArray(serialized.orderedLayerIds) ? serialized.orderedLayerIds : [];
    const inputById = serialized.layersById && typeof serialized.layersById === "object"
      ? serialized.layersById
      : {};

    const layersById = {};
    const orderedLayerIds = [];
    for (const id of layerIds) {
      const candidate = inputById[id];
      if (!candidate || typeof candidate !== "object") continue;
      layersById[id] = makeLayerRecord(id, candidate, orderedLayerIds.length + 1);
      orderedLayerIds.push(id);
    }

    if (!orderedLayerIds.length) return false;

    this.layersById = layersById;
    this.orderedLayerIds = orderedLayerIds;
    this.activeLayerId = layersById[serialized.activeLayerId] ? serialized.activeLayerId : orderedLayerIds[0];
    return true;
  }
}
