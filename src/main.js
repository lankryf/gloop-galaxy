import { buildJobs, loadAll, loadJson } from "./assets/loader.js";
import { createAudio } from "./audio.js";
import { applyFailMode, failMode, gameExperiment, probe, sequential } from "./experiments.js";
import { startGame } from "./game.js";
import { createInput } from "./input.js";
import { Lobby } from "./lobby/lobby.js";
import { mountLobby } from "./lobby/view.js";
import { setupCanvas } from "./render/canvas.js";
import { drawLoading } from "./screens/loading.js";
import { ARENA } from "./sim/arena.js";

const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const { ctx, view } = setupCanvas(canvas, ARENA);
const input = createInput(window);
const audio = createAudio();

function actions(buttons) {
  const box = document.createElement("div");
  box.className = "loading-actions";
  for (const [label, onClick] of buttons) {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", onClick, { once: true });
    box.append(b);
  }
  overlay.replaceChildren(box);
}

function waitForClick(label) {
  return new Promise((resolve) => actions([[label, resolve]]));
}

async function loadAssets(manifest) {
  const controller = new AbortController();
  const onKey = (e) => {
    if (e.code === "Escape")
      controller.abort(new DOMException("Cancelled by player", "AbortError"));
  };
  window.addEventListener("keydown", onKey);
  actions([
    [
      "Скасувати (Esc)",
      () => controller.abort(new DOMException("Cancelled by player", "AbortError")),
    ],
  ]);
  if (failMode === "abort")
    setTimeout(() => controller.abort(new DOMException("Cancelled by player", "AbortError")), 700);

  let progress = { done: 0, total: 0, status: [] };
  const draw = () => drawLoading(ctx, view, progress);
  const jobs = buildJobs(manifest, audio.context);
  const started = performance.now();
  try {
    return await loadAll(jobs, {
      signal: controller.signal,
      sequential,
      onProgress: (p) => {
        progress = p;
        draw();
      },
    });
  } finally {
    const ms = Math.round(performance.now() - started);
    console.log(`assets ${sequential ? "sequential" : "concurrent"} ${ms} ms`);
    window.removeEventListener("keydown", onKey);
    overlay.replaceChildren();
  }
}

async function loadWithRetry() {
  for (;;) {
    try {
      const manifest = applyFailMode(await loadJson("/assets/manifest.json"));
      return { manifest, assets: await loadAssets(manifest) };
    } catch (error) {
      const reason =
        error.name === "AbortError"
          ? "Завантаження скасовано"
          : `Не вдалося завантажити: ${error.message}`;
      console.warn(reason);
      drawLoading(ctx, view, { done: 0, total: 0, status: [] }, reason);
      await waitForClick("Спробувати ще раз");
    }
  }
}

function pickRoom() {
  if (probe) return Promise.resolve({ room: { arena: "nebula" }, name: "probe" });
  const lobby = new Lobby();
  const panel = document.createElement("div");
  overlay.replaceChildren(panel);
  const unmount = mountLobby(lobby, panel);
  return new Promise((resolve) => {
    lobby.addEventListener(
      "join",
      (e) => {
        unmount();
        resolve(e.detail);
      },
      { once: true },
    );
  });
}

async function boot() {
  const { manifest, assets } = await loadWithRetry();
  audio.setBuffers(assets.sounds);

  const sprites = {};
  for (const [name, image] of Object.entries(assets.sprites)) {
    sprites[name] = { image, frames: manifest.sprites[name].frames };
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { room, name } = await pickRoom();
  await audio.unlock().catch(() => {});

  const arena = assets.arenas[room.arena];
  const game = startGame({
    ctx,
    view,
    input,
    audio,
    sprites,
    arena,
    pilot: name,
    experiment: gameExperiment(),
  });
  for (const f of assets.failures) game.hud.note(`Не завантажилось ${f.name}: ${f.error}`, 8);
}

boot();
