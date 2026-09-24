import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocket } from "ws";
import { createBackend } from "../server/backend.js";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
test("sinalização autentica, isola, limita receptores e encerra a sessão", async () => {
  const backend = createBackend();
  const http = createServer(backend.app);
  backend.attach(http);
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const port = (http.address() as { port: number }).port;
  const origin = "http://127.0.0.1:" + port;
  const clients: WebSocket[] = [];
  async function connect(id: string, token: string, resumeKey?: string) {
    const ws = new WebSocket("ws://127.0.0.1:" + port + "/signal", { origin });
    clients.push(ws);
    const messages: any[] = [];
    ws.on("message", (data) => messages.push(JSON.parse(data.toString())));
    await new Promise<void>((r) => ws.once("open", r));
    ws.send(JSON.stringify({ type: "join", id, token, resumeKey }));
    async function wait(type: string) {
      for (let i = 0; i < 100; i++) {
        const n = messages.findIndex((m) => m.type === type);
        if (n >= 0) return messages.splice(n, 1)[0];
        await delay(10);
      }
      throw new Error("Não recebeu " + type);
    }
    return { ws, messages, wait };
  }
  try {
    const response = await fetch(origin + "/api/sessions", { method: "POST" });
    assert.equal(response.status, 201);
    const a = (await response.json()) as any;
    const b = (await (
      await fetch(origin + "/api/sessions", { method: "POST" })
    ).json()) as any;
    const unauthorized = await connect(a.id, b.viewToken);
    assert.match((await unauthorized.wait("error")).message, /inválid|expir/i);
    let sender = await connect(a.id, a.sendToken, "resume-secret");
    assert.equal((await sender.wait("joined")).role, "sender");
    const viewer = await connect(a.id, a.viewToken);
    await viewer.wait("joined");
    await sender.wait("ready");
    const extra = await connect(a.id, a.viewToken);
    assert.match((await extra.wait("error")).message, /uso/i);
    sender = await connect(a.id, a.sendToken, "resume-secret");
    await sender.wait("joined");
    await sender.wait("ready");
    const payload = {
      type: "description",
      description: { type: "offer", sdp: "example" },
    };
    sender.ws.send(JSON.stringify(payload));
    assert.deepEqual(await viewer.wait("description"), payload);
    viewer.ws.close();
    await sender.wait("peer-left");
    const again = await connect(a.id, a.viewToken);
    await again.wait("joined");
    await sender.wait("ready");
    again.ws.send(JSON.stringify({ type: "end" }));
    assert.match((await again.wait("error")).message, /transmissor/i);
    sender.ws.send(JSON.stringify({ type: "end" }));
    await again.wait("ended");
    const expired = await connect(a.id, a.viewToken);
    await expired.wait("error");
  } finally {
    for (const ws of clients) ws.terminate();
    await backend.close();
    await new Promise<void>((r) => http.close(() => r()));
  }
});

test("HTTPS público funciona atrás do proxy e rejeita origem externa", async () => {
  const backend = createBackend({
    publicOrigin: "https://rheo-test.onrender.com",
  });
  const server = createServer(backend.app);
  backend.attach(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base =
    "http://127.0.0.1:" + (server.address() as { port: number }).port;
  const sockets: WebSocket[] = [];
  try {
    const response = await fetch(base + "/api/sessions", {
      method: "POST",
      headers: { origin: "https://rheo-test.onrender.com" },
    });
    assert.equal(response.status, 201);
    const session = (await response.json()) as any;
    const rejected = await fetch(base + "/api/sessions", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "evil.example",
      },
    });
    assert.equal(rejected.status, 403);
    const ws = new WebSocket(base.replace("http:", "ws:") + "/signal", {
      origin: "https://rheo-test.onrender.com",
    });
    sockets.push(ws);
    const joined = new Promise<any>((resolve, reject) => {
      ws.once("error", reject);
      ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      ws.once("open", () =>
        ws.send(
          JSON.stringify({
            type: "join",
            id: session.id,
            token: session.sendToken,
          }),
        ),
      );
    });
    assert.equal((await joined).type, "joined");
    const bad = new WebSocket(base.replace("http:", "ws:") + "/signal", {
      origin: "https://evil.example",
    });
    sockets.push(bad);
    const opened = await new Promise<boolean>((resolve) => {
      bad.once("open", () => resolve(true));
      bad.once("error", () => resolve(false));
    });
    assert.equal(opened, false);
  } finally {
    for (const socket of sockets) socket.terminate();
    await backend.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
