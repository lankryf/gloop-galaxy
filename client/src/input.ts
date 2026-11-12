export interface Input {
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

  function onBlur(): void {
    down.clear();
    pressed.clear();
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return {
    isDown: (code) => down.has(code),
    justPressed: (code) => pressed.has(code),
    endStep() {
      pressed.clear();
    },
    dispose() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
    },
  };
}
