import { consumedKey, launchKey, readableDocument } from "./session.js";

const pending = new Map();

// The reserved _execute_action command and the toolbar use the same gesture.
chrome.action.onClicked.addListener((tab) => {
  const { id: tabId, windowId } = tab;
  if (!Number.isInteger(tabId) || windowId < 0) return;

  const opened = chrome.sidePanel.open({ windowId });
  const requestId = crypto.randomUUID();
  pending.set(windowId, requestId);

  // Bind the gesture to a document before the panel starts its own scan.
  const document = readableDocument(tabId);

  void Promise.all([opened, document]).then(async ([, documentId]) => {
    if (pending.get(windowId) !== requestId) return;
    await chrome.storage.session.set({
      [launchKey(windowId)]: { windowId, tabId, documentId, requestId },
    });
  }).catch((error) => {
    console.warn("Panel could not open:", error);
  }).finally(() => {
    if (pending.get(windowId) === requestId) pending.delete(windowId);
  });
});

chrome.windows.onRemoved.addListener((windowId) => {
  pending.delete(windowId);
  // Session storage may already be unavailable when the browser is shutting down.
  void chrome.storage.session.remove([launchKey(windowId), consumedKey(windowId)]).catch(() => {});
});
