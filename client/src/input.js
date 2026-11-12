export function createInput(target = window) {
  const down = new Set();
  const pressed = new Set();
  const handlers = new Map();

  function typing(e) {
    return e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  }

  function onKeyDown(e) {
    if (typing(e)) return;
    if (!down.has(e.code)) {
      pressed.add(e.code);
      handlers.get(e.code)?.();
    }
    down.add(e.code);
  }

  function onKeyUp(e) {
    if (typing(e)) return;
    down.delete(e.code);
  }

  function onBlur() {
    down.clear();
    pressed.clear();
  }

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  return {
    isDown: (code) => down.has(code),
    justPressed: (code) => pressed.has(code),
    onPress(code, handler) {
      handlers.set(code, handler);
    },
    endStep() {
      pressed.clear();
    },
    dispose() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    },
  };
}
