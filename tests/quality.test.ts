import test from "node:test";
import assert from "node:assert/strict";
import { cameraQualityQuery, imageQualityFromSearch, videoBitrateKbps } from "../src/imageQuality.js";

test("quality-first ceilings preserve encoding headroom", () => {
  assert.equal(videoBitrateKbps(1920, 1080, "maximum"), 12000);
  assert.equal(videoBitrateKbps(1280, 720, "maximum"), 6000);
  assert.equal(videoBitrateKbps(640, 480, "maximum"), 3000);
  assert.equal(videoBitrateKbps(1920, 1080, "balanced"), 4500);
});

test("manual bitrate overrides are bounded and strictly numeric", () => {
  assert.equal(videoBitrateKbps(1920, 1080, "maximum", "?bitrate=16000"), 16000);
  assert.equal(videoBitrateKbps(1920, 1080, "maximum", "?bitrate=800"), 800);
  for (const bad of ["0", "200", "16001", "-1", "1000.5", "1e8", "abc", ""]) {
    assert.equal(videoBitrateKbps(1920, 1080, "maximum", "?bitrate=" + bad), 12000);
  }
});

test("camera invitation maintains backwards-compatible maximum defaults", () => {
  assert.equal(cameraQualityQuery("maximum", false), "");
  assert.equal(cameraQualityQuery("maximum", true), "?lan=1");
  assert.equal(cameraQualityQuery("balanced", false), "?quality=balanced");
  assert.equal(cameraQualityQuery("balanced", true), "?lan=1&quality=balanced");
  assert.equal(imageQualityFromSearch(""), "maximum");
  assert.equal(imageQualityFromSearch("?quality=balanced"), "balanced");
  assert.equal(imageQualityFromSearch("?quality=wrong"), "maximum");
});
