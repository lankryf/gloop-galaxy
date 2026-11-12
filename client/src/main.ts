import { ARENAS, isArenaName } from "@gloop/shared/arenas.ts";
import type { RoomInfo, ServerMessageOf } from "@gloop/shared/protocol.ts";
import { ARENA } from "@gloop/shared/sim/arena.ts";
import type { Assets, Progress } from "./assets/loader.ts";
import { buildJobs, emptyAssets, loadAll, loadJson } from "./assets/loader.ts";
import type { Manifest } from "./assets/manifest.ts";
import { ManifestSchema } from "./assets/manifest.ts";
import { messageOf } from "./assets/retry.ts";
import { createAudio } from "./audio.ts";
import {
  applyFailMode,
  failMode,
  gameExperiment,
  netOptions,
  offline,
  sequential,
} from "./experiments.ts";
import { startGame } from "./game.ts";
import { createInput } from "./input.ts";
import { Lobby } from "./lobby/lobby.ts";
import { mountLobby } from "./lobby/view.ts";
import { Connection, socketUrl } from "./net/connection.ts";
import type { OnlineGame } from "./online/game.ts";
import { startOnlineGame } from "./online/game.ts";
import { setupCanvas } from "./render/canvas.ts";
import type { SpriteSheet } from "./render/draw.ts";
import { drawLoading } from "./screens/loading.ts";
import { mountChat } from "./ui/chat.ts";
import { must } from "./ui/dom.ts";

declare global {
  interface Window {
    gloop?: OnlineGame;
  }
}

interface Session {
  readonly connection: Connection;
  readonly welcome: ServerMessageOf<"welcome">;
}

const canvas = must(document, "#game", HTMLCanvasElement);
const overlay = must(document, "#overlay", HTMLDivElement);
const { ctx, view } = setupCanvas(canvas, ARENA);
const input = createInput(window);
const audio = createAudio();
let lastProgress: Progress = { done: 0, total: 0, status: [] };

const cancelled = () => new DOMException("Cancelled by player", "AbortError");

function actions(buttons: readonly (readonly [string, () => void])[]): void {
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

function waitForClick(label: string): Promise<void> {
  return new Promise((resolve) => actions([[label, resolve]]));
}

async function loadAssets(manifest: Manifest): Promise<Assets> {
  const controller = new AbortController();
  const onKey = (e: KeyboardEvent) => {
    if (e.code === "Escape") controller.abort(cancelled());
  };
  window.addEventListener("keydown", onKey);
  actions([["Скасувати (Esc)", () => controller.abort(cancelled())]]);
  if (failMode === "abort") setTimeout(() => controller.abort(cancelled()), 700);

  const assets = emptyAssets();
  const jobs = buildJobs(manifest, audio.context, assets);
  const started = performance.now();
  try {
    return await loadAll(jobs, assets, {
      signal: controller.signal,
      sequential,
      onProgress: (p) => {
        lastProgress = p;
        drawLoading(ctx, view, lastProgress);
      },
    });
  } finally {
    const ms = Math.round(performance.now() - started);
    console.log(`assets ${sequential ? "sequential" : "concurrent"} ${ms} ms`);
    window.removeEventListener("keydown", onKey);
    overlay.replaceChildren();
  }
}

async function loadWithRetry(): Promise<{ manifest: Manifest; assets: Assets }> {
  for (;;) {
    try {
      const manifest = applyFailMode(await loadJson("/assets/manifest.json", ManifestSchema));
      return { manifest, assets: await loadAssets(manifest) };
    } catch (error: unknown) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      const title = aborted ? "Завантаження скасовано" : "Не вдалося завантажити гру";
      console.warn(title, messageOf(error));
      drawLoading(ctx, view, lastProgress, title, aborted ? "" : messageOf(error));
      await waitForClick("Спробувати ще раз");
    }
  }
}

const OFFLINE_ROOM: RoomInfo = {
  id: "offline",
  name: "offline",
  arena: "nebula",
  players: 1,
  maxPlayers: 1,
};

function pickRoom(message = ""): Promise<{ room: RoomInfo; name: string }> {
  if (offline) return Promise.resolve({ room: OFFLINE_ROOM, name: "probe" });
  const lobby = new Lobby();
  const panel = document.createElement("div");
  overlay.replaceChildren(panel);
  const unmount = mountLobby(lobby, panel);
  if (message) {
    const error = must(panel, ".error", HTMLElement);
    error.hidden = false;
    error.textContent = message;
  }
  return new Promise((resolve) => {
    lobby.events.once("join", (choice) => {
      unmount();
      resolve(choice);
    });
  });
}

function joinRoom(room: RoomInfo, name: string): Promise<Session> {
  const connection = new Connection(socketUrl());
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const { signal } = controller;
    const fail = (message: string) => {
      controller.abort();
      connection.close();
      reject(new Error(message));
    };
    connection.events.on(
      "open",
      () => connection.send("join", { room: room.id, name, codec: netOptions.codec }),
      {
        signal,
      },
    );
    connection.events.on(
      "welcome",
      (welcome) => {
        controller.abort();
        resolve({ connection, welcome });
      },
      { signal },
    );
    connection.events.on("error", (e) => fail(e.message), { signal });
    connection.events.on(
      "reconnecting",
      ({ attempt }) => {
        if (attempt >= 3) fail("сервер недоступний");
      },
      { signal },
    );
    connection.connect();
  });
}

async function enterRoom(): Promise<{ room: RoomInfo; name: string; session: Session | null }> {
  let message = "";
  for (;;) {
    const { room, name } = await pickRoom(message);
    if (offline) return { room, name, session: null };
    try {
      return { room, name, session: await joinRoom(room, name) };
    } catch (error: unknown) {
      message = `Не вдалося увійти: ${messageOf(error)}`;
    }
  }
}

async function boot(): Promise<void> {
  const { manifest, assets } = await loadWithRetry();
  audio.setBuffers(assets.sounds);
  if (assets.failures.length > 0) {
    drawLoading(ctx, view, lastProgress, "Частина файлів не завантажилась");
    await waitForClick("Грати без них");
  }

  const sprites: Record<string, SpriteSheet> = {};
  for (const [name, image] of Object.entries(assets.sprites)) {
    const entry = manifest.sprites[name];
    if (entry) sprites[name] = { image, frames: entry.frames };
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const { room, name, session } = await enterRoom();
  await audio.unlock().catch(() => {});

  const arena = isArenaName(room.arena) ? room.arena : "nebula";
  const theme = assets.arenas[arena] ?? Object.values(assets.arenas)[0];
  if (!theme) throw new Error("no arena themes loaded");

  if (!session) {
    const game = startGame({
      ctx,
      view,
      input,
      audio,
      sprites,
      theme,
      rules: ARENAS[arena],
      pilot: name,
      experiment: gameExperiment(),
    });
    for (const f of assets.failures) game.hud.note(`Не завантажилось ${f.name}: ${f.error}`, 8);
    return;
  }

  const { connection } = session;
  let you = session.welcome.you;
  connection.events.on("welcome", (welcome) => {
    you = welcome.you;
  });
  connection.events.on("open", () =>
    connection.send("join", { room: room.id, name, codec: netOptions.codec }),
  );
  mountChat(overlay, connection, { you: () => you });
  window.gloop = startOnlineGame({
    ctx,
    view,
    input,
    audio,
    sprites,
    theme,
    connection,
    welcome: session.welcome,
    options: { ...netOptions },
  });
}

boot().catch((error: unknown) => {
  console.error(error);
  drawLoading(ctx, view, lastProgress, "Щось зламалось", messageOf(error));
});
