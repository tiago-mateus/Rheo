export interface VideoFormat {
  width: number;
  height: number;
  fit: "contain" | "cover";
}
export const defaultFormat: VideoFormat = {
  width: 1280,
  height: 720,
  fit: "contain",
};
export function validFormat(value: unknown): value is VideoFormat {
  if (!value || typeof value !== "object") return false;
  const f = value as VideoFormat;
  return (
    Number.isInteger(f.width) &&
    Number.isInteger(f.height) &&
    f.width >= 240 &&
    f.height >= 240 &&
    f.width <= 1920 &&
    f.height <= 1920 &&
    f.width % 2 === 0 &&
    f.height % 2 === 0 &&
    f.width * f.height <= 1920 * 1080 &&
    (f.fit === "contain" || f.fit === "cover")
  );
}
export function frameRect(
  sourceWidth: number,
  sourceHeight: number,
  format: VideoFormat,
) {
  const scale = (format.fit === "cover" ? Math.max : Math.min)(
    format.width / sourceWidth,
    format.height / sourceHeight,
  );
  const width = sourceWidth * scale,
    height = sourceHeight * scale;
  return {
    x: (format.width - width) / 2,
    y: (format.height - height) / 2,
    width,
    height,
  };
}
