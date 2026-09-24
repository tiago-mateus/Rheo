import test from "node:test";
import assert from "node:assert/strict";
import { SessionStore } from "../server/sessions.js";
test("credenciais distintas e isolamento por sessão", () => {
  const store = new SessionStore();
  const a = store.create();
  const b = store.create();
  assert.notEqual(a.sendToken, a.viewToken);
  assert.equal(store.authorize(a.id, a.sendToken), "sender");
  assert.equal(store.authorize(a.id, a.viewToken), "viewer");
  assert.equal(store.authorize(a.id, b.viewToken), null);
  assert.equal(store.authorize(a.id, ""), null);
});
test("apenas um participante de cada papel; saída libera vaga", () => {
  const store = new SessionStore();
  const a = store.create();
  assert.equal(store.join(a.id, "sender", "one"), true);
  assert.equal(store.join(a.id, "sender", "two"), false);
  store.leave(a.id, "sender", "wrong");
  assert.equal(store.join(a.id, "sender", "two"), false);
  store.leave(a.id, "sender", "one");
  assert.equal(store.join(a.id, "sender", "two"), true);
});
test("sessões expiram e encerramento invalida credenciais", () => {
  let now = 100;
  const store = new SessionStore(() => now, 1000);
  const a = store.create();
  now = 1101;
  assert.equal(store.authorize(a.id, a.sendToken), null);
  const b = store.create();
  store.end(b.id);
  assert.equal(store.authorize(b.id, b.viewToken), null);
});
