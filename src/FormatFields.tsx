import { useState } from "react";
import type { VideoFormat } from "../shared/video";

export default function FormatFields({
  value,
  onChange,
}: {
  value: VideoFormat;
  onChange: (value: VideoFormat) => void;
}) {
  const [preset, setPreset] = useState("landscape");
  const [quality, setQuality] = useState("720");
  function choose(shape: string, size: string) {
    setPreset(shape);
    setQuality(size);
    if (shape === "custom") return;
    const short = Number(size),
      long = size === "1080" ? 1920 : 1280;
    onChange({
      ...value,
      width: shape === "landscape" ? long : short,
      height: shape === "portrait" ? long : short,
    });
  }
  return (
    <div className="format-fields">
      <label htmlFor="format">Formato</label>
      <select
        id="format"
        value={preset}
        onChange={(e) => choose(e.target.value, quality)}
      >
        <option value="landscape">YouTube · Horizontal (16:9)</option>
        <option value="portrait">Vertical (9:16)</option>
        <option value="square">Quadrado (1:1)</option>
        <option value="custom">Personalizado</option>
      </select>
      {preset !== "custom" ? (
        <>
          <label htmlFor="resolution">Resolução</label>
          <select
            id="resolution"
            value={quality}
            onChange={(e) => choose(preset, e.target.value)}
          >
            <option value="720">720p · Mais leve</option>
            <option value="1080">1080p · Mais detalhes</option>
          </select>
        </>
      ) : (
        <div className="dimension-fields">
          <div>
            <label htmlFor="width">Largura</label>
            <input
              id="width"
              type="number"
              min="240"
              max="1920"
              step="2"
              required
              value={value.width || ""}
              onChange={(e) =>
                onChange({ ...value, width: Number(e.target.value) })
              }
            />
          </div>
          <div>
            <label htmlFor="height">Altura</label>
            <input
              id="height"
              type="number"
              min="240"
              max="1920"
              step="2"
              required
              value={value.height || ""}
              onChange={(e) =>
                onChange({ ...value, height: Number(e.target.value) })
              }
            />
          </div>
        </div>
      )}
      <label htmlFor="fit">Enquadramento</label>
      <select
        id="fit"
        value={value.fit}
        onChange={(e) =>
          onChange({ ...value, fit: e.target.value as VideoFormat["fit"] })
        }
      >
        <option value="contain">Imagem inteira · Barras se necessário</option>
        <option value="cover">Preencher · Cortar bordas</option>
      </select>
      <p className="small">
        {value.fit === "contain"
          ? "Preserva toda a imagem, sem esticar."
          : "Preenche o quadro com corte central, sem esticar."}{" "}
        Para filmar em horizontal, prefira o celular deitado.
      </p>
    </div>
  );
}
