import { extractText } from "./extract-text.js";
import { consumedKey, launchKey } from "./session.js";
import { createChat } from "./chat.js";
import { createSourceList, SOURCE_LIMIT } from "./source-list.js";

const mode = document.querySelector("#mode");
const tabTitle = document.querySelector("#tab-title");
const tabDomain = document.querySelector("#tab-domain");
const status = document.querySelector("#status");
const workspace = document.querySelector("#workspace");
const views = workspace.querySelectorAll("[data-workspace-view]");
const sourceToggle = document.querySelector("#show-sources");
const menu = document.querySelector("#panel-menu");
const menuSummary = menu.querySelector("summary");
const settingsHeading = document.querySelector("#settings-heading");
const rescanButtons = document.querySelectorAll("[data-rescan]");

function showView(name) {
  for (const view of views) {
    view.hidden = view.dataset.workspaceView !== name;
  }
  sourceToggle.setAttribute("aria-expanded", String(name === "sources"));
  workspace.scrollTop = 0;
}

const chat = createChat(() => showView("conversation"));
const sources = createSourceList(chat.setSources, () => showView("sources"));

const messages = {
  idle: "Klik ikon Baca Halaman atau tekan Alt+Shift+G di tab yang ingin dibaca.",
  reading: "Membaca halaman…",
  ready: "Teks siap.",
  empty: "Tidak ada teks yang dapat dibaca dalam mode ini.",
  selection: "Blok teks di halaman, lalu klik Pindai ulang.",
  interrupted: "Pemindaian terhenti. Klik Pindai ulang untuk melanjutkan.",
  blocked: "Halaman ini tidak bisa dibaca. Gunakan Tambah sumber untuk memasukkan teks sendiri.",
  lost: "Akses ke halaman berakhir. Buka kembali lewat ikon atau Alt+Shift+G di tab sumber.",
  navigated: "Dokumen tab sumber berubah. Buka kembali lewat ikon atau Alt+Shift+G.",
  removed: "Tab sumber sudah ditutup atau dipindahkan. Buka ekstensi di tab yang ingin dibaca.",
};

let windowId;
let source = null;
let scanId = 0;

function render() {
  const canRead = Boolean(source?.documentId);
  mode.disabled = !canRead;
  for (const button of rescanButtons) button.disabled = !canRead || source.status === "reading";

  tabTitle.textContent = source?.title ?? "Halaman aktif";
  tabDomain.textContent = source?.hostname ?? "";
  tabDomain.hidden = !source?.hostname;

  let message = messages[source?.status ?? "idle"];
  if (source?.away) {
    message += " Sumber dari tab sebelumnya. Klik ikon atau tekan Alt+Shift+G di tab baru untuk mengganti sumber.";
  }
  if (status.textContent !== message) status.textContent = message;
  status.classList.toggle("screen-reader", source?.status === "ready" && !source.away);
}

function invalidate(reason) {
  ++scanId;
  source.documentId = null;
  source.result = null;
  source.status = reason;
  if (reason === "navigated" || reason === "removed") chat.reset();
  sources.page("");
  render();
}

async function scan(automatic = false) {
  const current = source;
  const readId = ++scanId;
  const selectedMode = mode.value;
  current.status = "reading";
  if (current.result?.mode !== selectedMode) current.result = null;
  render();

  try {
    const tab = await chrome.tabs.get(current.tabId);
    if (readId !== scanId) return;
    if (tab.windowId !== windowId) {
      invalidate("removed");
      return;
    }
    current.away = !tab.active;
    current.title = tab.title || "Tab sumber";
    current.hostname = tab.url && /^https?:\/\//.test(tab.url) ? new URL(tab.url).hostname : "";
    if (!current.documentId) {
      invalidate("blocked");
      return;
    }
    if (automatic && current.away) {
      current.status = "interrupted";
      render();
      return;
    }
    render();

    const [frame] = await chrome.scripting.executeScript({
      target: { tabId: current.tabId, documentIds: [current.documentId] },
      func: extractText,
      args: [selectedMode, SOURCE_LIMIT],
    });
    if (readId !== scanId) return;
    if (frame?.documentId !== current.documentId || !frame.result) {
      invalidate("lost");
      return;
    }

    current.result = { ...frame.result, mode: selectedMode };
    current.status = frame.result.text ? "ready" : selectedMode === "selection" ? "selection" : "empty";
    const label = mode.selectedOptions[0].textContent + " — " + current.title.slice(0, 130);
    sources.page(label, frame.result.text, frame.result.truncated);
    render();
  } catch {
    if (readId === scanId) invalidate(current.documentId ? "lost" : "blocked");
  }
}

function beginLaunch(launch) {
  if (!launch || launch.windowId !== windowId || launch.requestId === source?.requestId) return;
  const sameDocument = launch.documentId && launch.documentId === source?.documentId && launch.tabId === source.tabId;
  if (source && !sameDocument) {
    chat.reset();
    sources.reset();
    showView("conversation");
  }
  source = {
    ...launch,
    title: sameDocument ? source.title : "Tab aktif",
    hostname: sameDocument ? source.hostname : "",
    away: false,
    status: "reading",
    result: sameDocument ? source.result : null,
  };
  void chrome.storage.session.set({ [consumedKey(windowId)]: launch.requestId }).catch(console.warn);
  void scan(true);
}

chrome.tabs.onActivated.addListener(({ tabId, windowId: activatedWindow }) => {
  if (!source || activatedWindow !== windowId) return;
  source.away = tabId !== source.tabId;
  if (source.away && source.status === "reading" && source.documentId) {
    ++scanId;
    source.status = source.result ? "ready" : "interrupted";
  }
  render();
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (tabId !== source?.tabId || !source.documentId) return;
  if (change.status === "loading") {
    invalidate("navigated");
  } else if (change.title) {
    source.title = change.title;
    render();
  }
});

function removeSource(tabId) {
  if (tabId === source?.tabId) invalidate("removed");
}

chrome.tabs.onRemoved.addListener(removeSource);
chrome.tabs.onDetached.addListener(removeSource);
chrome.tabs.onReplaced.addListener((_added, removed) => removeSource(removed));
mode.addEventListener("change", () => void scan());

sourceToggle.addEventListener("click", () => {
  showView(sourceToggle.getAttribute("aria-expanded") === "true" ? "conversation" : "sources");
});
for (const button of rescanButtons) {
  button.addEventListener("click", () => {
    if (menu.contains(button)) {
      menu.open = false;
      showView("sources");
      mode.focus();
    }
    void scan();
  });
}
for (const button of document.querySelectorAll("[data-add-source]")) {
  button.addEventListener("click", () => {
    if (menu.contains(button)) {
      menu.open = false;
      menuSummary.focus();
    }
    sources.openAdd();
  });
}
for (const button of document.querySelectorAll("[data-open-settings]")) {
  button.addEventListener("click", () => {
    menu.open = false;
    showView("settings");
    settingsHeading.focus();
  });
}
document.querySelector("#close-settings").addEventListener("click", () => {
  showView("conversation");
  menuSummary.focus();
});
document.addEventListener("click", (event) => {
  if (menu.open && !menu.contains(event.target)) menu.open = false;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu.open) {
    menu.open = false;
    menuSummary.focus();
  }
});

async function initialize() {
  ({ id: windowId } = await chrome.windows.getCurrent());
  const key = launchKey(windowId);
  const consumed = consumedKey(windowId);
  let liveLaunchReceived = false;
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "session" && changes[key]?.newValue) {
      liveLaunchReceived = true;
      beginLaunch(changes[key].newValue);
    }
  });
  const state = await chrome.storage.session.get([key, consumed]);
  if (!liveLaunchReceived && state[key]?.requestId !== state[consumed]) beginLaunch(state[key]);
}

void initialize().catch(console.warn);
