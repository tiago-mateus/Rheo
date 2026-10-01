import test from "node:test";
import assert from "node:assert/strict";
import { createBackend } from "../server/backend.js";
import http from "node:http";

test("room creation requires a correct operator key when configured", async () => {
  const backend = createBackend({ studioKey: "correct-operator-key-with-32-characters" });
  const server = http.createServer(backend.app);
  backend.attach(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Port not assigned");
    const url = "http://127.0.0.1:" + address.port + "/api/sessions";
    const headers = { "Content-Type": "application/json" };
    const missing = await fetch(url, { method: "POST", headers, body: "{}" });
    assert.equal(missing.status, 401);
    const incorrect = await fetch(url, { method: "POST", headers: { ...headers, "X-Rheo-Studio-Key": "wrong" }, body: "{}" });
    assert.equal(incorrect.status, 401);
    const authorized = await fetch(url, { method: "POST", headers: { ...headers, "X-Rheo-Studio-Key": "correct-operator-key-with-32-characters" }, body: "{}" });
    assert.equal(authorized.status, 201);
    const session = await authorized.json() as { id: string; controlToken: string };
    const metadata = await fetch(url + "/" + session.id, { headers: { Authorization: "Bearer " + session.controlToken } });
    assert.equal(metadata.status, 200);
  } finally {
    await backend.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("short operator keys are rejected at server startup", () => {
  assert.throws(() => createBackend({ studioKey: "short" }), /24 caracteres/);
});
