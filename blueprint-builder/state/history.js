export class HistoryStore {
  constructor(limit = 200) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
  }

  pushState(snapshot) {
    this.undoStack.push(JSON.stringify(snapshot));
    if (this.undoStack.length > this.limit) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(currentSnapshot) {
    if (this.undoStack.length === 0) {
      return null;
    }

    const previous = this.undoStack.pop();
    this.redoStack.push(JSON.stringify(currentSnapshot));
    return JSON.parse(previous);
  }

  redo(currentSnapshot) {
    if (this.redoStack.length === 0) {
      return null;
    }

    const next = this.redoStack.pop();
    this.undoStack.push(JSON.stringify(currentSnapshot));
    return JSON.parse(next);
  }
}
