export function createPrivateChat(submit, stop) {
  const input = document.querySelector("#private-input");
  const write = document.querySelector("#private-write");
  const draftButton = document.querySelector("#private-show-draft");
  const answerButton = document.querySelector("#private-show-answer");
  const stopButton = document.querySelector("#private-stop");
  const preview = document.querySelector("#private-preview");
  const status = document.querySelector("#private-status");
  let answer = "";
  let notice = "";
  let hold = null;

  function conceal() {
    const previous = hold;
    hold = null;
    preview.hidden = true;
    preview.textContent = "";
    if (previous?.pointerId != null && previous.button.hasPointerCapture(previous.pointerId)) {
      previous.button.releasePointerCapture(previous.pointerId);
    }
  }

  function reveal(button, pointerId, key) {
    if (hold || document.hidden || !document.hasFocus() || !button.checkVisibility()) return;
    const content = button === draftButton ? input.value : answer;
    if (!content) return;
    hold = { button, pointerId, key };
    preview.textContent = content;
    preview.hidden = false;
    if (pointerId != null) button.setPointerCapture(pointerId);
  }

  for (const button of [draftButton, answerButton]) {
    button.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      button.focus();
      reveal(button, event.pointerId, null);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (!event.repeat) reveal(button, null, event.key);
    });
    button.addEventListener("blur", conceal);
    button.addEventListener("contextmenu", (event) => { event.preventDefault(); conceal(); });
    button.addEventListener("lostpointercapture", (event) => {
      if (hold?.pointerId === event.pointerId) conceal();
    });
  }

  function release() {
    const resumeDraft = hold?.button === draftButton;
    conceal();
    if (resumeDraft && document.hasFocus() && !document.hidden) input.focus();
  }

  window.addEventListener("pointerup", (event) => {
    if (hold?.pointerId === event.pointerId) release();
  }, true);
  window.addEventListener("keyup", (event) => {
    if (hold?.key === event.key) release();
  }, true);
  window.addEventListener("pointercancel", conceal);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && hold) conceal();
  });
  window.addEventListener("blur", conceal);
  window.addEventListener("pagehide", conceal);
  document.addEventListener("visibilitychange", conceal);

  write.addEventListener("click", () => {
    draftButton.hidden = false;
    input.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      input.value = "";
      draftButton.hidden = true;
      write.focus();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat && input.value.trim()) void submit();
    }
  });
  stopButton.addEventListener("click", stop);

  function reset(latest = "") {
    conceal();
    input.value = "";
    answer = latest;
    notice = "";
    draftButton.hidden = true;
  }

  function update(busy, checking, ready) {
    const restoreFocus = !busy && document.activeElement === stopButton;
    write.disabled = busy;
    stopButton.hidden = !busy;
    answerButton.hidden = busy || !answer;
    if (busy) status.textContent = "Memproses…";
    else if (checking) status.textContent = "Memeriksa Ollama…";
    else if (!ready) status.textContent = "Periksa Ollama di Pengaturan.";
    else status.textContent = notice;
    if (restoreFocus) (answer ? answerButton : write).focus();
  }

  return {
    input, reset, update, conceal,
    get enabled() { return document.body.hasAttribute("data-private"); },
    finish(text, message) {
      conceal();
      answer = text;
      notice = message;
      draftButton.hidden = !input.value;
    },
  };
}
