export class CanvasEngine {
  constructor({ canvas, canvasWrap, camera, getTool, onContextMenuPrevent, onViewChange }) {
    this.canvas = canvas;
    this.canvasWrap = canvasWrap;
    this.camera = camera;
    this.getTool = getTool;
    this.onViewChange = onViewChange;
    this.isPanning = false;
    this.lastPointer = null;

    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;

    this.canvasCssW = 0;
    this.canvasCssH = 0;
    this.currentDpr = window.devicePixelRatio || 1;

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

    this.resizeCanvasToContainer();
  }

  getContext() {
    return this.ctx;
  }

  getCanvasMetrics() {
    return {
      canvasCssW: this.canvasCssW,
      canvasCssH: this.canvasCssH,
      currentDpr: this.currentDpr,
    };
  }

  getScreenPointFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  resizeCanvasToContainer() {
    const rect = this.canvasWrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const canvasCssW = rect.width;
    const canvasCssH = rect.height;
    const pixelWidth = Math.round(canvasCssW * dpr);
    const pixelHeight = Math.round(canvasCssH * dpr);

    this.canvas.style.width = `${canvasCssW}px`;
    this.canvas.style.height = `${canvasCssH}px`;

    if (this.canvas.width !== pixelWidth) {
      this.canvas.width = pixelWidth;
    }

    if (this.canvas.height !== pixelHeight) {
      this.canvas.height = pixelHeight;
    }

    this.canvasCssW = canvasCssW;
    this.canvasCssH = canvasCssH;
    this.currentDpr = dpr;
    this.camera.setViewSize(canvasCssW, canvasCssH);
  }

  handleResize() {
    this.resizeCanvasToContainer();
  }

  handleWheel(event) {
    event.preventDefault();
    const pointer = this.getScreenPointFromEvent(event);
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    this.camera.zoomAt(pointer, factor);
    this.onViewChange?.();
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
      this.onViewChange?.();
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
