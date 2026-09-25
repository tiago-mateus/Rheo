import test from "node:test";
import assert from "node:assert/strict";
import { isLanCandidate, lanDescription, mediaRoute } from "../src/network.js";

const candidate = (address: string, type = "host") =>
  `candidate:1 1 udp 2122260223 ${address} 49152 typ ${type}`;

test("modo LAN aceita só candidatos locais e mDNS", () => {
  for (const address of [
    "192.168.100.25",
    "10.0.0.2",
    "172.31.2.3",
    "169.254.1.2",
    "fe80::1",
    "fd12::2",
    "abc.local",
  ])
    assert.equal(isLanCandidate(candidate(address)), true, address);
  for (const address of ["8.8.8.8", "172.32.1.2", "2001:db8::1"])
    assert.equal(isLanCandidate(candidate(address)), false, address);
  assert.equal(isLanCandidate(candidate("192.168.1.2", "relay")), false);
  assert.equal(isLanCandidate(candidate("192.168.1.2", "srflx")), false);
});

test("SDP LAN remove candidatos fora da rede", () => {
  const description = {
    type: "offer",
    sdp: `v=0\r\na=${candidate("192.168.1.2")}\r\na=${candidate("8.8.8.8")}\r\na=${candidate("192.168.1.3", "relay")}\r\n`,
  };
  const result = lanDescription(description);
  assert.match(result.sdp, /192\.168\.1\.2/);
  assert.doesNotMatch(result.sdp, /8\.8\.8\.8|relay/);
  assert.match(result.sdp, /^v=0/);
});

test("indicador só confirma LAN para par host com endereços locais", () => {
  assert.equal(
    mediaRoute(
      { candidateType: "host", address: "192.168.1.2" },
      { candidateType: "host", address: "192.168.1.3" },
    ),
    "LAN",
  );
  assert.equal(
    mediaRoute(
      { candidateType: "host", address: "192.168.1.2" },
      { candidateType: "srflx", address: "8.8.8.8" },
    ),
    "Direta · LAN não confirmada",
  );
  assert.equal(
    mediaRoute({ candidateType: "relay" }, { candidateType: "host" }),
    "Via TURN",
  );
  assert.equal(
    mediaRoute({ candidateType: "host" }, { candidateType: "host" }),
    "Direta · LAN não confirmada",
  );
  assert.equal(
    mediaRoute({ candidateType: "host" }, { candidateType: "host" }, true),
    "LAN",
  );
});
