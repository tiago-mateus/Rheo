import { createHmac } from "node:crypto";
import type { IceSettings } from "../shared/protocol.js";
export function iceSettings(): IceSettings {
  const iceServers: RTCIceServer[] = [
    { urls: process.env.STUN_URL || "stun:stun.l.google.com:19302" },
  ];
  const urls = process.env.TURN_URLS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (urls?.length && process.env.TURN_SECRET) {
    const username = String(Math.floor(Date.now() / 1000) + 4 * 60 * 60);
    iceServers.push({
      urls,
      username,
      credential: createHmac("sha1", process.env.TURN_SECRET)
        .update(username)
        .digest("base64"),
    });
  } else if (
    urls?.length &&
    process.env.TURN_USERNAME &&
    process.env.TURN_PASSWORD
  ) {
    iceServers.push({
      urls,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    });
  }
  return { iceServers, hasTurn: iceServers.length > 1 };
}
