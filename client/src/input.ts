export interface Pointer {
  readonly x: number;
  readonly y: number;
  readonly seen: boolean;
}

export interface Input {
  readonly pointer: Pointer;
  isDown(code: string): boolean;
  justPressed(code: string): boolean;
  endStep(): void;
  dispose(): void;
}

function typing(e: KeyboardEvent): boolean {
  return e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
}

export function createInput(target: Window = window): Input {
  const down = new Set<string>();
  const pressed = new Set<string>();

  function onKeyDown(e: KeyboardEvent): void {
    if (typing(e)) return;
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (typing(e)) return;
    down.delete(e.code);
  }

  const pointer = { x: 0, y: 0, seen: false };

  function onMouseMove(e: MouseEvent): void {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.seen = true;
  }

  function onMouseDown(e: MouseEvent): void {
    if (!(e.target instanceof HTMLCanvasElement)) return;
    onMouseMove(e);
    const code = `Mouse${e.button}`;
    if (!down.has(code)) pressed.add(code);
    down.add(code);
  }

  function onMouseUp(e: MouseEvent): void {
    down.delete(`Mouse${e.button}`);
  }

  function onContextMenu(e: MouseEvent): void {
    if (e.target instanceof HTMLCanvasElement) e.preventDefault();
  }

  function onBlur(): void {
    down.clear();
    pressed.clear();
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);
  target.addEventListener("mousemove", onMouseMove);
  target.addEventListener("mousedown", onMouseDown);
  target.addEventListener("mouseup", onMouseUp);
  target.addEventListener("contextmenu", onContextMenu);

  return {
    pointer,
    isDown: (code) => down.has(code),
    justPressed: (code) => pressed.has(code),
    endStep() {
      pressed.clear();
    },
    dispose() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
      target.removeEventListener("mousemove", onMouseMove);
      target.removeEventListener("mousedown", onMouseDown);
      target.removeEventListener("mouseup", onMouseUp);
      target.removeEventListener("contextmenu", onContextMenu);
    },
  };
}
