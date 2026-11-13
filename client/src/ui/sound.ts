const KEY = "gloop.sound";

function load(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let on = load();

export const sound = {
  get on(): boolean {
    return on;
  },
  set(value: boolean): void {
    on = value;
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {}
  },
};
