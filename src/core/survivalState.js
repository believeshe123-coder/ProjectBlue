export class SurvivalState {
  constructor() {
    this.inventory = new Map();
    this.tools = {
      axe: false,
      pickaxe: false,
    };
    this.structures = {
      campfire: false,
    };
    this.chronicle = [];
  }

  getSnapshot() {
    return {
      inventory: Object.fromEntries(this.inventory),
      tools: { ...this.tools },
      structures: { ...this.structures },
      canGather: this.getGatheringCapabilities(),
      warmAtNight: this.isWarmAtNight(),
    };
  }

  addChronicle(message) {
    const entry = {
      id: this.chronicle.length + 1,
      timestamp: Date.now(),
      message,
    };
    this.chronicle.push(entry);
    return entry;
  }

  getChronicle({ offset = 0, limit = this.chronicle.length } = {}) {
    if (limit <= 0) {
      return [];
    }
    const start = Math.max(0, this.chronicle.length - offset - limit);
    const end = Math.max(0, this.chronicle.length - offset);
    return this.chronicle.slice(start, end);
  }

  craft(toolName) {
    if (toolName === "axe" || toolName === "pickaxe") {
      this.tools[toolName] = true;
      this.addChronicle(`Crafted ${toolName}.`);
      return true;
    }
    return false;
  }

  build(structureName) {
    if (structureName === "campfire") {
      this.structures.campfire = true;
      this.addChronicle("Built campfire.");
      return true;
    }
    return false;
  }

  gather(resourceName) {
    const capabilities = this.getGatheringCapabilities();
    if ((resourceName === "wood" && !capabilities.wood) || (resourceName === "rock" && !capabilities.rock)) {
      this.addChronicle(`Cannot gather ${resourceName} yet.`);
      return false;
    }

    this.inventory.set(resourceName, (this.inventory.get(resourceName) ?? 0) + 1);
    this.addChronicle(`Gathered ${resourceName}.`);
    return true;
  }

  getGatheringCapabilities() {
    return {
      wood: this.tools.axe,
      rock: this.tools.pickaxe,
    };
  }

  isWarmAtNight() {
    return this.structures.campfire;
  }
}
