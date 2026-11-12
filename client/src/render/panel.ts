export interface PanelStyle {
  readonly width: number;
  readonly lineHeight: number;
  readonly font: string;
  readonly color: string;
  readonly padding: number;
}

export class TextPanel {
  readonly style: PanelStyle;
  #canvas: HTMLCanvasElement | null = null;
  #lines = 0;
  #dpr = 1;

  constructor(style: PanelStyle) {
    this.style = style;
  }

  get height(): number {
    return this.#lines * this.style.lineHeight + this.style.padding;
  }

  update(lines: readonly string[], dpr: number): void {
    const { width, lineHeight, font, color, padding } = this.style;
    this.#lines = lines.length;
    this.#dpr = dpr;
    const canvas = this.#canvas ?? document.createElement("canvas");
    this.#canvas = canvas;
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(this.height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.font = font;
    ctx.fillStyle = color;
    for (let i = 0; i < lines.length; i++)
      ctx.fillText(lines[i] ?? "", padding, padding + 2 + i * lineHeight + lineHeight / 2);
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    if (!this.#canvas || this.#lines === 0) return;
    ctx.drawImage(
      this.#canvas,
      x,
      y,
      this.#canvas.width / this.#dpr,
      this.#canvas.height / this.#dpr,
    );
  }
}
