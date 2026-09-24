# Rheo — MVP local

Plano autorizado na conversa: uma câmera com áudio, um receptor por sessão, link para OBS, sinalização Node/WS, WebRTC direto e TURN configurável. TypeScript e React. Sem banco, gravação ou contas.

## Execução

- [x] Sessões: tokens por papel, isolamento, lotação, expiração e encerramento.
- [x] Servidor HTTP/HTTPS, WebSocket e configuração ICE.
- [x] Captura, negociação, recepção, recuperação e estatísticas.
- [x] Interface responsiva e modo OBS.
- [x] Testes de integração, navegador e build; instruções locais.

## Decisões

Projeto vazio, sem Git; implementar diretamente na pasta Rheo solicitada. Execução local autorizada pelo usuário; nenhuma publicação. HTTPS local com certificado de desenvolvimento; TURN externo requer configuração do usuário. Teste real de câmera física, rede móvel e OBS não pode ser substituído por câmera sintética do navegador.

## Verificação final
6 testes de lógica/sinalização passaram; 3 testes Chromium passaram (câmera sintética, recepção, reconexão preservando mute, reload, modo OBS, encerramento, mobile e receptor HTTP LAN). Build TypeScript/Vite passou. Endpoint HTTPS local respondeu 200. Revisão de código corrigiu mute em reconexão, URL OBS com relay e retomada de socket antigo. Fontes servidas localmente. Ainda sem teste de câmera física, OBS instalado, rede móvel, TURN real e sessão de 20 minutos.
