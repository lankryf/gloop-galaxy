import type { RoomInfo } from "@gloop/shared/protocol.ts";
import { messageOf } from "../assets/retry.ts";
import { must } from "../ui/dom.ts";
import type { Lobby } from "./lobby.ts";

const NAME_KEY = "gloop.name";

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    return;
  }
}

export function mountLobby(lobby: Lobby, root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="panel lobby">
      <h1>Gloop Galaxy</h1>
      <label>Позивний <input name="pilot" maxlength="16" autocomplete="off" /></label>
      <div class="rooms-head"><span>Кімнати</span><span class="status"></span></div>
      <ul class="rooms"></ul>
      <form class="create-room">
        <input name="room" maxlength="32" placeholder="Нова кімната" />
        <select name="arena">
          <option value="nebula">Туманність</option>
          <option value="junkyard">Звалище</option>
        </select>
        <button class="small">+</button>
      </form>
      <button class="join" disabled>Летіти!</button>
      <p class="error" hidden></p>
    </div>`;

  const pilot = must(root, 'input[name="pilot"]', HTMLInputElement);
  const list = must(root, ".rooms", HTMLUListElement);
  const status = must(root, ".status", HTMLSpanElement);
  const join = must(root, ".join", HTMLButtonElement);
  const error = must(root, ".error", HTMLParagraphElement);
  const form = must(root, ".create-room", HTMLFormElement);
  const roomName = must(form, 'input[name="room"]', HTMLInputElement);
  const arena = must(form, 'select[name="arena"]', HTMLSelectElement);
  let selected: string | null = null;

  pilot.value = savedName() || `pilot${Math.floor(Math.random() * 900 + 100)}`;

  function showError(text: string): void {
    error.hidden = false;
    error.textContent = text;
  }

  function render(rooms: readonly RoomInfo[]): void {
    list.replaceChildren(
      ...rooms.map((room) => {
        const li = document.createElement("li");
        const full = room.players >= room.maxPlayers;
        li.className = room.id === selected ? "selected" : "";
        li.classList.toggle("full", full);
        const title = document.createElement("span");
        title.textContent = room.name;
        const count = document.createElement("span");
        count.textContent = `${room.players}/${room.maxPlayers}`;
        li.append(title, count);
        li.addEventListener("click", () => {
          if (full) return;
          selected = room.id;
          join.disabled = false;
          render(lobby.rooms);
        });
        return li;
      }),
    );
  }

  const controller = new AbortController();
  const { signal } = controller;
  lobby.events.on(
    "loading",
    () => {
      status.textContent = "оновлення…";
    },
    { signal },
  );
  lobby.events.on(
    "rooms",
    ({ rooms }) => {
      status.textContent = `оновлено ${new Date().toLocaleTimeString()}`;
      error.hidden = true;
      render(rooms);
    },
    { signal },
  );
  lobby.events.on(
    "error",
    ({ message }) => {
      status.textContent = "";
      showError(`Не вдалося оновити список: ${message}`);
    },
    { signal },
  );

  form.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();
      const name = roomName.value.trim();
      if (!name) return;
      try {
        const room = await lobby.create(name, arena.value);
        selected = room.id;
        join.disabled = false;
        roomName.value = "";
        render(lobby.rooms);
      } catch (err: unknown) {
        showError(`Не вдалося створити кімнату: ${messageOf(err)}`);
      }
    },
    { signal },
  );

  join.addEventListener(
    "click",
    () => {
      const name = pilot.value.trim() || "pilot";
      saveName(name);
      try {
        lobby.join(selected, name);
      } catch (err: unknown) {
        showError(messageOf(err));
      }
    },
    { signal },
  );

  lobby.start();

  return () => {
    controller.abort();
    root.replaceChildren();
  };
}
