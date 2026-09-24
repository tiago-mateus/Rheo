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

## Teste após deploy

1. Abra /api/health: deve responder {"ok":true}.
2. Abra o endereço HTTPS do serviço no celular e crie uma transmissão.
3. Prepare e inicie a câmera; abra o link de recepção no computador.
4. Confirme áudio/vídeo e encerramento.
5. Se a página abrir mas a mídia não conectar entre redes, configure TURN pelas variáveis documentadas no README.

As sessões ficam na memória e os links expiram quando o processo reinicia. O plano gratuito pode suspender por inatividade e demorar a despertar. Não habilite múltiplas instâncias neste MVP. O deploy não inclui um servidor TURN e não contrata serviços pagos.
