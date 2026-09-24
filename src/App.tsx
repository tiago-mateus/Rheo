import { useEffect, useRef, useState } from "react";
import type { Role, SessionKeys } from "../shared/protocol";
import { RtcSession, type Stats } from "./rtc";
import { obsLink } from "./links";
type Route = { role: Role; id: string; token: string };
function currentRoute(): Route | null {
  const match = location.pathname.match(/^\/(send|view)\/([^/]+)$/);
  return match
    ? {
        role: match[1] === "send" ? "sender" : "viewer",
        id: match[2],
        token: new URLSearchParams(location.hash.slice(1)).get("token") || "",
      }
    : null;
}
function cameraError(error: unknown) {
  const name = (error as DOMException).name;
  if (name === "NotAllowedError")
    return "Acesso à câmera ou ao microfone bloqueado. Permita o acesso na barra de endereço e tente novamente.";
  if (name === "NotFoundError")
    return "Não encontramos a câmera ou o microfone. Conecte o dispositivo ou escolha Sem áudio.";
  if (name === "NotReadableError")
    return "A câmera está ocupada ou indisponível. Feche outros aplicativos que a utilizam e tente novamente.";
  return "Não foi possível abrir a câmera. Confira o dispositivo e tente novamente.";
}
function CameraIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="12" height="12" rx="3" />
      <path d="m15 10 6-3v10l-6-3" />
    </svg>
  );
}
export default function App() {
  const [route, setRoute] = useState(currentRoute);
  const [status, setStatus] = useState("Pronto para começar");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [active, setActive] = useState(false);
  const [ended, setEnded] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [camera, setCamera] = useState("");
  const [microphone, setMicrophone] = useState("");
  const [viewToken, setViewToken] = useState(() => {
    try {
      return route ? sessionStorage.getItem("rheo-view-" + route.id) || "" : "";
    } catch {
      return "";
    }
  });
  const [hasTurn, setHasTurn] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats>({});
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [clean, setClean] = useState(
    new URLSearchParams(location.search).get("clean") === "1",
  );
  const video = useRef<HTMLVideoElement>(null);
  const local = useRef<MediaStream | null>(null);
  const call = useRef<RtcSession | null>(null);
  const role = route?.role || "sender";
  const receiver = role === "viewer";
  const relay = new URLSearchParams(location.search).get("relay") === "1";
  const viewLink =
    route && viewToken
      ? location.origin +
        "/view/" +
        route.id +
        (relay ? "?relay=1" : "") +
        "#token=" +
        viewToken
      : "";
  function attach(stream: MediaStream | null) {
    if (!video.current) return;
    video.current.srcObject = stream;
    if (stream)
      void video.current.play().catch(() => {
        if (receiver) setAudioBlocked(true);
      });
  }
  function finish() {
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    attach(null);
    setPrepared(false);
    setActive(false);
    setEnded(true);
    setStatus("Encerrada");
    setNotice("Transmissão encerrada.");
    setAudioBlocked(false);
  }
  function connect(stream: MediaStream | null) {
    if (!route) return;
    setError("");
    setActive(true);
    const client = new RtcSession(
      route.id,
      route.token,
      role,
      stream,
      {
        status: setStatus,
        error: setError,
        remote: (s) => {
          if (receiver) attach(s);
        },
        ended: finish,
        config: (c) => setHasTurn(c.hasTurn),
        stats: setStats,
      },
      relay,
    );
    call.current = client;
    client.connect();
  }
  useEffect(() => {
    if (route?.role === "viewer") connect(null);
    return () => {
      call.current?.dispose();
      call.current = null;
      local.current?.getTracks().forEach((t) => t.stop());
    };
  }, [route?.id, route?.role]);
  useEffect(() => {
    document.body.classList.toggle("clean", clean && receiver);
    return () => document.body.classList.remove("clean");
  }, [clean, receiver]);
  useEffect(() => {
    const enumerate = () => {
      void navigator.mediaDevices
        ?.enumerateDevices()
        .then(setDevices)
        .catch(() => {});
    };
    enumerate();
    navigator.mediaDevices?.addEventListener("devicechange", enumerate);
    return () =>
      navigator.mediaDevices?.removeEventListener("devicechange", enumerate);
  }, []);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sessions", { method: "POST" });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível criar a sessão.");
      const keys = data as SessionKeys;
      try {
        sessionStorage.setItem("rheo-view-" + keys.id, keys.viewToken);
      } catch {}
      history.pushState(
        null,
        "",
        "/send/" + keys.id + "#token=" + keys.sendToken,
      );
      setRoute({ role: "sender", id: keys.id, token: keys.sendToken });
      setViewToken(keys.viewToken);
      setStatus("Prepare sua câmera");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare() {
    setBusy(true);
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "A câmera exige HTTPS ou localhost. No celular, execute npm run dev:https e abra o endereço de rede indicado no terminal.",
      );
      setBusy(false);
      return;
    }
    local.current?.getTracks().forEach((t) => t.stop());
    local.current = null;
    setPrepared(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
          ...(camera
            ? { deviceId: { exact: camera } }
            : { facingMode: "environment" }),
        },
        audio:
          microphone === "none"
            ? false
            : {
                echoCancellation: true,
                noiseSuppression: true,
                ...(microphone ? { deviceId: { exact: microphone } } : {}),
              },
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
      local.current = stream;
      attach(stream);
      setDevices(await navigator.mediaDevices.enumerateDevices());
      setPrepared(true);
      setStatus("Câmera preparada");
      for (const track of stream.getTracks())
        track.onended = () => {
          setError(
            "A captura foi interrompida pelo dispositivo. Encerre a sessão e crie uma nova transmissão.",
          );
        };
    } catch (e) {
      setError(cameraError(e));
    } finally {
      setBusy(false);
    }
  }
  function reconnect() {
    // A new session controller must not stop the sender's existing tracks.
    if (receiver) {
      call.current?.dispose();
      connect(null);
    } else {
      call.current?.dispose();
      call.current = null;
      local.current = null;
      attach(null);
      setActive(false);
      setPrepared(false);
      setStatus("Prepare sua câmera");
      setError("");
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Link copiado.");
    } catch {
      setNotice("Selecione o link acima e copie manualmente.");
    }
  }
  function toggleClean() {
    const next = !clean;
    setClean(next);
    const url = new URL(location.href);
    if (next) url.searchParams.set("clean", "1");
    else url.searchParams.delete("clean");
    history.replaceState(null, "", url);
  }
  async function enableAudio() {
    if (video.current) {
      video.current.muted = false;
      try {
        await video.current.play();
        setAudioBlocked(false);
      } catch {
        setError(
          "Não foi possível reproduzir o áudio. Confira as permissões do navegador.",
        );
      }
    }
  }
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Rheo, início">
          <span className="brand-mark" aria-hidden="true">
            r
          </span>
          rheo<span className="version">local / 0.1</span>
        </a>
        <span className="top-label">Sua câmera. Em qualquer cena.</span>
        <span className="status">
          <i className={status === "Conectado" ? "online" : ""} />
          {status}
        </span>
      </header>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <h1>
              {receiver
                ? "Receber transmissão"
                : route
                  ? "Sua câmera, conectada."
                  : "A próxima cena começa aqui."}
            </h1>
            <p>
              {receiver
                ? "Uma imagem limpa, pronta para entrar na sua produção."
                : "Envie câmera e áudio direto para outro navegador ou para o OBS."}
            </p>
          </div>
          <span className="session-label">
            {route
              ? "Sessão " + route.id.slice(0, 6).toUpperCase()
              : "Uma câmera · Um receptor"}
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        <div className="studio">
          <section className="monitor-section" aria-label="Monitor da câmera">
            <div className="monitor">
              <video
                ref={video}
                autoPlay
                playsInline
                muted={!receiver}
                aria-label={receiver ? "Vídeo recebido" : "Prévia da câmera"}
              />
              {!prepared && !receiver && (
                <div className="empty-monitor">
                  <CameraIcon />
                  <h2>
                    {ended ? "Até a próxima cena." : "Sua imagem aparece aqui"}
                  </h2>
                  <p>
                    {route
                      ? "Prepare a câmera antes de entrar ao vivo."
                      : "Crie uma transmissão para conectar sua câmera."}
                  </p>
                </div>
              )}
              {receiver && status !== "Conectado" && (
                <div className="empty-monitor">
                  <CameraIcon />
                  <h2>{ended ? "Transmissão encerrada." : status}</h2>
                  <p>
                    {ended
                      ? "O transmissor encerrou esta sessão."
                      : "Mantenha esta página aberta. A imagem aparece quando a câmera conectar."}
                  </p>
                </div>
              )}
              <div className="monitor-top">
                <span className="monitor-tag">
                  {receiver ? "RECEPÇÃO" : "PRÉVIA LOCAL"}
                </span>
                {prepared && (
                  <span className="monitor-tag">
                    {active ? "TRANSMITINDO" : "NÃO ESTÁ TRANSMITINDO"}
                  </span>
                )}
              </div>
              {audioBlocked && (
                <button className="audio-unlock primary" onClick={enableAudio}>
                  Ativar áudio
                </button>
              )}
            </div>
            <div className="transport">
              <span>
                {receiver
                  ? "Áudio e vídeo recebidos"
                  : prepared
                    ? "Prévia sem retorno de áudio"
                    : "Câmera e microfone desligados"}
              </span>
              <div className="transport-actions">
                {!route && (
                  <button className="primary" disabled={busy} onClick={create}>
                    {busy ? "Criando…" : "Criar transmissão"}
                  </button>
                )}
                {route && !receiver && !ended && !active && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={prepared ? () => connect(local.current) : prepare}
                  >
                    {busy
                      ? "Abrindo câmera…"
                      : prepared
                        ? "Iniciar transmissão"
                        : "Preparar câmera"}
                  </button>
                )}
                {active && !receiver && (
                  <>
                    <button
                      onClick={() => {
                        const next = !muted;
                        local.current
                          ?.getAudioTracks()
                          .forEach((t) => (t.enabled = !next));
                        setMuted(next);
                      }}
                      disabled={!local.current?.getAudioTracks().length}
                    >
                      {muted ? "Ativar microfone" : "Silenciar"}
                    </button>
                    <button
                      className="danger"
                      onClick={() => call.current?.end()}
                    >
                      Encerrar transmissão
                    </button>
                  </>
                )}
                {receiver && !ended && (
                  <button onClick={toggleClean}>Modo OBS</button>
                )}
                {ended && (
                  <a className="button primary" href="/">
                    Nova transmissão
                  </a>
                )}
              </div>
            </div>
            <dl className="telemetry">
              <div>
                <dt>Conexão</dt>
                <dd>{stats.route || "—"}</dd>
              </div>
              <div>
                <dt>Vídeo</dt>
                <dd>{stats.resolution || "—"}</dd>
              </div>
              <div>
                <dt>Quadros/s</dt>
                <dd>{stats.fps !== undefined ? Math.round(stats.fps) : "—"}</dd>
              </div>
              <div>
                <dt>Bitrate</dt>
                <dd>
                  {stats.bitrate !== undefined
                    ? (stats.bitrate / 1000).toFixed(2) + " Mbps"
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>RTT de rede</dt>
                <dd>{stats.rtt !== undefined ? stats.rtt + " ms" : "—"}</dd>
              </div>
            </dl>
            <p className="stats-note">
              Métricas aparecem durante a conexão. RTT mede ida e volta na rede,
              não o atraso total do vídeo.
            </p>
          </section>
          <aside className="side-panel">
            {!receiver ? (
              <>
                <section>
                  <h2>Fonte de vídeo</h2>
                  <p>Uma boa cena começa com a fonte certa.</p>
                  <label htmlFor="camera">Câmera</label>
                  <select
                    id="camera"
                    value={camera}
                    disabled={active || busy}
                    onChange={(e) => {
                      setCamera(e.target.value);
                      if (prepared) {
                        local.current?.getTracks().forEach((t) => t.stop());
                        local.current = null;
                        attach(null);
                        setPrepared(false);
                      }
                    }}
                  >
                    <option value="">Câmera padrão</option>
                    {devices
                      .filter((d) => d.kind === "videoinput")
                      .map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || "Câmera " + (i + 1)}
                        </option>
                      ))}
                  </select>
                  <label htmlFor="microphone">Microfone</label>
                  <select
                    id="microphone"
                    value={microphone}
                    disabled={active || busy}
                    onChange={(e) => {
                      setMicrophone(e.target.value);
                      if (prepared) {
                        local.current?.getTracks().forEach((t) => t.stop());
                        local.current = null;
                        attach(null);
                        setPrepared(false);
                      }
                    }}
                  >
                    <option value="">Microfone padrão</option>
                    <option value="none">Sem áudio</option>
                    {devices
                      .filter((d) => d.kind === "audioinput")
                      .map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId}>
                          {d.label || "Microfone " + (i + 1)}
                        </option>
                      ))}
                  </select>
                  <div className="quality">
                    <span>Qualidade solicitada</span>
                    <strong>720p / 30 fps</strong>
                  </div>
                  <p className="small">
                    A qualidade real depende da câmera e da conexão. Mantenha
                    esta página em primeiro plano no celular.
                  </p>
                </section>
                <section>
                  <h2>Conectar o receptor</h2>
                  {viewLink ? (
                    <>
                      <label htmlFor="view-link">Link de recepção</label>
                      <div className="link-field">
                        <input
                          id="view-link"
                          readOnly
                          value={viewLink}
                          onFocus={(e) => e.target.select()}
                        />
                        <button onClick={() => copy(viewLink)}>
                          Copiar link
                        </button>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => copy(obsLink(viewLink))}
                      >
                        Copiar link para OBS
                      </button>
                      <p className="small">
                        Quem tem o link pode assistir. Use em um receptor por
                        vez.
                      </p>
                    </>
                  ) : (
                    <p>O link aparece depois que você criar a transmissão.</p>
                  )}
                </section>
              </>
            ) : (
              <section>
                <h2>Recepção pronta para OBS</h2>
                <p>
                  Use o modo OBS para mostrar apenas a imagem, sem os controles.
                </p>
                <button className="full" onClick={() => copy(location.href)}>
                  Copiar endereço atual
                </button>
                <p className="small">
                  Feche este receptor antes de abrir o mesmo link no OBS.
                </p>
              </section>
            )}
            <section className="instructions">
              <h2>{receiver ? "Durante a transmissão" : "Como usar no OBS"}</h2>
              {receiver ? (
                <p>
                  Se a imagem parar, confira a câmera de origem e tente
                  reconectar.
                </p>
              ) : (
                <ol>
                  <li>Prepare e inicie a câmera.</li>
                  <li>Copie o link para OBS.</li>
                  <li>
                    No OBS, adicione uma fonte <strong>Navegador</strong> e cole
                    o endereço.
                  </li>
                </ol>
              )}
              {active && !ended && (
                <button className="full" onClick={reconnect}>
                  Reconectar
                </button>
              )}
              <div className="connection-note">
                <span className="connection-dot" />
                <p>
                  {hasTurn === true
                    ? "TURN disponível para redes que bloqueiam conexões diretas."
                    : hasTurn === false
                      ? "Conexão direta. TURN não configurado; algumas redes podem não conectar."
                      : "Vídeo entre dispositivos, sem gravação no servidor."}
                </p>
              </div>
            </section>
          </aside>
        </div>
        <footer>
          <span>Rheo · Estúdio remoto</span>
          <span>Feito para deixar a imagem fluir.</span>
        </footer>
      </main>
      {receiver && clean && (
        <button className="exit-clean" onClick={toggleClean}>
          Mostrar controles
        </button>
      )}
    </>
  );
}
