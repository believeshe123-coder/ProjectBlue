export class HistoryStore {
  constructor(limit = 20) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  trimStack(stack) {
    if (stack.length <= this.limit) return;
    stack.splice(0, stack.length - this.limit);
  }

  pushState(snapshot) {
    this.undoStack.push(JSON.stringify(snapshot));
    this.trimStack(this.undoStack);
    this.redoStack = [];
  }

  undo(currentSnapshot) {
    if (this.undoStack.length === 0) {
      return null;
    }

    const previous = this.undoStack.pop();
    this.redoStack.push(JSON.stringify(currentSnapshot));
    this.trimStack(this.redoStack);
    return JSON.parse(previous);
  }

  redo(currentSnapshot) {
    if (this.redoStack.length === 0) {
      return null;
    }

    const next = this.redoStack.pop();
    this.undoStack.push(JSON.stringify(currentSnapshot));
    this.trimStack(this.undoStack);
    return JSON.parse(next);
  }

  serialize() {
    return {
      limit: this.limit,
      undoStack: [...this.undoStack],
      redoStack: [...this.redoStack],
    };
  }

  restore({ undoStack = [], redoStack = [] } = {}) {
    const safeUndo = Array.isArray(undoStack) ? undoStack.filter((entry) => typeof entry === 'string') : [];
    const safeRedo = Array.isArray(redoStack) ? redoStack.filter((entry) => typeof entry === 'string') : [];
    this.undoStack = safeUndo;
    this.redoStack = safeRedo;
    this.trimStack(this.undoStack);
    this.trimStack(this.redoStack);
  }
}
