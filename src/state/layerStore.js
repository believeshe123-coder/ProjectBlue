let layerCounter = 0;

function createLayerEntity(name = `Layer ${layerCounter + 1}`) {
  return {
    id: `layer_${layerCounter++}`,
    name,
    visible: true,
    locked: false,
    defaultStrokeColor: "#ffffff",
    defaultFillColor: "transparent",
  };
}

export class LayerStore {
  constructor() {
    this.layers = [];
    this.activeLayerId = null;
  }

  createLayer(name) {
    const layer = createLayerEntity(name);
    this.layers.push(layer);
    if (!this.activeLayerId) {
      this.activeLayerId = layer.id;
    }
    return layer;
  }

  deleteLayer(id) {
    const index = this.layers.findIndex((l) => l.id === id);
    if (index === -1 || this.layers.length === 1) {
      return false;
    }

    this.layers.splice(index, 1);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.layers[0].id;
    }
    return true;
  }

  setActiveLayer(id) {
    if (this.layers.some((layer) => layer.id === id)) {
      this.activeLayerId = id;
      return true;
    }
    return false;
  }

  getActiveLayer() {
    return this.layers.find((layer) => layer.id === this.activeLayerId) ?? null;
  }

  toggleVisibility(id) {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) {
      return false;
    }
    layer.visible = !layer.visible;
    return true;
  }

  getLayers() {
    return [...this.layers];
  }
}
