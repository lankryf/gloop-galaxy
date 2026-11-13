const KEY = "gloop.debug";

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let enabled = load();

export const debug = {
  get on(): boolean {
    return enabled;
  },
  set(value: boolean): void {
    enabled = value;
    document.body.classList.toggle("debug", enabled);
    try {
      localStorage.setItem(KEY, enabled ? "1" : "0");
    } catch {}
  },
  toggle(): void {
    debug.set(!enabled);
  },
};

export function mountDebugToggle(root: HTMLElement): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "debug-toggle";
  button.textContent = "debug";
  button.title = "Показати або сховати технічні панелі (F3)";
  const sync = () => button.setAttribute("aria-pressed", String(enabled));
  button.addEventListener("click", () => {
    debug.toggle();
    sync();
    button.blur();
  });
  window.addEventListener("keydown", (e) => {
    if (e.code !== "F3" || e.target instanceof HTMLInputElement) return;
    e.preventDefault();
    debug.toggle();
    sync();
  });
  debug.set(enabled);
  sync();
  root.append(button);
}
