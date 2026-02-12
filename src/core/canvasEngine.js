export class CanvasEngine {
  constructor({ canvas, camera, getTool, onContextMenuPrevent }) {
    this.canvas = canvas;
    this.camera = camera;
    this.getTool = getTool;
    this.isPanning = false;
    this.lastPointer = null;

    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;

    this.handleResize = this.handleResize.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);

    window.addEventListener("resize", this.handleResize);
    canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    canvas.addEventListener("mousedown", this.handleMouseDown);
    canvas.addEventListener("mousemove", this.handleMouseMove);
    window.addEventListener("mouseup", this.handleMouseUp);
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      onContextMenuPrevent?.(e);
    });

    this.handleResize();
  }

  getContext() {
    return this.ctx;
  }

  getScreenPointFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  handleResize() {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = this.canvas;

    this.canvas.width = Math.floor(clientWidth * dpr);
    this.canvas.height = Math.floor(clientHeight * dpr);

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  handleWheel(event) {
    event.preventDefault();
    const pointer = this.getScreenPointFromEvent(event);
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    this.camera.zoomAt(pointer, factor);
  }

  handleMouseDown(event) {
    const screenPoint = this.getScreenPointFromEvent(event);
    const worldPoint = this.camera.screenToWorld(screenPoint);

    if (event.button === 2) {
      this.isPanning = true;
      this.lastPointer = screenPoint;
      return;
    }

    this.getTool()?.onMouseDown({ event, screenPoint, worldPoint });
  }

  handleMouseMove(event) {
    const screenPoint = this.getScreenPointFromEvent(event);
    const worldPoint = this.camera.screenToWorld(screenPoint);

    if (this.isPanning && this.lastPointer) {
      this.camera.panBy(screenPoint.x - this.lastPointer.x, screenPoint.y - this.lastPointer.y);
      this.lastPointer = screenPoint;
      return;
    }

    this.getTool()?.onMouseMove({ event, screenPoint, worldPoint });
  }

  handleMouseUp(event) {
    const screenPoint = this.getScreenPointFromEvent(event);
    const worldPoint = this.camera.screenToWorld(screenPoint);

    if (event.button === 2) {
      this.isPanning = false;
      this.lastPointer = null;
      return;
    }

    this.getTool()?.onMouseUp({ event, screenPoint, worldPoint });
  }
}
