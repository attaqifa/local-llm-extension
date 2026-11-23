// executeScript serializes this function, so it cannot use imports or outer variables.
export function extractText(mode, limit) {
  const body = document.body;
  if (!body) return { text: "", truncated: false };

  const selection = window.getSelection();
  let range = null;
  if (mode === "selection") {
    if (!selection?.rangeCount || selection.isCollapsed) return { text: "", truncated: false };
    range = selection.getRangeAt(0);
  }
  const viewport = mode === "viewport" ? {
    left: 0,
    top: 0,
    right: document.documentElement.clientWidth,
    bottom: document.documentElement.clientHeight,
  } : null;

  const excluded = [
    "nav", "footer", "[role=navigation]", "[role=contentinfo]",
    "[hidden]", '[aria-hidden="true"]', "script", "style", "template", "noscript",
    "input", "textarea", "select", "datalist", "iframe", "embed", "object", "canvas", "svg",
  ].join(",");

  function skip(element, style) {
    return element.matches(excluded) || element.isContentEditable ||
      style.display === "none" || style.opacity === "0" || style.contentVisibility === "hidden";
  }

  function overlaps(rect, clip) {
    return rect.width > 0 && rect.height > 0 && (!clip ||
      (rect.right > clip.left && rect.left < clip.right &&
        rect.bottom > clip.top && rect.top < clip.bottom));
  }

  function clipToContainer(clip, element, style) {
    if (!clip || element === body || style.display === "contents") return clip;
    const clipX = style.overflowX !== "visible";
    const clipY = style.overflowY !== "visible";
    if (!clipX && !clipY) return clip;
    const bounds = element.getBoundingClientRect();
    const left = bounds.left + element.clientLeft;
    const top = bounds.top + element.clientTop;
    return {
      left: clipX ? Math.max(clip.left, left) : clip.left,
      top: clipY ? Math.max(clip.top, top) : clip.top,
      right: clipX ? Math.min(clip.right, left + element.clientWidth) : clip.right,
      bottom: clipY ? Math.min(clip.bottom, top + element.clientHeight) : clip.bottom,
    };
  }

  function renderedText(node, clip) {
    let start = 0;
    let end = node.length;
    if (range?.startContainer === node) start = range.startOffset;
    if (range?.endContainer === node) end = range.endOffset;
    if (start === end) return "";

    const fragment = document.createRange();
    fragment.setStart(node, start);
    fragment.setEnd(node, end);
    const rects = Array.from(fragment.getClientRects());
    if (!rects.some((rect) => overlaps(rect, clip))) return "";

    const value = node.data.slice(start, end);
    if (!clip || rects.every((rect) =>
      rect.left >= clip.left && rect.right <= clip.right &&
      rect.top >= clip.top && rect.bottom <= clip.bottom)) return value;

    // A text node can wrap across several lines, only some of which are in view.
    let visible = "";
    let previousEnd = 0;
    for (const part of value.matchAll(/\S+\s*|\s+/g)) {
      const partEnd = part.index + part[0].length;
      fragment.setStart(node, start + part.index);
      fragment.setEnd(node, start + partEnd);
      if (!Array.from(fragment.getClientRects()).some((rect) => overlaps(rect, clip))) continue;
      if (visible && part.index > previousEnd) visible += " ";
      visible += part[0];
      previousEnd = partEnd;
    }
    return visible;
  }

  function listMarker(element, type) {
    if (type === "none") return "";
    const list = element.parentElement;
    if (list?.tagName !== "OL") return "• ";
    const step = list.reversed ? -1 : 1;
    const items = Array.from(list.children).filter((child) => child.tagName === "LI");
    let number = list.reversed && !list.hasAttribute("start") ? items.length : list.start;
    for (const item of items) {
      if (item.hasAttribute("value")) number = item.value;
      if (item === element) break;
      number += step;
    }
    if (number > 0 && /^(lower|upper)-(alpha|latin)$/.test(type)) {
      let letters = "";
      for (let remaining = number; remaining > 0; remaining = Math.floor((remaining - 1) / 26)) {
        letters = String.fromCharCode(97 + (remaining - 1) % 26) + letters;
      }
      return (type.startsWith("upper") ? letters.toUpperCase() : letters) + ". ";
    }
    return number + ". ";
  }

  function read(root) {
    for (let parent = root.parentElement; parent; parent = parent.parentElement) {
      if (skip(parent, getComputedStyle(parent))) return { text: "", truncated: false };
    }

    let text = "";
    let separator = "";
    const spacing = { "": 0, " ": 1, "\t": 2, "\n": 3 };
    function separate(next) {
      if (text && spacing[next] > spacing[separator]) separator = next;
    }

    function visit(node, clip, style, marker = null, inCell = false) {
      if (text.length > limit || (range && !range.intersectsNode(node))) return;

      if (node.nodeType === Node.TEXT_NODE && style?.visibility === "visible") {
        const raw = renderedText(node, clip);
        const value = raw.replace(/\s+/g, " ");
        if (value.startsWith(" ")) separate(" ");
        const trimmed = value.trim();
        if (trimmed) {
          text += separator + (marker?.label ?? "") + trimmed.slice(0, limit + 1);
          if (marker) marker.label = "";
          separator = "";
        }
        if (value.endsWith(" ")) separate(" ");
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const elementStyle = getComputedStyle(node);
      if (skip(node, elementStyle)) return;
      const childClip = clipToContainer(clip, node, elementStyle);
      if (childClip && (childClip.left >= childClip.right || childClip.top >= childClip.bottom)) return;

      const cell = node.matches("td,th,[role=cell],[role=gridcell],[role=columnheader],[role=rowheader]");
      const block = node.tagName === "BR" || /^(block|flow-root|flex|grid|table|table-row|list-item)( |$)/.test(elementStyle.display);
      if (cell) separate("\t");
      else if (block) separate(inCell ? " " : "\n");
      if (node.tagName === "LI" && elementStyle.display === "list-item") {
        marker = { label: listMarker(node, elementStyle.listStyleType) };
      }

      if (node.tagName === "DETAILS" && !node.open) {
        const summary = node.querySelector(":scope > summary");
        if (summary) visit(summary, childClip, elementStyle, marker, inCell);
      } else {
        for (const child of node.childNodes) {
          visit(child, childClip, elementStyle, marker, inCell || cell);
          if (text.length > limit) break;
        }
      }
      if (block) separate(inCell ? " " : "\n");
    }

    visit(root, viewport);
    return {
      text: text.slice(0, limit).replace(/[\uD800-\uDBFF]$/, "").trimEnd(),
      truncated: text.length > limit,
    };
  }

  if (mode === "main") {
    for (const selector of ["main", '[role="main"]', "article"]) {
      for (const root of body.querySelectorAll(selector)) {
        const result = read(root);
        if (result.text) return result;
      }
    }
  }
  return read(body);
}
