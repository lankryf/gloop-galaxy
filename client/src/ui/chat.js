export function mountChat(root, connection, { you }) {
  const box = document.createElement("div");
  box.className = "chat";
  box.innerHTML = `
    <ul class="chat-log"></ul>
    <input class="chat-input" maxlength="200" placeholder="Enter – написати" />
    <div class="chat-status"></div>`;
  const roster = document.createElement("div");
  roster.className = "roster";
  root.append(box, roster);

  const log = box.querySelector(".chat-log");
  const input = box.querySelector(".chat-input");
  const status = box.querySelector(".chat-status");
  const controller = new AbortController();
  const { signal } = controller;

  function add(text, kind = "") {
    const li = document.createElement("li");
    li.className = kind;
    li.textContent = text;
    log.append(li);
    while (log.children.length > 8) log.firstElementChild.remove();
  }

  connection.addEventListener(
    "chat",
    (e) => {
      const { name, text, from } = e.detail;
      add(`${name}: ${text}`, from === you() ? "own" : "");
    },
    { signal },
  );

  let previous = new Map();
  function showRoster(players) {
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

  connection.addEventListener("roster", (e) => showRoster(e.detail.players), { signal });
  const known = connection.last.get("roster");
  if (known) showRoster(known.players);

  connection.addEventListener(
    "status",
    (e) => {
      const labels = {
        open: "",
        connecting: "з'єднання…",
        reconnecting: "зв'язок втрачено, перепідключення…",
        closed: "відключено",
      };
      status.textContent = labels[e.detail.status] ?? "";
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
