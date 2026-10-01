/**
 * Image-quality policy for browser camera senders.
 * A maximum bitrate is a ceiling, not a promise of network throughput.
 * Preserve 30 fps to give each frame more encoding budget than 60 fps.
 */
export type ImageQuality = "maximum" | "balanced";

export function imageQualityFromSearch(search: string): ImageQuality {
  return new URLSearchParams(search).get("quality") === "balanced" ? "balanced" : "maximum";
}

export function videoBitrateKbps(
  width: number,
  height: number,
  profile: ImageQuality,
  search = "",
): number {
  const pixels = width * height;
  const automatic = profile === "maximum"
    ? pixels > 1280 * 720 ? 12000 : pixels > 640 * 480 ? 6000 : 3000
    : pixels > 1280 * 720 ? 4500 : pixels > 640 * 480 ? 2500 : 1200;
  const requested = new URLSearchParams(search).get("bitrate");
  if (requested === null || !/^\d+$/.test(requested)) return automatic;
  const kbps = Number(requested);
  return Number.isSafeInteger(kbps) && kbps >= 300 && kbps <= 16000
    ? kbps
    : automatic;
}

export function cameraQualityQuery(quality: ImageQuality, lanOnly: boolean): string {
  const params = new URLSearchParams();
  if (lanOnly) params.set("lan", "1");
  // Maximum is the default for new sessions, so existing invites remain valid.
  if (quality === "balanced") params.set("quality", "balanced");
  const query = params.toString();
  return query ? "?" + query : "";
}
