export const launchKey = (windowId) => `launch:${windowId}`;
export const consumedKey = (windowId) => `consumed:${windowId}`;

export async function readableDocument(tabId) {
  try {
    const [frame] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      injectImmediately: true,
      func: () => document.contentType !== "application/pdf",
    });
    return frame?.result === true ? frame.documentId : null;
  } catch {
    return null;
  }
}
