import { aimOf } from "@gloop/shared/protocol.ts";
import type { Controls } from "@gloop/shared/sim/ship.ts";
import type { Input } from "../input.ts";

const KEY = "gloop.mouse";

function load(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

let mouse = load();

export const controlMode = {
  get mouse(): boolean {
    return mouse;
  },
  set(value: boolean): void {
    mouse = value;
    try {
      localStorage.setItem(KEY, mouse ? "1" : "0");
    } catch {}
  },
};

const HINTS = {
  mouse: "Миша – напрям · Space – газ · ЛКМ – вогонь · ПКМ/E – скіл · B – буст",
  keys: "W – газ · A/D – поворот · Space – вогонь · E – скіл · Shift – буст",
};

export function mountControlToggle(root: HTMLElement): () => void {
  const hint = document.createElement("div");
  hint.className = "control-hint";
  const showHint = () => {
    hint.textContent = mouse ? HINTS.mouse : HINTS.keys;
  };
  showHint();
  const label = document.createElement("label");
  label.className = "control-toggle";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.checked = mouse;
  box.addEventListener("change", () => {
    controlMode.set(box.checked);
    showHint();
    box.blur();
  });
  label.append(box, " керування мишею");
  const toggles = document.createElement("div");
  toggles.className = "game-toggles";
  toggles.append(label);
  root.append(toggles, hint);
  return () => {
    toggles.remove();
    hint.remove();
  };
}

export interface AimView {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly cameraX: number;
  readonly cameraY: number;
}

export function readShipControls(
  input: Input,
  ship: { readonly x: number; readonly y: number } | null,
  view: AimView,
): Controls {
  if (!mouse) {
    return {
      thrust: input.isDown("ArrowUp") || input.isDown("KeyW"),
      left: input.isDown("ArrowLeft") || input.isDown("KeyA"),
      right: input.isDown("ArrowRight") || input.isDown("KeyD"),
      fire: input.isDown("Space"),
      use: input.isDown("KeyE"),
      boost: input.isDown("ShiftLeft") || input.isDown("ShiftRight"),
    };
  }
  const base = {
    thrust: input.isDown("Space") || input.isDown("KeyW") || input.isDown("ArrowUp"),
    left: false,
    right: false,
    fire: input.isDown("Mouse0"),
    use: input.isDown("Mouse2") || input.isDown("KeyE"),
    boost: input.isDown("KeyB"),
  };
  if (!ship || !input.pointer.seen) return base;
  const rect = view.canvas.getBoundingClientRect();
  const x = view.cameraX + (input.pointer.x - rect.left - view.width / 2) / view.scale;
  const y = view.cameraY + (input.pointer.y - rect.top - view.height / 2) / view.scale;
  if (x === ship.x && y === ship.y) return base;
  return { ...base, aim: aimOf(Math.atan2(y - ship.y, x - ship.x)) };
}
