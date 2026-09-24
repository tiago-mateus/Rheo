import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { iceSettings } from "../server/ice.js";
test("TURN usa credencial temporária sem expor segredo", () => {
  const before = { ...process.env };
  try {
    process.env.TURN_URLS = "turn:example.test:3478, turns:example.test:5349";
    process.env.TURN_SECRET = "test-secret";
    const settings = iceSettings();
    assert.equal(settings.hasTurn, true);
    const turn = settings.iceServers[1];
    assert.ok(Number(turn.username) > Date.now() / 1000);
    assert.deepEqual(turn.urls, [
      "turn:example.test:3478",
      "turns:example.test:5349",
    ]);
    assert.equal(
      turn.credential,
      createHmac("sha1", "test-secret").update(turn.username!).digest("base64"),
    );
    assert.equal(JSON.stringify(settings).includes("test-secret"), false);
  } finally {
    for (const key of ["TURN_URLS", "TURN_SECRET"]) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});
