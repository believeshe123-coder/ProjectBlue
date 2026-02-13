export const DEFAULT_LAYER_ID = "layer-1";

function createDefaultLayer() {
  return {
    id: DEFAULT_LAYER_ID,
    name: "Layer 1",
    visible: true,
    locked: false,
    zIndex: 0,
    createdAt: Date.now(),
  };
}

function normalizeLayer(layer, fallbackIndex = 0) {
  const zIndex = Number.isFinite(layer?.zIndex) ? layer.zIndex : fallbackIndex;
  return {
    id: typeof layer?.id === "string" && layer.id ? layer.id : `layer-${zIndex + 1}`,
    name: typeof layer?.name === "string" && layer.name.trim() ? layer.name.trim() : `Layer ${zIndex + 1}`,
    visible: layer?.visible !== false,
    locked: layer?.locked === true,
    zIndex,
    createdAt: Number.isFinite(layer?.createdAt) ? layer.createdAt : Date.now(),
  };
}

export class LayerStore {
  constructor() {
    this.layers = [createDefaultLayer()];
    this.activeLayerId = DEFAULT_LAYER_ID;
  }

  ensureDefaultLayer() {
    let defaultLayer = this.layers.find((layer) => layer.id === DEFAULT_LAYER_ID);
    if (!defaultLayer) {
      defaultLayer = createDefaultLayer();
      this.layers.unshift(defaultLayer);
    }

    this.reindexLayers();
    this.ensureActiveLayer();
    return defaultLayer;
  }

  ensureActiveLayer() {
    if (this.layers.length === 0) {
      this.layers = [createDefaultLayer()];
    }

    const active = this.layers.find((layer) => layer.id === this.activeLayerId);
    if (!active) {
      this.activeLayerId = this.layers[0].id;
    }
    return this.getActiveLayer();
  }

  createLayer(name) {
    const layer = {
      id: `layer-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: typeof name === "string" && name.trim() ? name.trim() : `Layer ${this.layers.length + 1}`,
      visible: true,
      locked: false,
      zIndex: this.layers.length,
      createdAt: Date.now(),
    };

    this.layers.push(layer);
    this.reindexLayers();
    this.activeLayerId = layer.id;
    return layer;
  }

  deleteLayer(id) {
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index === -1 || this.layers.length <= 1) {
      return false;
    }

    this.layers.splice(index, 1);
    this.reindexLayers();
    this.ensureActiveLayer();
    return true;
  }

  updateLayer(id, updates = {}) {
    const layer = this.layers.find((item) => item.id === id);
    if (!layer) return false;

    if (typeof updates.name === "string" && updates.name.trim()) {
      layer.name = updates.name.trim();
    }

    if (typeof updates.visible === "boolean") {
      layer.visible = updates.visible;
    }

    if (typeof updates.locked === "boolean") {
      layer.locked = updates.locked;
    }

    return true;
  }

  moveLayer(fromId, toId) {
    const fromIndex = this.layers.findIndex((layer) => layer.id === fromId);
    const toIndex = this.layers.findIndex((layer) => layer.id === toId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return false;
    }

    const [moved] = this.layers.splice(fromIndex, 1);
    this.layers.splice(toIndex, 0, moved);
    this.reindexLayers();
    return true;
  }

  moveLayerByOffset(id, direction) {
    const index = this.layers.findIndex((layer) => layer.id === id);
    if (index === -1) return false;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= this.layers.length) return false;
    const swapWith = this.layers[nextIndex];
    return this.moveLayer(id, swapWith.id);
  }

  reindexLayers() {
    this.layers = this.layers
      .map((layer, index) => ({ ...layer, zIndex: index }))
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }

  setActiveLayer(id) {
    if (this.layers.some((layer) => layer.id === id)) {
      this.activeLayerId = id;
      return true;
    }

    this.ensureActiveLayer();
    return false;
  }

  getActiveLayer() {
    return this.layers.find((layer) => layer.id === this.activeLayerId) ?? null;
  }

  getLayerById(id) {
    return this.layers.find((layer) => layer.id === id) ?? null;
  }

  getLayers() {
    return [...this.layers].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }

  getFirstUnlockedVisibleLayer() {
    return this.getLayers().find((layer) => layer.visible !== false && layer.locked !== true) ?? null;
  }

  serialize() {
    return this.getLayers().map((layer) => ({ ...layer }));
  }

  replaceFromSerialized(serializedLayers, activeLayerId = null) {
    const nextLayers = Array.isArray(serializedLayers) && serializedLayers.length > 0
      ? serializedLayers.map((layer, index) => normalizeLayer(layer, index))
      : [createDefaultLayer()];

    this.layers = nextLayers;
    this.ensureDefaultLayer();

    if (typeof activeLayerId === "string") {
      this.activeLayerId = activeLayerId;
    }
    this.ensureActiveLayer();
  }
}
