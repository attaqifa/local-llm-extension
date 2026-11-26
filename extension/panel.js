import { extractText } from "./extract-text.js";
import { consumedKey, launchKey, readableDocument } from "./session.js";
import { createChat } from "./chat.js";
import { createSourceList, SOURCE_LIMIT } from "./source-list.js";
import { capturePageImage } from "./page-image.js";
import { encodeLocalImage } from "./image-data.js";
import { captureTabArea } from "./tab-area.js";

const mode = document.querySelector("#mode");
const tabTitle = document.querySelector("#tab-title");
const tabDomain = document.querySelector("#tab-domain");
const status = document.querySelector("#status");
const imageStatus = document.querySelector("#image-status");
const workspace = document.querySelector("#workspace");
const views = workspace.querySelectorAll("[data-workspace-view]");
const sourceToggle = document.querySelector("#show-sources");
const chatToggle = document.querySelector("#show-chat");
const settingsButton = document.querySelector("#open-settings");
const composer = document.querySelector("#composer");
const context = document.querySelector("#context");
const rescanButtons = document.querySelectorAll("[data-rescan]");
const areaButtons = document.querySelectorAll("[data-pick-area]");
const cancelArea = document.querySelector("#cancel-area");
const privacyToggle = document.querySelector("#private-mode");
const privacyStatus = document.querySelector("#privacy-status");

let currentView = "conversation";
let previousView = "conversation";
let settingsOpener = settingsButton;
let chatScroll = 0;

function showView(name) {
  chat.conceal();
  if (name === "sources" && privacyToggle.checked) name = "conversation";
  if (currentView === name) return;
  if (currentView === "conversation") chatScroll = workspace.scrollTop;
  if (name === "settings") previousView = currentView;
  currentView = name;
  for (const view of views) {
    view.hidden = view.dataset.workspaceView !== name;
  }
  for (const [button, view] of [[chatToggle, "conversation"], [sourceToggle, "sources"], [settingsButton, "settings"]]) {
    if (view === name) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  context.hidden = name === "settings";
  composer.hidden = name !== "conversation";
  workspace.scrollTop = name === "conversation" ? chatScroll : 0;
}

const chat = createChat(() => {
  if (source) source.skipImage = true;
  cancelImage();
  showView("conversation");
}, cancelImage);
const sources = createSourceList(chat.setSources, () => showView("sources"), readLocalImage);

function setPrivacy(enabled) {
  const changed = enabled !== document.body.hasAttribute("data-private");
  privacyToggle.checked = enabled;
  document.body.toggleAttribute("data-private", enabled);
  if (changed) {
    cancelImage();
    if (enabled) {
      if (document.querySelector("#add-dialog").open) document.querySelector("#cancel-source").click();
      if (currentView === "sources") showView("conversation");
    }
    chat.setPrivate(enabled);
  }
}

privacyToggle.addEventListener("change", async () => {
  const enabled = privacyToggle.checked;
  setPrivacy(enabled);
  privacyToggle.disabled = true;
  privacyStatus.hidden = true;
  if (enabled) {
    showView("conversation");
    document.querySelector("#private-write").focus();
  }
  try {
    await chrome.storage.local.set({ privateMode: enabled });
  } catch {
    showView("settings");
    privacyStatus.textContent = "Pilihan berlaku di panel ini saja. Gagal menyimpan pengaturan.";
    privacyStatus.hidden = false;
  } finally {
    privacyToggle.disabled = false;
  }
});

let privacyEnabledElsewhere = false;
chrome.storage.onChanged.addListener((changes, area) => {
  // Another window may cover this panel, but must never uncover its contents.
  if (area === "local" && changes.privateMode?.newValue === true) {
    privacyEnabledElsewhere = true;
    setPrivacy(true);
  }
});
chrome.storage.local.get("privateMode").then(({ privateMode }) => {
  setPrivacy(privacyEnabledElsewhere || privateMode === true);
}).catch(() => setPrivacy(true)).finally(() => { document.body.hidden = false; });

const messages = {
  idle: "Buka Baca Halaman dari tab yang ingin dibaca.",
  reading: "Membaca halaman…",
  ready: "Teks siap.",
  empty: "Tidak ada teks yang dapat dibaca dalam mode ini.",
  selection: "Blok teks di halaman, lalu klik Pindai ulang.",
  interrupted: "Pemindaian terhenti. Klik Pindai ulang untuk melanjutkan.",
  blocked: "Halaman ini tidak bisa dibaca. Gunakan Tambah sumber untuk memasukkan teks sendiri.",
  lost: "Akses ke halaman berakhir. Buka kembali lewat ikon atau Alt+Shift+G di tab sumber.",
  loading: "Menunggu halaman baru…",
  navigated: "Klik ikon Baca Halaman atau tekan Alt+Shift+G untuk memberi akses ke halaman baru.",
  removed: "Tab sumber sudah ditutup atau dipindahkan. Buka ekstensi di tab yang ingin dibaca.",
};

let windowId;
let source = null;
let scanId = 0;
let followId = 0;
let imageScan = null;
let areaScan = null;

function showImageStatus(message = "") {
  imageStatus.textContent = message;
  imageStatus.hidden = !message;
}

function cancelImage() {
  imageScan?.abort();
  imageScan = null;
  if (areaScan) {
    areaScan = null;
    updateAreaControls();
  }
  showImageStatus();
}

function updateAreaControls() {
  const available = Boolean(source?.documentId && source.hostname && !source.away);
  for (const button of areaButtons) button.disabled = !available || Boolean(areaScan);
  cancelArea.hidden = !areaScan;
}

async function prepareManualImage(signal) {
  if (!await chat.prepareImage(signal)) {
    throw new Error("Tunggu jawaban selesai atau hentikan permintaannya sebelum membaca gambar.");
  }
}

async function readImageContent(image, signal) {
  const text = await chat.transcribe(image, signal);
  signal.throwIfAborted();
  if (!text) throw new Error("Model tidak mengirim hasil pembacaan gambar.");
  return text;
}

async function readLocalImage(file, job) {
  cancelImage();
  imageScan = job;
  try {
    await prepareManualImage(job.signal);
    const image = await encodeLocalImage(file, job.signal);
    return await readImageContent(image, job.signal);
  } finally {
    if (imageScan === job) imageScan = null;
  }
}

async function pickArea() {
  if (!source?.documentId || !source.hostname || source.away || areaScan) return;
  const current = { ...source };
  cancelImage();
  const job = new AbortController();
  imageScan = areaScan = job;
  updateAreaControls();
  showImageStatus("Seret untuk memilih area di tab sumber. Tekan Esc untuk batal.");
  try {
    await prepareManualImage(job.signal);
    const image = await captureTabArea(current, job.signal, () => showImageStatus("Membaca area…"));
    if (!image) {
      showImageStatus("Pemilihan area dibatalkan.");
      return;
    }
    const text = await readImageContent(image, job.signal);
    const view = sources.addManualImage("Area · " + current.title, text);
    showView("sources");
    showImageStatus("");
    if (document.hasFocus()) view.querySelector("summary").focus();
  } catch (error) {
    if (!job.signal.aborted) showImageStatus(error.message || "Area tidak bisa dibaca.");
  } finally {
    if (imageScan === job) imageScan = null;
    if (areaScan === job) {
      const restoreFocus = document.activeElement === cancelArea;
      areaScan = null;
      updateAreaControls();
      if (restoreFocus) sourceToggle.focus();
    }
  }
}

async function scanImage(current) {
  if (source !== current || current.away || current.imageReady || current.skipImage || !current.hostname || imageScan) return;
  const job = new AbortController();
  imageScan = job;
  try {
    const result = await capturePageImage(current, job.signal, async () => {
      showImageStatus("Memindai gambar…");
      return chat.prepareImage(job.signal);
    });
    if (!result) {
      if (!job.signal.aborted) showImageStatus();
      return;
    }
    const text = await chat.transcribe(result.image, job.signal);
    job.signal.throwIfAborted();
    if (!text) {
      showImageStatus("Model tidak mengirim hasil pembacaan gambar.");
      return;
    }
    sources.addImage(result.label, text);
    current.imageReady = true;
    showImageStatus();
  } catch (error) {
    if (!job.signal.aborted) showImageStatus(error.message || "Gambar tidak bisa dibaca.");
  } finally {
    if (imageScan === job) imageScan = null;
  }
}

function render() {
  const canRead = Boolean(source?.documentId);
  mode.disabled = !canRead;
  for (const button of rescanButtons) button.disabled = !canRead || source.status === "reading";
  updateAreaControls();

  tabTitle.textContent = source?.title ?? "Halaman aktif";
  tabTitle.title = tabTitle.textContent;
  document.querySelector("#page-context").hidden = !source;
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
  cancelImage();
  source.documentId = null;
  source.result = null;
  source.status = reason;
  if (reason === "loading" || reason === "removed") chat.reset();
  sources.page("");
  sources.clearImage();
  render();
}

async function scan(automatic = false, withImage = automatic) {
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
    if (withImage) void scanImage(current);
  } catch {
    if (readId === scanId) invalidate(current.documentId ? "lost" : "blocked");
  }
}

function beginLaunch(launch) {
  if (!launch || launch.windowId !== windowId || launch.requestId === source?.requestId) return;
  const sameDocument = launch.documentId && launch.documentId === source?.documentId && launch.tabId === source.tabId;
  chat.conceal();
  cancelImage();
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
    imageReady: sameDocument && source.imageReady,
  };
  void chrome.storage.session.set({ [consumedKey(windowId)]: launch.requestId }).catch(console.warn);
  void scan(true);
}

chrome.tabs.onActivated.addListener(({ tabId, windowId: activatedWindow }) => {
  chat.conceal();
  if (!source || activatedWindow !== windowId) return;
  source.away = tabId !== source.tabId;
  if (source.away) cancelImage();
  if (source.away && source.status === "reading" && source.documentId) {
    ++scanId;
    source.status = source.result ? "ready" : "interrupted";
  }
  render();
});

chrome.windows.onFocusChanged.addListener(chat.conceal);

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (tabId !== source?.tabId || !source.documentId) return;
  if (change.status === "loading") {
    chat.conceal();
    invalidate("navigated");
  } else if (change.title) {
    source.title = change.title;
    render();
  }
});

function removeSource(tabId) {
  if (tabId === source?.tabId) {
    chat.conceal();
    invalidate("removed");
  }
}

chrome.tabs.onRemoved.addListener(removeSource);
chrome.tabs.onDetached.addListener(removeSource);
chrome.tabs.onReplaced.addListener((_added, removed) => removeSource(removed));
mode.addEventListener("change", () => void scan());

sourceToggle.addEventListener("click", () => showView("sources"));
chatToggle.addEventListener("click", () => showView("conversation"));
for (const button of rescanButtons) {
  button.addEventListener("click", () => {
    source.skipImage = false;
    void scan(false, true);
  });
}
for (const button of document.querySelectorAll("[data-add-source]")) {
  button.addEventListener("click", sources.openAdd);
}
for (const button of areaButtons) {
  button.addEventListener("click", () => {
    void pickArea();
  });
}
cancelArea.addEventListener("click", () => {
  cancelImage();
  showImageStatus("Pemilihan area dibatalkan.");
  sourceToggle.focus();
});
for (const button of document.querySelectorAll("[data-open-settings]")) {
  button.addEventListener("click", () => {
    settingsOpener = button;
    showView("settings");
    settingsButton.focus();
  });
}
function closeSettings() {
  showView(previousView);
  (settingsOpener.checkVisibility() ? settingsOpener : settingsButton).focus();
}
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
  if (currentView === "settings") closeSettings();
  else if (areaScan) {
    event.preventDefault();
    cancelArea.click();
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
window.addEventListener("pagehide", cancelImage);
