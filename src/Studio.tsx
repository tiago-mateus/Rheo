import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { defaultFormat, validFormat, type VideoFormat } from "../shared/video";
import type { SessionKeys } from "../shared/protocol";
import FormatFields from "./FormatFields";

type State = {
  format: VideoFormat;
  senderConnected: boolean;
  viewerConnected: boolean;
  sendToken: string;
  viewToken: string;
};
export default function Studio() {
  const [id, setId] = useState(
    location.pathname.match(/^\/studio\/([^/]+)/)?.[1] || "",
  );
  const [token, setToken] = useState(
    new URLSearchParams(location.hash.slice(1)).get("token") || "",
  );
  const [format, setFormat] = useState<VideoFormat>({ ...defaultFormat });
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [preview, setPreview] = useState(false);
  const [qr, setQr] = useState("");
  const invite = state
    ? `${location.origin}/send/${id}#token=${state.sendToken}`
    : "";
  const view = state
    ? `${location.origin}/view/${id}?clean=1#token=${state.viewToken}`
    : "";
  useEffect(() => {
    if (!id || !token || expired) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/sessions/" + id, {
          headers: { Authorization: "Bearer " + token },
          signal: abort.signal,
        });
        if (cancelled) return;
        if (response.status === 404) {
          setExpired(true);
          setPreview(false);
          setState(null);
          return;
        }
        if (!response.ok)
          throw new Error(
            "Não foi possível atualizar a sala. Tentando novamente…",
          );
        const data = (await response.json()) as State;
        if (!data.sendToken || !data.viewToken) {
          setExpired(true);
          return;
        }
        if (cancelled) return;
        setState(data);
        setFormat(data.format);
        setError("");
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled) timer = setTimeout(refresh, 2000);
    }
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      abort.abort();
    };
  }, [id, token, expired]);
  useEffect(() => {
    let cancelled = false;
    if (invite)
      void QRCode.toDataURL(invite, {
        width: 256,
        margin: 4,
        errorCorrectionLevel: "M",
      })
        .then((url) => {
          if (!cancelled) setQr(url);
        })
        .catch(() => {
          if (!cancelled)
            setNotice("QR code indisponível. Use o convite abaixo.");
        });
    return () => {
      cancelled = true;
    };
  }, [invite]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!validFormat(format)) {
      setError(
        "Use dimensões pares entre 240 e 1920, com no máximo 2.073.600 pixels (Full HD).",
      );
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, managed: true }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Não foi possível criar a sala.");
      const keys = data as SessionKeys;
      history.pushState(
        null,
        "",
        `/studio/${keys.id}#token=${keys.controlToken}`,
      );
      setState({
        ...keys,
        format,
        senderConnected: false,
        viewerConnected: false,
      });
      setId(keys.id);
      setToken(keys.controlToken);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(label + " copiado.");
    } catch {
      setNotice("Selecione o endereço no campo e copie manualmente.");
    }
  }
  async function action(name: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/sessions/${id}/${name}`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      if (!response.ok)
        throw new Error(
          (await response.json()).error || "Não foi possível completar a ação.",
        );
      setPreview(false);
      if (name === "end") {
        setExpired(true);
        setState(null);
      } else setNotice("Recepção liberada. O OBS pode conectar agora.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function handoff() {
    setPreview(false);
    void copy(view, "Link para OBS");
  }
  const unavailable = expired || (!!id && !token);
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            r
          </span>
          rheo
        </a>
        <span className="status">
          {id ? "Painel do operador" : "Câmera remota para OBS"}
        </span>
      </header>
      <main className="operator">
        {unavailable ? (
          <section className="room-unavailable">
            <h1>Sala encerrada ou indisponível</h1>
            <p>
              Os links deixam de funcionar quando a sala expira ou o servidor
              reinicia. Crie uma nova sala e envie outro convite.
            </p>
            <a className="button primary" href="/">
              Criar nova sala
            </a>
          </section>
        ) : !id ? (
          <>
            <div className="page-heading">
              <div>
                <h1>Sua produção começa aqui.</h1>
                <p>
                  Escolha o formato, convide uma câmera e leve a imagem para o
                  OBS.
                </p>
              </div>
            </div>
            <div className="setup-layout">
              <form className="room-setup" onSubmit={create}>
                <h2>Como a imagem deve chegar?</h2>
                <FormatFields value={format} onChange={setFormat} />
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                <button className="primary full" disabled={busy}>
                  {busy ? "Criando sala…" : "Criar sala para OBS"}
                </button>
                <a className="camera-start" href="/?camera=1">
                  Quero transmitir pelo celular
                </a>
              </form>
              <section className="format-guide" aria-label="Formato de saída">
                <div
                  className="format-outline"
                  style={{
                    aspectRatio: `${format.width || 1} / ${format.height || 1}`,
                    width: `${Math.min(480, (280 * (format.width || 1)) / (format.height || 1))}px`,
                  }}
                >
                  <span>
                    {format.width || "—"} × {format.height || "—"}
                  </span>
                  <span>
                    {format.width > format.height
                      ? "Horizontal"
                      : format.width < format.height
                        ? "Vertical"
                        : "Quadrado"}
                  </span>
                </div>
                <h2>
                  Um convite para a câmera.
                  <br />
                  Um link para o OBS.
                </h2>
                <p>
                  Quem filma abre o convite no celular e prepara a câmera. Você
                  acompanha a conexão por aqui e recebe a imagem no OBS.
                </p>
              </section>
            </div>
          </>
        ) : !state ? (
          <p role="status">{error || "Carregando sala…"}</p>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <h1>Convide sua câmera.</h1>
                <p>
                  Este painel pode continuar aberto enquanto o OBS recebe o
                  vídeo.
                </p>
              </div>
              <span className="room-format">
                {format.width} × {format.height} · 30 fps
                <br />
                {format.fit === "contain"
                  ? "Imagem inteira"
                  : "Preencher com corte"}
              </span>
            </div>
            <div className="connection-strip" aria-live="polite">
              <span className={state.senderConnected ? "connected" : ""}>
                {state.senderConnected
                  ? "Câmera conectada"
                  : "Aguardando câmera"}
              </span>
              <span className={state.viewerConnected ? "connected" : ""}>
                {state.viewerConnected
                  ? "Receptor conectado"
                  : "Recepção disponível"}
              </span>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="notice" role="status">
                {notice}
              </p>
            )}
            <div className="room-layout">
              <section className="invite-section">
                <h2>1. Convide quem vai filmar</h2>
                <p>Peça para ler o QR code ou envie o convite por mensagem.</p>
                <div className="invite-content">
                  {qr && (
                    <img
                      className="invite-qr"
                      src={qr}
                      alt="QR code do convite da câmera"
                      width="256"
                      height="256"
                    />
                  )}
                  <div>
                    <label htmlFor="invite">Convite da câmera</label>
                    <input
                      id="invite"
                      readOnly
                      value={invite}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      className="primary full"
                      onClick={() => copy(invite, "Convite da câmera")}
                    >
                      Copiar convite da câmera
                    </button>
                    <p className="small">
                      No celular: permitir câmera e microfone, conferir o
                      enquadramento e tocar em Iniciar transmissão.
                    </p>
                  </div>
                </div>
              </section>
              <section className="obs-section">
                <h2>2. Receba no OBS</h2>
                <p>
                  Adicione uma fonte <strong>Navegador</strong> e cole este
                  endereço.
                </p>
                <label htmlFor="obs-link">Link para OBS</label>
                <input
                  id="obs-link"
                  readOnly
                  value={view}
                  onFocus={(e) => e.target.select()}
                />
                <button className="full" onClick={handoff}>
                  {preview ? "Liberar para o OBS" : "Copiar link para OBS"}
                </button>
                <dl className="obs-dimensions">
                  <div>
                    <dt>Largura</dt>
                    <dd>{format.width}</dd>
                  </div>
                  <div>
                    <dt>Altura</dt>
                    <dd>{format.height}</dd>
                  </div>
                </dl>
                <p className="small">
                  Use essas dimensões na fonte Navegador. Para ocupar toda a
                  cena, use a mesma proporção na tela do OBS.
                </p>
              </section>
            </div>
            <section className="preview-section">
              <div className="preview-heading">
                <div>
                  <h2>Conferir antes de entrar no ar</h2>
                  <p>
                    {preview
                      ? "A prévia ocupa a recepção. Libere-a antes de usar o OBS."
                      : "Abrir a prévia usa a mesma vaga de vídeo do OBS."}
                  </p>
                </div>
                {!preview && (
                  <button
                    disabled={!state.senderConnected || state.viewerConnected}
                    onClick={() => setPreview(true)}
                  >
                    Conferir prévia
                  </button>
                )}
              </div>
              {preview && (
                <iframe
                  title="Prévia da transmissão"
                  src={view}
                  allow="autoplay"
                  style={{ aspectRatio: `${format.width} / ${format.height}` }}
                />
              )}
              {!preview && state.viewerConnected && (
                <p className="small">
                  Já existe um receptor conectado. Para trocar de aparelho, use
                  Liberar receptor abaixo.
                </p>
              )}
            </section>
            <footer className="room-footer">
              <p>
                Guarde o endereço desta página para voltar ao painel.
                Compartilhe apenas o convite da câmera ou o link para OBS.
              </p>
              <div className="access-actions">
                {state.viewerConnected && (
                  <button
                    disabled={busy}
                    onClick={() => action("release-viewer")}
                  >
                    Liberar receptor
                  </button>
                )}
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => action("end")}
                >
                  Encerrar sala
                </button>
              </div>
            </footer>
          </>
        )}
      </main>
    </>
  );
}
