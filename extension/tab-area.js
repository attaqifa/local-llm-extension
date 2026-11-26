import { cropViewport } from "./page-image.js";

// This function runs in the tab's isolated extension world.
function areaCommand(command, key) {
  const viewport = () => ({
    width: window.innerWidth,
    height: window.innerHeight,
    x: window.scrollX,
    y: window.scrollY,
    scale: window.visualViewport?.scale ?? 1,
    pixelRatio: window.devicePixelRatio,
    url: location.href,
  });
  if (command === "measure") return viewport();
  if (command === "cancel") {
    if (window.bacaHalamanArea?.key === key) window.bacaHalamanArea.cancel();
    return null;
  }

  const initial = viewport();
  if (initial.scale !== 1) return { changed: true };
  window.bacaHalamanArea?.cancel();

  const host = document.createElement("div");
  host.style.setProperty("all", "initial", "important");
  const shadow = host.attachShadow({ mode: "closed" });
  const layer = document.createElement("dialog");
  layer.setAttribute("aria-label", "Pilih area halaman");
  layer.tabIndex = -1;
  layer.style.cssText = "position:fixed;inset:0;margin:0;padding:0;border:0;width:100%;height:100%;" +
    "max-width:none;max-height:none;overflow:hidden;background:transparent;cursor:crosshair;" +
    "touch-action:none;user-select:none;outline:none";
  const marker = document.createElement("div");
  marker.style.cssText = "position:absolute;pointer-events:none;box-sizing:border-box;" +
    "border:2px solid white;outline:1px solid #202124;box-shadow:0 0 0 200vmax #0005";
  marker.hidden = true;
  const hint = document.createElement("p");
  hint.textContent = "Seret untuk memilih area · Esc untuk batal";
  hint.style.cssText = "position:absolute;top:8px;left:50%;transform:translateX(-50%);" +
    "pointer-events:none;margin:0;padding:6px 10px;border-radius:6px;background:#202124;" +
    "color:white;white-space:nowrap;font:13px system-ui";
  layer.append(marker, hint);
  shadow.append(layer);
  document.documentElement.append(host);

  return new Promise((resolve) => {
    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    let anchor = null;
    let timer;
    function finish(result) {
      listeners.abort();
      clearTimeout(timer);
      if (window.bacaHalamanArea?.key === key) delete window.bacaHalamanArea;
      host.remove();
      resolve(result);
    }
    window.bacaHalamanArea = { key, cancel: () => finish(null) };
    timer = setTimeout(() => finish(null), 90000);

    function rect(event) {
      const x = Math.min(initial.width, Math.max(0, event.clientX));
      const y = Math.min(initial.height, Math.max(0, event.clientY));
      return {
        left: Math.min(anchor.x, x),
        top: Math.min(anchor.y, y),
        right: Math.max(anchor.x, x),
        bottom: Math.max(anchor.y, y),
      };
    }

    layer.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      anchor = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      layer.setPointerCapture(event.pointerId);
      hint.hidden = true;
    }, options);
    layer.addEventListener("pointermove", (event) => {
      if (event.pointerId !== anchor?.pointerId) return;
      const { left, top, right, bottom } = rect(event);
      Object.assign(marker.style, {
        left: left + "px", top: top + "px", width: (right - left) + "px", height: (bottom - top) + "px",
      });
      marker.hidden = false;
    }, options);
    layer.addEventListener("pointerup", (event) => {
      if (event.pointerId !== anchor?.pointerId) return;
      const bounds = rect(event);
      if (bounds.right - bounds.left < 8 || bounds.bottom - bounds.top < 8) {
        anchor = null;
        marker.hidden = true;
        hint.hidden = false;
        return;
      }
      finish({ initial, bounds });
    }, options);
    layer.addEventListener("pointercancel", () => finish(null), options);
    layer.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(null);
    }, options);
    layer.addEventListener("wheel", (event) => event.preventDefault(), { ...options, passive: false });
    window.addEventListener("resize", () => finish({ changed: true }), options);
    window.addEventListener("scroll", () => finish({ changed: true }), { ...options, capture: true });
    window.addEventListener("pagehide", () => finish(null), options);
    try {
      layer.showModal();
    } catch {
      finish(null);
    }
  });
}

export async function captureTabArea(tab, signal, onSelection) {
  const target = { tabId: tab.tabId, documentIds: [tab.documentId] };
  const key = crypto.randomUUID();
  async function run(command) {
    const [frame] = await chrome.scripting.executeScript({ target, func: areaCommand, args: [command, key] });
    return frame?.documentId === tab.documentId ? frame.result : null;
  }
  async function assertActive() {
    signal.throwIfAborted();
    const current = await chrome.tabs.get(tab.tabId);
    signal.throwIfAborted();
    if (!current.active || current.windowId !== tab.windowId) {
      throw new Error("Buka kembali panel dari tab yang ingin dipindai.");
    }
  }

  const cleanup = () => void run("cancel").catch(() => {});
  await assertActive();
  // The source viewport can still be resizing just after the side panel opens.
  const changed = "Tampilan tab berubah. Klik Pilih area untuk mencoba lagi.";
  let layout = await run("measure");
  let stable = 0;
  for (let attempt = 0; attempt < 7; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await assertActive();
    const measured = await run("measure");
    stable = measured && JSON.stringify(measured) === JSON.stringify(layout) ? stable + 1 : 0;
    if (stable === 2) break;
    layout = measured;
  }
  if (stable < 2) throw new Error(changed);
  signal.throwIfAborted();
  signal.addEventListener("abort", cleanup, { once: true });
  let selection;
  try {
    selection = await run("select");
  } finally {
    signal.removeEventListener("abort", cleanup);
  }
  signal.throwIfAborted();
  if (!selection) return null;

  if (selection.changed) throw new Error(changed);
  onSelection();
  // Give the browser a paint after the dialog closes before capturing the page.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const before = await run("measure");
  if (JSON.stringify(before) !== JSON.stringify(selection.initial)) throw new Error(changed);
  await assertActive();
  const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  await assertActive();
  const after = await run("measure");
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(changed);
  signal.throwIfAborted();
  const image = await cropViewport(screenshot, before, selection.bounds);
  signal.throwIfAborted();
  return image;
}
