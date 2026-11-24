const endpoint = "http://127.0.0.1:11434";

const messages = {
  unreachable: "Ollama tidak dapat dijangkau. Jalankan Ollama lokal dan periksa izin origin ekstensi.",
  origin: "Ollama menolak akses dari ekstensi ini.",
  missing: "Model tidak tersedia. Periksa daftar model lokal.",
  remote: "Pilih model yang berjalan di perangkat ini.",
  incompatible: "Model ini tidak mendukung percakapan teks.",
  vision: "Model yang dipilih tidak bisa membaca gambar.",
  interrupted: "Respons Ollama terputus sebelum selesai.",
  invalid: "Ollama mengirim respons yang tidak dapat dibaca.",
  server: "Ollama gagal memproses permintaan. Periksa log Ollama, lalu coba lagi.",
};

class OllamaError extends Error {
  constructor(code) {
    super(messages[code]);
    this.code = code;
  }
}

async function request(path, signal, body) {
  let response;
  try {
    response = await fetch(endpoint + path, {
      signal,
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      ...(body && {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    });
  } catch (error) {
    if (signal.aborted && signal.reason?.name !== "TimeoutError") throw error;
    throw new OllamaError("unreachable");
  }

  if (response.ok) return response;
  void response.body?.cancel().catch(() => {});
  if (response.status === 401 || response.status === 403) throw new OllamaError("origin");
  if (response.status === 404 && body?.model) throw new OllamaError("missing");
  throw new OllamaError("server");
}

async function json(response) {
  try {
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new OllamaError("invalid");
  }
}

async function load(path, signal, body) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timeout = setTimeout(() => controller.abort(new DOMException("", "TimeoutError")), 10000);

  try {
    return await json(await request(path, controller.signal, body));
  } catch (error) {
    if (controller.signal.reason?.name === "TimeoutError") throw new OllamaError("unreachable");
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

function remote(model) {
  return Boolean(model.remote_host || model.remote_model ||
    /(?:[:-]cloud(?:$|:)|^ollama\.com\/)/i.test(model.name || model.model || ""));
}

export async function listLocalModels(signal) {
  const data = await load("/api/tags", signal);
  if (!Array.isArray(data?.models)) throw new OllamaError("invalid");
  const names = data.models
    .filter((entry) => entry && !remote(entry))
    .map((entry) => entry.name || entry.model)
    .filter((name) => typeof name === "string" && name);
  return [...new Set(names)].sort((first, second) => first.localeCompare(second));
}

export async function inspectLocalModel(model, signal) {
  const details = await load("/api/show", signal, { model });
  if (!details || typeof details !== "object" || Array.isArray(details)) throw new OllamaError("invalid");
  if (remote(details)) throw new OllamaError("remote");
  if (Array.isArray(details.capabilities) && !details.capabilities.includes("completion")) {
    throw new OllamaError("incompatible");
  }
  let thinkingValues = details.thinking?.values;
  if (!Array.isArray(thinkingValues)) {
    const legacyGemma = /^gemma/i.test(details.details?.family || model) &&
      details.capabilities?.includes("thinking");
    thinkingValues = legacyGemma ? [false, true] : [];
  }
  return { thinkingValues, vision: details.capabilities?.includes("vision") === true };
}

export async function streamChat({ model, messages, think = false, signal, onText }) {
  // Recheck the model before any prompt or source text is sent to Ollama.
  const { thinkingValues, vision } = await inspectLocalModel(model, signal);
  if (!vision && messages.some((message) => message.images?.length)) throw new OllamaError("vision");
  const thinking = thinkingValues.includes(think) ? think
    : thinkingValues.includes(false) ? false : undefined;
  const response = await request("/api/chat", signal, {
    model,
    messages,
    stream: true,
    keep_alive: "5m",
    think: thinking,
  });
  if (!response.body) throw new OllamaError("invalid");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function readLine(line) {
    if (!line.trim()) return false;
    let frame;
    try {
      frame = JSON.parse(line);
    } catch {
      throw new OllamaError("interrupted");
    }
    if (!frame || typeof frame !== "object") throw new OllamaError("invalid");
    if (frame.error) throw new OllamaError("server");
    if (typeof frame.message?.content === "string" && frame.message.content) {
      onText(frame.message.content);
    }
    return frame.done === true;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (readLine(buffer + decoder.decode())) return;
        throw new OllamaError("interrupted");
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (readLine(line)) return;
      }
    }
  } catch (error) {
    if (signal.aborted || error instanceof OllamaError) throw error;
    throw new OllamaError("interrupted");
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
