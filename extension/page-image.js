import { encodeCrop } from "./image-data.js";

// executeScript serializes this function with no access to its module scope.
export function findVisibleImage() {
  const root = document.querySelector("main") || document.querySelector('[role="main"]') ||
    document.querySelector("article") || document.body;
  if (!root || (window.visualViewport && window.visualViewport.scale !== 1)) return null;
  const width = window.innerWidth;
  const height = window.innerHeight;
  let candidate = null;
  for (const [index, element] of [...root.querySelectorAll("img, canvas, svg")].entries()) {
    if (element.closest('nav, footer, [role="navigation"], [hidden], [aria-hidden="true"], svg svg')) continue;
    if (element instanceof HTMLImageElement && (!element.complete || !element.naturalWidth)) continue;
    const label = (element.getAttribute("alt") || element.getAttribute("aria-label") ||
      element.querySelector("title")?.textContent || "").trim();
    const names = [label, element.id, element.getAttribute("class")].join(" ");
    if (/(^|[^a-z])(logo|icon|avatar|emoji|sprite)([^a-z]|$)/i.test(names)) continue;

    const { left, top, right, bottom } = element.getBoundingClientRect();
    const area = (right - left) * (bottom - top);
    if (right - left < 80 || bottom - top < 60 || area < 9600 ||
        left < 0 || top < 0 || right > document.documentElement.clientWidth ||
        bottom > document.documentElement.clientHeight) continue;
    if (getComputedStyle(element).visibility !== "visible") continue;

    let visible = true;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (style.opacity === "0" || style.contentVisibility === "hidden") {
        visible = false;
        break;
      }
      if (parent === element || parent === document.body || parent === document.documentElement) continue;
      const bounds = parent.getBoundingClientRect();
      const clipLeft = bounds.left + parent.clientLeft;
      const clipTop = bounds.top + parent.clientTop;
      if ((style.overflowX !== "visible" && (left < clipLeft || right > clipLeft + parent.clientWidth)) ||
          (style.overflowY !== "visible" && (top < clipTop || bottom > clipTop + parent.clientHeight))) {
        visible = false;
        break;
      }
    }
    if (!visible) continue;
    const points = [[left + 2, top + 2], [right - 2, top + 2], [left + 2, bottom - 2],
      [right - 2, bottom - 2], [(left + right) / 2, (top + bottom) / 2]];
    if (!points.every(([x, y]) => element.contains(document.elementFromPoint(x, y)))) continue;
    const score = area * (element.closest("figure") ? 1.5 : 1);
    if (!candidate || score > candidate.score) {
      const imageKey = element instanceof HTMLImageElement ? element.currentSrc.slice(-256) : "";
      candidate = { index, imageKey, label: label.slice(0, 130), score, left, top, right, bottom };
    }
  }
  return candidate && { candidate, width, height, x: window.scrollX, y: window.scrollY };
}

async function snapshot(tab, signal) {
  signal.throwIfAborted();
  const active = await chrome.tabs.get(tab.tabId);
  signal.throwIfAborted();
  if (!active.active || active.windowId !== tab.windowId) return null;
  const [frame] = await chrome.scripting.executeScript({
    target: { tabId: tab.tabId, documentIds: [tab.documentId] },
    func: findVisibleImage,
  });
  signal.throwIfAborted();
  return frame?.documentId === tab.documentId ? frame.result : null;
}

export async function cropViewport(dataUrl, layout, bounds) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const { left, top, right, bottom } = bounds;
  const scaleX = image.naturalWidth / layout.width;
  const scaleY = image.naturalHeight / layout.height;
  if (!scaleX || !scaleY || Math.abs(scaleX / scaleY - 1) > 0.03) {
    throw new Error("Ukuran tangkapan berubah. Coba ambil gambar lagi.");
  }
  const width = (right - left) * scaleX;
  const height = (bottom - top) * scaleY;
  return encodeCrop(image, left * scaleX, top * scaleY, width, height);
}

export async function capturePageImage(tab, signal, onCandidate) {
  let before = await snapshot(tab, signal);
  if (!before) return null;
  if (!await onCandidate()) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    // Allow the side panel layout to settle, and keep retries under the capture rate limit.
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 120 : 550));
    const ready = await snapshot(tab, signal);
    if (!ready) return null;
    if (JSON.stringify(before) === JSON.stringify(ready) || attempt === 1) {
      signal.throwIfAborted();
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      const after = await snapshot(tab, signal);
      if (JSON.stringify(ready) === JSON.stringify(after)) {
        const image = await cropViewport(dataUrl, ready, ready.candidate);
        signal.throwIfAborted();
        return { image, label: ready.candidate.label };
      }
      before = after;
    } else {
      before = ready;
    }
  }
  throw new Error("Tampilan halaman berubah. Klik Pindai ulang untuk mencoba lagi.");
}
