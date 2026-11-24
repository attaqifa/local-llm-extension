export const SOURCE_LIMIT = 6000;

function limitText(text, limit = SOURCE_LIMIT) {
  return text.slice(0, limit).replace(/[\uD800-\uDBFF]$/, "").trimEnd();
}

export function createSourceList(onChange, onAdded) {
  const list = document.querySelector("#source-list");
  const sourceToggle = document.querySelector("#show-sources");
  const count = document.querySelector("#source-count");
  const limit = document.querySelector("#source-limit");
  const status = document.querySelector("#source-status");
  const template = document.querySelector("#source-template");

  const dialog = document.querySelector("#add-dialog");
  const form = document.querySelector("#source-form");
  const nameInput = document.querySelector("#source-name");
  const textInput = document.querySelector("#source-text");
  const fileInput = document.querySelector("#source-file");
  const addStatus = document.querySelector("#add-status");
  const addButton = form.querySelector('[type="submit"]');
  const formatter = new Intl.NumberFormat("id-ID");
  const items = [];
  let nextId = 0;
  let draftVersion = 0;

  function publish() {
    const included = [];
    let remaining = SOURCE_LIMIT;
    let combinedTruncated = false;
    for (const item of items) {
      const value = item.text.trim();
      const text = limitText(value, remaining);
      if (value.length > remaining) combinedTruncated = true;
      if (!text) continue;
      included.push({ label: item.label, text });
      remaining -= text.length;
    }
    count.textContent = items.length ? "(" + items.length + ")" : "";
    limit.hidden = !combinedTruncated;
    onChange(included);
  }

  function updateRow(item) {
    item.view.querySelector(".source-label").textContent = item.label;
    item.view.querySelector(".source-size").textContent = formatter.format(item.text.length) + " karakter";
    item.view.querySelector(".source-truncated").hidden = !item.truncated;
    for (const [action, label] of [["up", "Naikkan"], ["down", "Turunkan"], ["copy", "Salin"], ["remove", "Hapus"]]) {
      item.view.querySelector(".source-" + action).setAttribute("aria-label", label + " " + item.label);
    }
  }

  function updateOrderControls() {
    items.forEach((item, index) => {
      item.view.querySelector(".source-up").disabled = index === 0;
      item.view.querySelector(".source-down").disabled = index === items.length - 1;
    });
  }

  function tell(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  function move(item, offset) {
    const index = items.indexOf(item);
    const neighbor = items[index + offset];
    if (!neighbor) return;
    [items[index], items[index + offset]] = [neighbor, item];
    if (offset < 0) neighbor.view.before(item.view);
    else item.view.before(neighbor.view);
    updateOrderControls();
    const button = item.view.querySelector(offset < 0 ? ".source-up" : ".source-down");
    (button.disabled ? item.view.querySelector("summary") : button).focus();
    publish();
  }

  function remove(item) {
    const index = items.indexOf(item);
    if (index < 0) return;
    items.splice(index, 1);
    item.view.remove();
    updateOrderControls();
    publish();
  }

  function insert(kind, label, text, truncated) {
    const view = template.content.firstElementChild.cloneNode(true);
    const editor = view.querySelector(".source-editor");
    const item = { kind, label, text, truncated, view, editor };
    editor.id = "source-editor-" + ++nextId;
    view.querySelector(".source-editor-label").htmlFor = editor.id;
    editor.value = text;
    editor.addEventListener("input", () => {
      const value = limitText(editor.value);
      if (item.text === value) return;
      item.text = value;
      updateRow(item);
      publish();
    });
    view.querySelector(".source-up").addEventListener("click", () => move(item, -1));
    view.querySelector(".source-down").addEventListener("click", () => move(item, 1));
    view.querySelector(".source-remove").addEventListener("click", () => {
      remove(item);
      (list.querySelector("summary") || sourceToggle).focus();
    });
    view.querySelector(".source-copy").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(item.text);
        if (items.includes(item)) tell("Sumber disalin.");
      } catch {
        if (items.includes(item)) tell("Pilih teks di editor lalu salin dengan Ctrl+C.");
      }
    });

    view.open = true;
    if (kind === "page") {
      items.unshift(item);
      list.prepend(view);
    } else {
      items.push(item);
      list.append(view);
    }
    updateRow(item);
    updateOrderControls();
    publish();
    return view;
  }

  function page(label, text = "", truncated = false) {
    const item = items.find((entry) => entry.kind === "page");
    if (!text) {
      if (item) remove(item);
      return;
    }
    if (!item) {
      insert("page", label, text, truncated);
      return;
    }
    if (item.label === label && item.text === text && item.truncated === truncated) return;
    Object.assign(item, { label, text, truncated });
    item.editor.value = text;
    updateRow(item);
    publish();
  }

  function openAdd() {
    ++draftVersion;
    form.reset();
    addButton.textContent = "Tambahkan teks";
    addButton.disabled = false;
    addStatus.hidden = true;
    dialog.showModal();
    textInput.focus();
  }
  document.querySelector("#cancel-source").addEventListener("click", () => dialog.close());
  fileInput.addEventListener("change", () => {
    addButton.textContent = fileInput.files.length ? "Tambahkan file" : "Tambahkan teks";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (addButton.disabled) return;
    addStatus.hidden = true;
    const version = draftVersion;
    const file = fileInput.files[0];
    const label = nameInput.value.trim() || file?.name || "Catatan " + (nextId + 1);
    let value = textInput.value;
    let fileTooLarge = false;
    if (file) {
      if (!/\.(txt|md|markdown)$/i.test(file.name)) {
        addStatus.textContent = "Pilih file dengan ekstensi .txt, .md, atau .markdown.";
        addStatus.hidden = false;
        return;
      }
      const slice = file.slice(0, (SOURCE_LIMIT + 1) * 4);
      fileTooLarge = slice.size < file.size;
      addButton.disabled = true;
      try {
        value = await slice.text();
      } catch {
        if (draftVersion === version && dialog.open) {
          addStatus.textContent = "File tidak dapat dibaca.";
          addStatus.hidden = false;
        }
        return;
      } finally {
        if (draftVersion === version) addButton.disabled = false;
      }
      if (draftVersion !== version || !dialog.open || fileInput.files[0] !== file) return;
    }

    value = value.trim();
    if (!value) {
      addStatus.textContent = "Masukkan teks atau pilih file yang berisi teks.";
      addStatus.hidden = false;
      return;
    }
    const added = insert(file ? "file" : "manual", label.slice(0, 170), limitText(value), fileTooLarge || value.length > SOURCE_LIMIT);
    tell("");
    dialog.close();
    onAdded();
    added.querySelector("summary").focus();
  });

  function reset() {
    ++draftVersion;
    if (dialog.open) dialog.close();
    form.reset();
    items.length = 0;
    list.replaceChildren();
    tell("");
    publish();
  }

  return { page, reset, openAdd };
}
