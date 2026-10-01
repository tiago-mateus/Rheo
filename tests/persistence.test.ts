import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../server/sessions.js";

test("sessions survive a process restart without retaining connected sockets", () => {
  const dir = mkdtempSync(join(tmpdir(), "rheo-session-"));
  const file = join(dir, "rooms.json");
  try {
    const before = new SessionStore(() => 100, 1000, file);
    const keys = before.create(undefined, true);
    assert.equal(before.join(keys.id, "sender", "socket-1"), true);
    before.markViewerReleased(keys.id, "identity-long-enough");
    const after = new SessionStore(() => 200, 1000, file);
    assert.equal(after.authorize(keys.id, keys.sendToken), "sender");
    assert.equal(after.authorize(keys.id, keys.viewToken), "viewer");
    assert.equal(after.get(keys.id)?.sender, undefined);
    assert.equal(after.get(keys.id)?.managed, true);
    assert.equal(after.isViewerReleased(keys.id, "identity-long-enough"), true);
    assert.equal(after.join(keys.id, "sender", "socket-2"), true);
    after.end(keys.id);
    const ended = new SessionStore(() => 300, 1000, file);
    assert.equal(ended.get(keys.id), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("expired rooms do not reappear after restore", () => {
  const dir = mkdtempSync(join(tmpdir(), "rheo-session-"));
  const file = join(dir, "rooms.json");
  try {
    const original = new SessionStore(() => 100, 1000, file);
    const keys = original.create();
    assert.equal(new SessionStore(() => 1101, 1000, file).get(keys.id), undefined);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("corrupt persisted credentials fail closed", () => {
  const dir = mkdtempSync(join(tmpdir(), "rheo-session-"));
  const file = join(dir, "rooms.json");
  try {
    writeFileSync(file, '[{"id":"not-a-real-room"}]');
    assert.throws(() => new SessionStore(Date.now, 1000, file), /Arquivo de sessões inválido/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
