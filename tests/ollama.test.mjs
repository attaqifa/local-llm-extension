import assert from "node:assert/strict";
import test from "node:test";
import { listLocalModels, streamChat } from "../extension/ollama.js";

const origin = "http://127.0.0.1:11434";
const model = "gemma4:e4b";
const signal = () => new AbortController().signal;
const input = [{ role: "user", content: "Kutipan halaman" }];
const details = { capabilities: ["completion", "thinking"], thinking: { values: [false, true] } };

function chatResponse(lines) {
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

test("lists unique local models and excludes remote entries and aliases", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, origin + "/api/tags");
    return Response.json({ models: [
      { name: model },
      { name: "distant:cloud" },
      { name: "alias", remote_host: "https://ollama.com" },
      { model },
      { model: "other:latest" },
    ] });
  });
  assert.deepEqual(await listLocalModels(signal()), [model, "other:latest"]);
});

test("streams text split across JSON records and UTF-8 bytes", async (t) => {
  const firstLine = '{"message":{"thinking":"hidden","content":"✓ "},"done":false}\r\n';
  const bytes = new TextEncoder().encode(firstLine +
    '{"message":{"content":"siap"},"done":true}');
  const split = new TextEncoder().encode(firstLine.slice(0, firstLine.indexOf("✓"))).length + 1;
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.endsWith("/api/show")) {
      assert.deepEqual(JSON.parse(options.body), { model });
      return Response.json(details);
    }
    assert.equal(url, origin + "/api/chat");
    assert.equal(options.redirect, "error");
    assert.deepEqual(JSON.parse(options.body), {
      model, messages: input, stream: true, keep_alive: "5m", think: false,
    });
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split, split + 4));
        controller.enqueue(bytes.slice(split + 4));
        controller.close();
      },
    }));
  });
  const text = [];
  await streamChat({ model, messages: input, signal: signal(), onText: (chunk) => text.push(chunk) });
  assert.equal(fetch.mock.callCount(), 2);
  assert.deepEqual(text, ["✓ ", "siap"]);
});

test("sends the thinking preference only when the model supports it", async (t) => {
  const cases = [
    { metadata: details, selected: true, expected: true },
    { metadata: details, selected: false, expected: false },
    { metadata: { capabilities: ["completion", "thinking"] }, selected: true, expected: true },
    { metadata: { ...details, thinking: { values: [false] } }, selected: true, expected: false },
    { metadata: { ...details, thinking: { values: ["low", "high"] } }, selected: true },
    { metadata: { capabilities: ["completion"] }, selected: true },
  ];
  for (const { metadata, selected, expected } of cases) {
    const fetch = t.mock.method(globalThis, "fetch", async (url) => {
      if (url.endsWith("/api/show")) return Response.json(metadata);
      return chatResponse(['{"done":true}']);
    });
    await streamChat({ model, messages: input, think: selected, signal: signal(), onText: assert.fail });
    const request = JSON.parse(fetch.mock.calls[1].arguments[1].body);
    if (expected === undefined) assert.equal(Object.hasOwn(request, "think"), false);
    else assert.equal(request.think, expected);
    fetch.mock.restore();
  }
});

test("does not send source content for denied, missing, or remote models", async (t) => {
  const replies = [
    [new Response(null, { status: 403 }), "origin"],
    [new Response(null, { status: 404 }), "missing"],
    [Response.json({ remote_model: "other" }), "remote"],
  ];
  let next = 0;
  const fetch = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, origin + "/api/show");
    return replies[next++][0];
  });
  for (const [, code] of replies) {
    await assert.rejects(
      streamChat({ model, messages: input, signal: signal(), onText: assert.fail }),
      { code },
    );
  }
  assert.equal(fetch.mock.callCount(), replies.length);
});

test("sends image bytes to vision models and rejects text-only models", async (t) => {
  const imageInput = [{ role: "user", content: "Salin tulisan", images: ["aW1hZ2U="] }];
  let capabilities = ["completion"];
  const fetch = t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.endsWith("/api/show")) return Response.json({ capabilities });
    assert.equal(url, origin + "/api/chat");
    assert.deepEqual(JSON.parse(options.body).messages, imageInput);
    return chatResponse(['{"done":true}']);
  });
  const options = { model, messages: imageInput, signal: signal(), onText: assert.fail };
  await assert.rejects(streamChat(options), { code: "vision" });
  assert.equal(fetch.mock.callCount(), 1);

  capabilities = ["completion", "vision"];
  await streamChat(options);
  assert.equal(fetch.mock.callCount(), 3);
});

test("reports network failure and a stream that ends after partial text", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    if (url.endsWith("/api/tags")) throw new TypeError("Failed to fetch");
    if (url.endsWith("/api/show")) return Response.json(details);
    return chatResponse(['{"message":{"content":"sebagian"},"done":false}', ""]);
  });
  await assert.rejects(listLocalModels(signal()), { code: "unreachable" });
  const text = [];
  await assert.rejects(streamChat({
    model, messages: input, signal: signal(), onText: (chunk) => text.push(chunk),
  }), { code: "interrupted" });
  assert.deepEqual(text, ["sebagian"]);
});

test("cancels an in-flight stream after partial text", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (url.endsWith("/api/show")) return Response.json(details);
    assert.equal(options.signal, controller.signal);
    return new Response(new ReadableStream({
      start(stream) {
        stream.enqueue(new TextEncoder().encode('{"message":{"content":"A"}}\n'));
        options.signal.addEventListener("abort", () => stream.error(options.signal.reason), { once: true });
      },
    }));
  });
  const text = [];
  const request = streamChat({
    model,
    messages: input,
    signal: controller.signal,
    onText(chunk) {
      text.push(chunk);
      controller.abort();
    },
  });
  await assert.rejects(request, { name: "AbortError" });
  assert.deepEqual(text, ["A"]);
});
