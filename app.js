const STORAGE_KEY = "casa-mia-v1";
const API_BASE = "/api/items";

const sections = {
  todo: {
    title: "Da fare",
    placeholder: "Aggiungi un'attivita'...",
    bodyPlaceholder: "Dettagli",
  },
  shopping: {
    title: "Spesa",
    placeholder: "Aggiungi un prodotto...",
    bodyPlaceholder: "Quantita', marca, negozio",
  },
  notes: {
    title: "Note",
    placeholder: "Titolo nota...",
    bodyPlaceholder: "Scrivi una nota rapida",
  },
};

const state = {
  activeSection: localStorage.getItem("casa-mia-section") || "todo",
  theme: localStorage.getItem("casa-mia-theme") || "light",
  editingId: null,
  items: [],
  apiReady: false,
};

const root = document.documentElement;
const todayLabel = document.querySelector("#todayLabel");
const syncLabel = document.querySelector("#syncLabel");
const totalCount = document.querySelector("#totalCount");
const openCount = document.querySelector("#openCount");
const doneCount = document.querySelector("#doneCount");
const tabs = document.querySelectorAll(".tab");
const form = document.querySelector("#itemForm");
const titleInput = document.querySelector("#itemTitle");
const bodyInput = document.querySelector("#itemBody");
const saveButton = document.querySelector("#saveButton");
const cancelEdit = document.querySelector("#cancelEdit");
const sectionTitle = document.querySelector("#sectionTitle");
const itemList = document.querySelector("#itemList");
const emptyState = document.querySelector("#emptyState");
const itemTemplate = document.querySelector("#itemTemplate");
const themeToggle = document.querySelector("#themeToggle");
const clearDone = document.querySelector("#clearDone");

todayLabel.textContent = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(new Date());

applyTheme();
render();
loadItems();

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title) {
    titleInput.focus();
    return;
  }

  setBusy(true);

  try {
    if (state.editingId) {
      const updated = await apiRequest(`${API_BASE}/${encodeURIComponent(state.editingId)}`, {
        method: "PATCH",
        body: { title, body },
      });
      state.items = state.items.map((item) => (item.id === updated.id ? updated : item));
    } else {
      const created = await apiRequest(API_BASE, {
        method: "POST",
        body: {
          section: state.activeSection,
          title,
          body,
        },
      });
      state.items.unshift(created);
    }

    resetForm();
    setStatus("Salvato");
    render();
  } catch (error) {
    setStatus("Errore database");
  } finally {
    setBusy(false);
  }
});

cancelEdit.addEventListener("click", () => {
  resetForm();
  render();
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.activeSection = tab.dataset.section;
    localStorage.setItem("casa-mia-section", state.activeSection);
    resetForm();
    render();
  });
});

itemList.addEventListener("click", async (event) => {
  const card = event.target.closest(".item-card");
  if (!card) return;

  const id = card.dataset.id;

  if (event.target.closest(".check-button")) {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;

    try {
      const updated = await apiRequest(`${API_BASE}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { done: !item.done },
      });
      state.items = state.items.map((entry) => (entry.id === updated.id ? updated : entry));
      setStatus("Salvato");
      render();
    } catch (error) {
      setStatus("Errore database");
    }
  }

  if (event.target.closest(".edit-item")) {
    startEdit(id);
  }

  if (event.target.closest(".delete-item")) {
    try {
      await apiRequest(`${API_BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
      state.items = state.items.filter((item) => item.id !== id);
      if (state.editingId === id) resetForm();
      setStatus("Salvato");
      render();
    } catch (error) {
      setStatus("Errore database");
    }
  }
});

themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("casa-mia-theme", state.theme);
  applyTheme();
});

clearDone.addEventListener("click", async () => {
  try {
    await apiRequest(`${API_BASE}?section=${encodeURIComponent(state.activeSection)}`, {
      method: "DELETE",
    });
    state.items = state.items.filter((item) => {
      return item.section !== state.activeSection || !item.done;
    });
    resetForm();
    setStatus("Salvato");
    render();
  } catch (error) {
    setStatus("Errore database");
  }
});

async function loadItems() {
  setStatus("Carico");

  try {
    state.items = await apiRequest(API_BASE);
    await migrateLocalStorageItems();
    state.apiReady = true;
    setStatus("Database");
  } catch (error) {
    state.apiReady = false;
    setStatus("Server spento");
  }

  render();
}

async function migrateLocalStorageItems() {
  if (state.items.length > 0 || localStorage.getItem("casa-mia-migrated") === "true") {
    return;
  }

  const previous = readPreviousLocalState();
  if (!previous.items.length) return;

  const migratedItems = [];
  for (const item of previous.items) {
    const created = await apiRequest(API_BASE, {
      method: "POST",
      body: {
        section: item.section,
        title: item.title,
        body: item.body || "",
        done: Boolean(item.done),
      },
    });
    migratedItems.push(created);
  }

  state.items = migratedItems;
  localStorage.setItem("casa-mia-migrated", "true");
}

function readPreviousLocalState() {
  try {
    const previous = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      items: Array.isArray(previous?.items) ? previous.items : [],
    };
  } catch {
    return { items: [] };
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Errore API");
  }

  return payload;
}

function render() {
  const section = sections[state.activeSection];
  const items = state.items.filter((item) => item.section === state.activeSection);
  const doneItems = state.items.filter((item) => item.done);

  totalCount.textContent = state.items.length;
  openCount.textContent = state.items.length - doneItems.length;
  doneCount.textContent = doneItems.length;

  sectionTitle.textContent = section.title;
  titleInput.placeholder = section.placeholder;
  bodyInput.placeholder = section.bodyPlaceholder;
  bodyInput.hidden = state.activeSection !== "notes" && !state.editingId;

  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.section === state.activeSection);
  });

  itemList.replaceChildren();

  items.forEach((item) => {
    const node = itemTemplate.content.firstElementChild.cloneNode(true);
    const title = node.querySelector("h3");
    const body = node.querySelector("p");
    const checkButton = node.querySelector(".check-button");

    node.dataset.id = item.id;
    node.classList.toggle("is-done", item.done);
    title.textContent = item.title;
    body.textContent = item.body;
    checkButton.setAttribute("aria-label", item.done ? "Segna come aperto" : "Segna come completato");
    checkButton.title = item.done ? "Riapri" : "Completa";
    itemList.append(node);
  });

  emptyState.textContent = state.apiReady ? "Niente qui." : "Avvia il server Python.";
  emptyState.hidden = items.length > 0;
  clearDone.disabled = !items.some((item) => item.done);
}

function startEdit(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;

  state.editingId = id;
  state.activeSection = item.section;
  titleInput.value = item.title;
  bodyInput.value = item.body;
  bodyInput.hidden = false;
  saveButton.textContent = "Salva";
  cancelEdit.hidden = false;
  titleInput.focus();
  render();
}

function resetForm() {
  state.editingId = null;
  form.reset();
  saveButton.textContent = "Aggiungi";
  cancelEdit.hidden = true;
}

function setBusy(isBusy) {
  saveButton.disabled = isBusy;
  clearDone.disabled = isBusy || !state.items.some((item) => item.section === state.activeSection && item.done);
}

function setStatus(label) {
  syncLabel.textContent = label;
}

function applyTheme() {
  root.dataset.theme = state.theme;
  themeToggle.querySelector("span").textContent = state.theme === "dark" ? "\u2600" : "\u263e";
}
