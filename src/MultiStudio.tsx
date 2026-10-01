import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { defaultFormat, validFormat, type VideoFormat } from "../shared/video";
import type { SessionKeys } from "../shared/protocol";
import FormatFields from "./FormatFields";
import { obsLink } from "./links";
import { readStudioKey, saveStudioKey } from "./studioAuth";
import { cameraQualityQuery, type ImageQuality } from "./imageQuality";

type CameraRoom = SessionKeys & { name: string; format: VideoFormat; lanOnly: boolean; imageQuality?: ImageQuality };
type Connection = { senderConnected: boolean; viewerConnected: boolean; expired?: boolean };
const storageKey = "rheo-multicamera-v1";
const names = ["Câmera 1", "Câmera 2", "Câmera 3"];

function readRooms(): CameraRoom[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CameraRoom =>
      item && typeof item.id === "string" &&
      ["sendToken", "viewToken", "controlToken"].every((key) => typeof item[key] === "string") &&
      typeof item.name === "string" && typeof item.lanOnly === "boolean" && validFormat(item.format)
    ).slice(0, 3);
  } catch { return []; }
}

export default function MultiStudio() {
  const [rooms, setRooms] = useState<CameraRoom[]>(readRooms);
  const [connection, setConnection] = useState<Record<string, Connection>>({});
  const [format, setFormat] = useState<VideoFormat>({ ...defaultFormat });
  const [lanOnly, setLanOnly] = useState(false);
  const [imageQuality, setImageQuality] = useState<ImageQuality>("maximum");
  const [studioKey, setStudioKey] = useState(readStudioKey);
  const [creating, setCreating] = useState(false);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState("");
  const [qrs, setQrs] = useState<Record<string, string>>({});

  const save = (next: CameraRoom[]) => {
    setRooms(next);
    try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Browser storage unavailable. */ }
  };

  const invite = (room: CameraRoom) =>
    location.origin + "/send/" + room.id + cameraQualityQuery(room.imageQuality ?? "maximum", room.lanOnly) + "#token=" + room.sendToken;
  const view = (room: CameraRoom) =>
    obsLink(location.origin + "/view/" + room.id + (room.lanOnly ? "?lan=1" : "") + "#token=" + room.viewToken, true);
  const studio = (room: CameraRoom) =>
    location.origin + "/studio/" + room.id + (room.lanOnly ? "?lan=1" : "") + "#token=" + room.controlToken;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const entries = await Promise.all(rooms.map(async (room) => {
        try {
          const response = await fetch("/api/sessions/" + room.id, {
            headers: { Authorization: "Bearer " + room.controlToken },
            signal: controller.signal,
          });
          if (response.status === 404) return [room.id, { senderConnected: false, viewerConnected: false, expired: true }] as const;
          if (!response.ok) throw new Error("Status indisponível");
          const data = await response.json() as Connection;
          return [room.id, { senderConnected: !!data.senderConnected, viewerConnected: !!data.viewerConnected }] as const;
        } catch {
          return [room.id, { senderConnected: false, viewerConnected: false }] as const;
        }
      }));
      if (!cancelled) {
        setConnection(Object.fromEntries(entries));
        timer = setTimeout(refresh, 2500);
      }
    }
    void refresh();
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [rooms]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(rooms.map(async (room) => {
      try {
        const src = await QRCode.toDataURL(invite(room), { width: 180, margin: 2 });
        return [room.id, src] as const;
      } catch { return [room.id, ""] as const; }
    })).then((entries) => {
      if (!cancelled) setQrs(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [rooms]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (rooms.length >= 3 || !validFormat(format)) return;
    setError("");
    setCreating(true);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Rheo-Studio-Key": studioKey },
        body: JSON.stringify({ format, managed: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível criar a sala.");
      saveStudioKey(studioKey);
      const keys = data as SessionKeys;
      const name = names.find((candidate) => !rooms.some((room) => room.name === candidate)) || names[rooms.length];
      const next = [...rooms, { ...keys, name, format: { ...format }, lanOnly, imageQuality }];
      save(next);
      setNotice("Sala criada. Compartilhe o convite da câmera e adicione a fonte no OBS.");
    } catch (e) {
      setError((e as Error).message);
    } finally { setCreating(false); }
  }

  async function control(room: CameraRoom, action: "end" | "release-viewer") {
    setWorking(room.id);
    setError("");
    try {
      const response = await fetch("/api/sessions/" + room.id + "/" + action, {
        method: "POST",
        headers: { Authorization: "Bearer " + room.controlToken },
      });
      if (!response.ok) throw new Error((await response.json()).error || "Ação indisponível.");
      setPreview((old) => old === room.id ? "" : old);
      if (action === "end") save(rooms.filter((item) => item.id !== room.id));
      setNotice(action === "end" ? "Sala encerrada." : "Receptor liberado.");
    } catch (e) {
      setError((e as Error).message);
    } finally { setWorking(""); }
  }

  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice("Link copiado."); }
    catch { setError("Não foi possível copiar. Selecione o campo e copie manualmente."); }
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">r</span> rheo</a>
        <span className="status">Central multicâmera · até 3 salas</span>
      </header>
      <main className="operator multi-operator">
        <div className="page-heading">
          <div>
            <h1>Suas câmeras, uma produção.</h1>
            <p>Cada câmera possui um convite e uma fonte Navegador independente no OBS.</p>
          </div>
          <a className="button" href="/">Sala individual</a>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {rooms.length < 3 && (
          <form className="room-setup multi-setup" onSubmit={create}>
            <h2>Adicionar {names.find((candidate) => !rooms.some((room) => room.name === candidate)) || names[rooms.length]}</h2>
            <label htmlFor="multi-key">Chave do operador (quando configurada)</label>
            <input id="multi-key" type="password" autoComplete="off" value={studioKey}
              onChange={(e) => setStudioKey(e.target.value)} placeholder="Chave definida no servidor" />
            <FormatFields value={format} onChange={setFormat} />
            <label className="lan-option" htmlFor="multi-image-quality">
              <input id="multi-image-quality" type="checkbox" checked={imageQuality === "maximum"} onChange={(e) => setImageQuality(e.target.checked ? "maximum" : "balanced")} />
              <span>Priorizar qualidade máxima<small>Full HD e bitrate mais alto quando a rede permitir.</small></span>
            </label>
            <label className="lan-option" htmlFor="multi-lan">
              <input id="multi-lan" type="checkbox" checked={lanOnly} onChange={(e) => setLanOnly(e.target.checked)} />
              <span>Somente LAN<small>Celular e OBS na mesma rede, sem rota de mídia via TURN.</small></span>
            </label>
            <button className="primary" disabled={creating}>
              {creating ? "Criando sala…" : "Adicionar câmera"}
            </button>
          </form>
        )}
        <section className="multi-grid" aria-label="Salas de câmeras">
          {rooms.map((room) => {
            const status = connection[room.id];
            const watching = preview === room.id;
            return (
              <article className="multi-card" key={room.id}>
                <div className="multi-card-heading">
                  <div><h2>{room.name}</h2><small>{room.format.width} × {room.format.height} · {room.imageQuality === "balanced" ? "Equilibrado" : "Máxima qualidade"} · {room.lanOnly ? "LAN" : "WebRTC"}</small></div>
                  <span className={status?.expired ? "multi-bad" : status?.senderConnected ? "multi-ok" : "multi-idle"}>
                    {status?.expired ? "Expirada" : status?.senderConnected ? "Câmera conectada" : "Aguardando câmera"}
                  </span>
                </div>
                <div className="multi-card-stats">
                  <span>Transmissor: {status?.senderConnected ? "conectado" : "desconectado"}</span>
                  <span>Receptor: {status?.viewerConnected ? "ocupado" : "livre"}</span>
                </div>
                {qrs[room.id] && <img src={qrs[room.id]} alt={"QR code da " + room.name} width="180" height="180" className="multi-qr" />}
                <label>Convite da câmera</label>
                <input readOnly value={invite(room)} onFocus={(e) => e.target.select()} />
                <button onClick={() => copy(invite(room))}>Copiar convite</button>
                <label>Fonte Navegador do OBS</label>
                <input readOnly value={view(room)} onFocus={(e) => e.target.select()} />
                <button onClick={() => copy(view(room))}>Copiar link para OBS</button>
                <div className="multi-card-actions">
                  <button disabled={!status?.senderConnected || (!!status?.viewerConnected && !watching)}
                    onClick={() => setPreview((old) => old === room.id ? "" : room.id)}>
                    {watching ? "Fechar prévia" : "Conferir prévia"}
                  </button>
                  <button disabled={working === room.id || !status?.viewerConnected}
                    onClick={() => control(room, "release-viewer")}>Liberar receptor</button>
                </div>
                {watching && (
                  <iframe title={"Prévia da " + room.name} src={view(room)} allow="autoplay"
                    style={{ width: "100%", aspectRatio: String(room.format.width) + "/" + String(room.format.height), border: 0 }} />
                )}
                <div className="multi-card-footer">
                  <button onClick={() => copy(studio(room))}>Copiar painel individual</button>
                  <button className="danger" disabled={working === room.id}
                    onClick={() => control(room, "end")}>Encerrar sala</button>
                </div>
              </article>
            );
          })}
        </section>
        {rooms.length === 0 && <p>Crie a primeira sala para começar. Os links de controle ficam guardados apenas nesta aba do navegador.</p>}
        <p className="small">As prévias ocupam a vaga de recepção. Feche uma prévia antes de conectar a fonte correspondente no OBS. Guarde os links individuais do operador para recuperar o acesso após fechar esta aba.</p>
      </main>
    </>
  );
}
