import type { ServerMessageOf } from "@gloop/shared/protocol.ts";
import type { Connection, ConnectionStatus } from "../net/connection.ts";
import { must } from "./dom.ts";

const STATUS_LABELS: Readonly<Record<ConnectionStatus, string>> = {
  idle: "",
  open: "",
  connecting: "з'єднання…",
  reconnecting: "зв'язок втрачено, перепідключення…",
  closed: "відключено",
};

type Players = ServerMessageOf<"roster">["players"];

export function mountChat(
  root: HTMLElement,
  connection: Connection,
  { you }: { you: () => string },
): () => void {
  const box = document.createElement("div");
  box.className = "chat";
  box.innerHTML = `
    <ul class="chat-log"></ul>
    <input class="chat-input" maxlength="200" placeholder="Enter – написати" />
    <div class="chat-status"></div>`;
  const roster = document.createElement("div");
  roster.className = "roster";
  root.append(box, roster);

  const log = must(box, ".chat-log", HTMLUListElement);
  const input = must(box, ".chat-input", HTMLInputElement);
  const status = must(box, ".chat-status", HTMLDivElement);
  const controller = new AbortController();
  const { signal } = controller;

  function add(text: string, kind = ""): void {
    const li = document.createElement("li");
    li.className = kind;
    li.textContent = text;
    log.append(li);
    while (log.children.length > 8) log.firstElementChild?.remove();
  }

  connection.events.on(
    "chat",
    ({ name, text, from }) => add(`${name}: ${text}`, from === you() ? "own" : ""),
    {
      signal,
    },
  );

  let previous = new Map<string, string>();
  function showRoster(players: Players): void {
    const current = new Map(players.map((p) => [p.id, p.name]));
    for (const [id, name] of current)
      if (previous.size > 0 && !previous.has(id)) add(`${name} залетів`, "system");
    for (const [id, name] of previous) if (!current.has(id)) add(`${name} вилетів`, "system");
    previous = current;
    roster.replaceChildren(
      ...players.map((p) => {
        const div = document.createElement("div");
        div.textContent = p.id === you() ? `${p.name} (ти)` : p.name;
        return div;
      }),
    );
  }

  connection.events.on("roster", ({ players }) => showRoster(players), { signal });
  if (connection.lastRoster) showRoster(connection.lastRoster.players);

  connection.events.on(
    "status",
    (e) => {
      status.textContent = STATUS_LABELS[e.status];
    },
    { signal },
  );

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.code === "Enter" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    },
    { signal },
  );

  input.addEventListener(
    "keydown",
    (e) => {
      if (e.code === "Enter") {
        const text = input.value.trim();
        if (text) connection.send("chat", { text });
        input.value = "";
        input.blur();
      } else if (e.code === "Escape") {
        input.value = "";
        input.blur();
      }
    },
    { signal },
  );

  return () => {
    controller.abort();
    box.remove();
    roster.remove();
  };
}
