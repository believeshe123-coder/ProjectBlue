export class BaseTool {
  constructor(context) {
    this.context = context;
    this.usesRightClick = false;
  }

  onMouseDown(_payload) {}

  onMouseMove(_payload) {}

  onMouseUp(_payload) {}

  onKeyDown(_event) {}

  onActivate() {}

  onDeactivate() {}
}
