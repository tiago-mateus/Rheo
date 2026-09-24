import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createBackend } from "../server/backend.js";
import { WebSocket } from "ws";

test("painel guarda formato e separa convite, recepção e controle sem ocupar vaga", async () => {
  const backend = createBackend();
  const server = createServer(backend.app);
  backend.attach(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base =
    "http://127.0.0.1:" + (server.address() as { port: number }).port;
  try {
    const format = { width: 1920, height: 1080, fit: "contain" };
    const response = await fetch(base + "/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, managed: true }),
    });
    const keys = (await response.json()) as any;
    assert.equal(typeof keys.controlToken, "string");
    const read = (token: string) =>
      fetch(base + "/api/sessions/" + keys.id, {
        headers: { Authorization: "Bearer " + token },
      });
    const state = (await (await read(keys.controlToken)).json()) as any;
    assert.deepEqual(state.format, format);
    assert.equal(state.senderConnected, false);
    assert.equal(state.viewerConnected, false);
    assert.equal(state.sendToken, keys.sendToken);
    const ws = new WebSocket(base.replace("http:", "ws:") + "/signal", {
      origin: base,
    });
    await new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });
    const message = () =>
      new Promise<any>((resolve) =>
        ws.once("message", (data) => resolve(JSON.parse(data.toString()))),
      );
    let next = message();
    ws.send(
      JSON.stringify({ type: "join", id: keys.id, token: keys.sendToken }),
    );
    assert.equal((await next).type, "joined");
    for (const type of ["end", "release-viewer"]) {
      next = message();
      ws.send(JSON.stringify({ type }));
      assert.equal((await next).type, "error");
      assert.equal((await read(keys.controlToken)).status, 200);
    }
    ws.close();
    for (const token of [keys.sendToken, keys.viewToken]) {
      const publicState = (await (await read(token)).json()) as any;
      assert.deepEqual(publicState.format, format);
      assert.equal(publicState.sendToken, undefined);
      assert.equal(publicState.viewToken, undefined);
      assert.equal(publicState.controlToken, undefined);
      assert.equal(
        (
          await fetch(base + "/api/sessions/" + keys.id + "/end", {
            method: "POST",
            headers: { Authorization: "Bearer " + token },
          })
        ).status,
        403,
      );
    }
    assert.equal((await read("wrong")).status, 404);
    const invalid = await fetch(base + "/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: { width: 99999, height: -1, fit: "stretch" },
      }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(
      (
        await fetch(base + "/api/sessions/" + keys.id + "/end", {
          method: "POST",
          headers: { Authorization: "Bearer " + keys.controlToken },
        })
      ).status,
      200,
    );
    assert.equal((await read(keys.controlToken)).status, 404);
  } finally {
    await backend.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
