import test from "node:test";
import assert from "node:assert/strict";
import { obsLink } from "../src/links.js";
test("link OBS preserva token e parâmetros de conectividade", () => {
  const link = new URL(
    obsLink("https://localhost:3000/view/abc?relay=1#token=secret"),
  );
  assert.equal(link.pathname, "/view/abc");
  assert.equal(link.searchParams.get("relay"), "1");
  assert.equal(link.searchParams.get("clean"), "1");
  assert.equal(link.hash, "#token=secret");
});

test("link OBS de uma página de espera remove a rota de status", () => {
  const url = new URL(
    obsLink(
      "https://rheo.example/status/released/view/abc?relay=1#token=secret",
    ),
  );
  assert.equal(url.pathname, "/view/abc");
  assert.equal(url.searchParams.get("relay"), "1");
  assert.equal(url.searchParams.get("clean"), "1");
  assert.equal(url.hash, "#token=secret");
});
