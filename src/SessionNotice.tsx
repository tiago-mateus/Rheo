import type { AccessIssue } from "../shared/protocol";

interface Props {
  issue: AccessIssue;
  receiver: boolean;
  status: string;
  error: string;
  notice: string;
  link: string;
  onRetry: () => void;
  onCancel: () => void;
  onCopy: () => void;
}
export default function SessionNotice({
  issue,
  receiver,
  status,
  error,
  notice,
  link,
  onRetry,
  onCancel,
  onCopy,
}: Props) {
  const title =
    issue === "busy"
      ? "Este link já está em uso"
      : issue === "expired"
        ? "Este link não está mais disponível"
        : "Recepção liberada";
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            r
          </span>
          rheo
        </a>
        <span className="status">{status}</span>
      </header>
      <main className="access-screen">
        <h1>{title}</h1>
        {issue === "busy" ? (
          <>
            <p>
              {receiver
                ? "Há outro navegador ou OBS recebendo esta câmera. Este acesso está em espera e vai conectar automaticamente quando a vaga ficar livre."
                : "Esta câmera já está transmitindo em outra aba ou aparelho. A captura deste acesso foi desligada para evitar conflito."}
            </p>
            <p>
              {receiver
                ? "O acesso atual continua funcionando. Você pode fechá-lo ou usar Liberar receptor no aparelho que transmite."
                : "Volte à aba original para controlar a transmissão, ou feche-a antes de tentar novamente aqui."}
            </p>
            <div className="access-actions">
              <button className="primary" onClick={onRetry}>
                Tentar novamente
              </button>
              {receiver && <button onClick={onCancel}>Cancelar espera</button>}
            </div>
          </>
        ) : issue === "expired" ? (
          <>
            <p role="alert">
              O link é inválido, expirou ou o servidor foi reiniciado.{" "}
              {receiver
                ? "Peça um novo link de recepção a quem está transmitindo."
                : "Crie uma nova transmissão e compartilhe o novo link."}
            </p>
            <div className="access-actions">
              <a className="button primary" href="/">
                {receiver ? "Voltar ao início" : "Criar nova transmissão"}
              </a>
            </div>
          </>
        ) : (
          <>
            <p>
              Este navegador não está mais recebendo a câmera e não vai
              reconectar sozinho. A vaga está disponível para o OBS ou outro
              computador.
            </p>
            {link && (
              <>
                <label htmlFor="handoff-link">Link para OBS</label>
                <div className="link-field">
                  <input
                    id="handoff-link"
                    readOnly
                    value={link}
                    onFocus={(event) => event.target.select()}
                  />
                  <button onClick={onCopy}>Copiar link para OBS</button>
                </div>
                <ol>
                  <li>
                    No OBS, adicione uma fonte <strong>Navegador</strong>.
                  </li>
                  <li>Cole o link acima e use 1280 × 720.</li>
                  <li>Mantenha a câmera de origem transmitindo.</li>
                </ol>
              </>
            )}
            <div className="access-actions">
              <button onClick={onRetry}>Voltar a assistir aqui</button>
              <a href="/">Voltar ao início</a>
            </div>
          </>
        )}
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
        <p className="access-footnote">
          Cada sessão aceita uma câmera e um receptor. O link de recepção é
          diferente do endereço da câmera.
        </p>
      </main>
    </>
  );
}
