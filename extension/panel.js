import { extractText } from "./extract-text.js";
import { consumedKey, launchKey } from "./session.js";
import { createChat } from "./chat.js";
import { createSourceList, SOURCE_LIMIT } from "./source-list.js";

const mode = document.querySelector("#mode");
const rescan = document.querySelector("#rescan");
const tabTitle = document.querySelector("#tab-title");
const status = document.querySelector("#status");
const chat = createChat();
const sources = createSourceList(chat.setSources);

const messages = {
  idle: "Klik ikon Baca Halaman atau tekan Alt+Shift+G di tab yang ingin dibaca.",
  reading: "Membaca halaman…",
  ready: "Teks siap.",
  empty: "Tidak ada teks yang dapat dibaca dalam mode ini.",
  selection: "Blok teks di halaman, lalu klik Pindai ulang.",
  interrupted: "Pemindaian terhenti. Klik Pindai ulang untuk melanjutkan.",
  blocked: "Halaman ini tidak bisa dibaca. Gunakan Tambah untuk memasukkan teks sendiri.",
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
  rescan.disabled = !canRead || source.status === "reading";

  tabTitle.textContent = source ? source.title + (source.away ? " · Tab sebelumnya" : "") : "";
  tabTitle.hidden = !source;

  let message = messages[source?.status ?? "idle"];
  if (source?.away) {
    message += " Sumber dari tab sebelumnya. Klik ikon atau tekan Alt+Shift+G di tab baru untuk mengganti sumber.";
  }
  if (status.textContent !== message) status.textContent = message;
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
  }
  source = {
    ...launch,
    title: sameDocument ? source.title : "Tab aktif",
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
rescan.addEventListener("click", () => void scan());

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
