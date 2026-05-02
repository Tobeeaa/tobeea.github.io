const STORAGE_KEY = "casa-mia-v1";

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

const defaultState = {
  activeSection: "todo",
  theme: "auto",
  editingId: null,
  items: [],
};

let state = loadState();

const root = document.documentElement;
const todayLabel = document.querySelector("#todayLabel");
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

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title) {
    titleInput.focus();
    return;
  }

  if (state.editingId) {
    state.items = state.items.map((item) => {
      if (item.id !== state.editingId) return item;
      return {
        ...item,
        title,
        body,
        updatedAt: new Date().toISOString(),
      };
    });
  } else {
    state.items.unshift({
      id: createId(),
      section: state.activeSection,
      title,
      body,
      done: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  resetForm();
  saveAndRender();
});

cancelEdit.addEventListener("click", () => {
  resetForm();
  render();
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    state.activeSection = tab.dataset.section;
    resetForm();
    saveAndRender();
  });
});

itemList.addEventListener("click", (event) => {
  const card = event.target.closest(".item-card");
  if (!card) return;

  const id = card.dataset.id;

  if (event.target.closest(".check-button")) {
    state.items = state.items.map((item) => {
      if (item.id !== id) return item;
      return {
        ...item,
        done: !item.done,
        updatedAt: new Date().toISOString(),
      };
    });
    saveAndRender();
  }

  if (event.target.closest(".edit-item")) {
    startEdit(id);
  }

  if (event.target.closest(".delete-item")) {
    state.items = state.items.filter((item) => item.id !== id);
    if (state.editingId === id) resetForm();
    saveAndRender();
  }
});

themeToggle.addEventListener("click", () => {
  state.theme = currentTheme() === "dark" ? "light" : "dark";
  applyTheme();
  saveState();
});

clearDone.addEventListener("click", () => {
  const before = state.items.length;
  state.items = state.items.filter((item) => {
    return item.section !== state.activeSection || !item.done;
  });

  if (state.items.length !== before) {
    resetForm();
    saveAndRender();
  }
});

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

function saveAndRender() {
  saveState();
  render();
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      ...defaultState,
      ...stored,
      items: Array.isArray(stored?.items) ? stored.items : [],
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  const savedState = {
    activeSection: state.activeSection,
    theme: state.theme,
    items: state.items,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function applyTheme() {
  const theme = currentTheme();
  root.dataset.theme = theme;
  themeToggle.querySelector("span").textContent = theme === "dark" ? "\u2600" : "\u263e";
}

function currentTheme() {
  if (state.theme === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return state.theme;
}
