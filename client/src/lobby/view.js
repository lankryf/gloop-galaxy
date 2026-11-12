const NAME_KEY = "gloop.name";

function savedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    return;
  }
}

export function mountLobby(lobby, root) {
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

  const input = root.querySelector("input");
  const list = root.querySelector(".rooms");
  const status = root.querySelector(".status");
  const join = root.querySelector(".join");
  const error = root.querySelector(".error");
  let selected = null;

  input.value = savedName() || `pilot${Math.floor(Math.random() * 900 + 100)}`;

  function render(rooms) {
    list.replaceChildren(
      ...rooms.map((room) => {
        const li = document.createElement("li");
        const full = room.players >= room.maxPlayers;
        li.className = room.id === selected ? "selected" : "";
        li.classList.toggle("full", full);
        li.innerHTML = `<span></span><span>${room.players}/${room.maxPlayers}</span>`;
        li.firstElementChild.textContent = room.name;
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
  lobby.addEventListener("loading", () => (status.textContent = "оновлення…"), { signal });
  lobby.addEventListener(
    "rooms",
    (e) => {
      status.textContent = `оновлено ${new Date().toLocaleTimeString()}`;
      error.hidden = true;
      render(e.detail.rooms);
    },
    { signal },
  );
  lobby.addEventListener(
    "error",
    (e) => {
      status.textContent = "";
      error.hidden = false;
      error.textContent = `Не вдалося оновити список: ${e.detail.message}`;
    },
    { signal },
  );

  const form = root.querySelector(".create-room");
  form.addEventListener(
    "submit",
    async (e) => {
      e.preventDefault();
      const name = form.room.value.trim();
      if (!name) return;
      try {
        const room = await lobby.create(name, form.arena.value);
        selected = room.id;
        join.disabled = false;
        form.room.value = "";
        render(lobby.rooms);
      } catch (err) {
        error.hidden = false;
        error.textContent = `Не вдалося створити кімнату: ${err.message}`;
      }
    },
    { signal },
  );

  join.addEventListener(
    "click",
    () => {
      const name = input.value.trim() || "pilot";
      saveName(name);
      try {
        lobby.join(selected, name);
      } catch (err) {
        error.hidden = false;
        error.textContent = err.message;
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
