# Publicar o Rheo no Render

Repositório: https://github.com/tiago-mateus/Rheo

## Blueprint

O arquivo `render.yaml` configura um único Web Service Node no plano **free**, com frontend e backend juntos.
No Render, abra **New > Blueprint**, conecte o repositório e aplique a configuração.

## Configuração manual equivalente

- Tipo: Web Service (não Static Site).
- Runtime: Node; NODE_VERSION=24.
- Build: `npm ci --include=dev && npm run build`.
- Start: `npm start`.
- Health check: `/api/health`.
- Plano: Free, uma instância.
- NODE_ENV=production.

Render fornece PORT e RENDER_EXTERNAL_URL automaticamente. O app usa RENDER_EXTERNAL_URL para validar a origem da API e do WebSocket atrás do proxy HTTPS. Não use --https no Render: o certificado é gerenciado pela plataforma. Com domínio próprio, configure PUBLIC_ORIGIN=https://seu-dominio e use esse endereço nos dois aparelhos.

## Segurança e recuperação

**Recomendado antes de abrir o serviço ao público:** configure `RHEO_STUDIO_KEY` no painel de variáveis de ambiente do Render (24 caracteres ou mais, gerada aleatoriamente). Quando não há chave configurada, a criação de salas continua pública (com rate limit) para não interromper instalações existentes; o servidor registra um aviso. Com chave configurada, a API exige autenticação e retorna 401 quando o segredo enviado está incorreto. Não coloque esse segredo no repositório, em links ou em um `VITE_*`. Insira-o no campo "Chave do operador" ao criar a sala; o navegador o mantém somente no sessionStorage da aba. Render Blueprints solicita a chave `sync: false` durante o provisionamento. Revogar a chave atual impede **novas criações** depois de reiniciar, mas não revoga os links de salas já existentes. Os links /studio/, /send/ e /view/ são credenciais de acesso: compartilhe cada um apenas com seu público autorizado.

O `RHEO_TRUST_PROXY=1` habilita a identificação do IP de cliente por um proxy confiável (Render), para o rate limit. Não configure isso caso o Node seja acessível diretamente pela internet.

**Persistência de salas:** para uma instância única com disco persistente configure `RHEO_SESSION_FILE=/caminho/duravel/sessions.json`. O arquivo contém tokens ativos em texto simples e deve permanecer restrito ao processo (permissões 0600 em POSIX). O Rheo grava snapshots por rename atômico e restaura as salas ainda válidas, com conexões inicialmente desconectadas. Reiniciar o processo interrompe as conexões WebSocket, que precisam se reconectar; não é failover sem interrupção. Não use o mesmo arquivo entre várias instâncias e não use um filesystem efêmero para depender da restauração.

**Render Free:** o disco local é efêmero e o blueprint não possui disco persistente: os links ainda serão perdidos após um novo deploy/restart. A persistência em arquivo é indicada para instalação local ou servidor com armazenamento durável. Para disponibilidade em várias instâncias é necessária outra camada de persistência e coordenação (Redis ou banco), além de gerenciamento de sockets. O health check indica apenas que o processo está respondendo.

## Central multicâmera

Abra `/multi`, informe a chave e crie até três salas. Cada uma recebe um convite de transmissor e uma URL de fonte Navegador para o OBS. Adicione **três fontes Navegador separadas** no OBS com os respectivos links. Cada fonte ocupa o único receptor de sua sala; abrir a prévia da mesma sala ao mesmo tempo gera indicação de vaga ocupada. Para ver a prévia, libere antes a fonte correspondente no OBS. As salas da central são lembradas somente no sessionStorage da aba; copie também os links individuais de operador se quiser recuperar o controle após fechá-la. Não há SFU nem composição de múltiplas câmeras no servidor: a troca de cenas é feita pelo OBS.

## Teste após deploy

1. Abra /api/health: deve responder {"ok":true}.
2. Abra o endereço HTTPS do serviço no celular e crie uma transmissão.
3. Prepare e inicie a câmera; abra o link de recepção no computador.
4. Confirme áudio/vídeo e encerramento.
5. Se a página abrir mas a mídia não conectar entre redes, configure TURN pelas variáveis documentadas no README.

As sessões ficam na memória e os links expiram quando o processo reinicia. O plano gratuito pode suspender por inatividade e demorar a despertar. Não habilite múltiplas instâncias neste MVP. O deploy não inclui um servidor TURN e não contrata serviços pagos.
