import { frameRect, type VideoFormat } from "../shared/video";

export async function frameCamera(raw: MediaStream, format: VideoFormat) {
  const source = document.createElement("video");
  source.muted = true;
  source.defaultMuted = true;
  source.playsInline = true;
  source.srcObject = raw;
  const canvas = document.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const context = canvas.getContext("2d", { alpha: false });
  let frame = 0;
  let videoFrame = 0;
  let output: MediaStream | undefined;
  let stopped = false;
  function stop() {
    stopped = true;
    cancelAnimationFrame(frame);
    if (videoFrame) source.cancelVideoFrameCallback(videoFrame);
    source.pause();
    source.srcObject = null;
    raw.getTracks().forEach((t) => t.stop());
    output?.getTracks().forEach((t) => t.stop());
  }
  try {
    if (!context || !canvas.captureStream)
      throw new Error("Formato de vídeo indisponível neste navegador.");
    await source.play();
    function draw() {
      if (source.videoWidth && source.videoHeight) {
        const rect = frameRect(source.videoWidth, source.videoHeight, format);
        context!.fillStyle = "#000";
        context!.fillRect(0, 0, canvas.width, canvas.height);
        context!.drawImage(source, rect.x, rect.y, rect.width, rect.height);
      }
    }
    draw();
    if (source.requestVideoFrameCallback) {
      const onVideoFrame = () => {
        if (stopped) return;
        draw();
        videoFrame = source.requestVideoFrameCallback(onVideoFrame);
      };
      videoFrame = source.requestVideoFrameCallback(onVideoFrame);
    } else {
      let previous = 0;
      const onAnimationFrame = (time: number) => {
        if (stopped) return;
        if (time - previous >= 33) {
          draw();
          previous = time;
        }
        frame = requestAnimationFrame(onAnimationFrame);
      };
      frame = requestAnimationFrame(onAnimationFrame);
    }
    output = canvas.captureStream(30);
    for (const track of raw.getAudioTracks()) output.addTrack(track);
    return { stream: output, stop };
  } catch (error) {
    stop();
    throw error;
  }
}
