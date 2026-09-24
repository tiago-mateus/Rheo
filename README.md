# Rheo

## Começar pelo computador do OBS

1. Abra o Rheo, escolha formato (horizontal, vertical, quadrado ou personalizado), resolução e enquadramento. Clique em **Criar sala para OBS**.
2. Envie o **Convite da câmera** para quem vai filmar, ou peça para ler o QR code. O QR é gerado no navegador; o convite não é enviado a um serviço externo.
3. No celular, permita câmera/microfone, confira a prévia e toque em **Iniciar transmissão**. **Parar câmera** libera os dispositivos sem encerrar a sala; é possível preparar e iniciar novamente com o mesmo convite.
4. No OBS, crie uma fonte **Navegador**, cole o **Link para OBS** e configure a largura e altura mostradas no painel. Para preencher a cena, a tela do OBS também deve ter a proporção desejada.
5. O painel pode ficar aberto. **Conferir prévia** ocupa temporariamente a vaga de recepção; **Liberar para o OBS** fecha essa prévia e copia o link. **Encerrar sala**, no painel, invalida os convites e interrompe a transmissão.

O endereço `/studio/…` é privado do operador. Compartilhe apenas o convite `/send/…` ou o link `/view/…`. Os três acessos têm credenciais separadas. Para começar pelo celular, use **Quero transmitir pelo celular** na página inicial.

### Resolução e orientação

O formato é definido ao criar a sala: 720p, 1080p ou dimensões personalizadas pares (240–1920 por eixo, até 2.073.600 pixels). A saída mantém essas dimensões quando o celular gira. **Imagem inteira** acrescenta barras quando necessário; **Preencher** corta as bordas. Nenhum modo estica a imagem. Para uma cena horizontal ampla, filme com o celular deitado.

O enquadramento usa canvas no aparelho que filma, preservando o áudio original. Isso usa processamento/bateria do celular; não melhora os detalhes de uma câmera de resolução inferior. Mantenha a página em primeiro plano. A qualidade efetivamente recebida ainda depende da rede e do encoder do navegador. Para mudar o formato, crie outra sala. Sessões continuam em memória: reiniciar/deployar o servidor invalida os links.

MVP local de câmera remota: câmera e microfone → WebRTC → navegador ou OBS. Uma câmera e um receptor por sessão. Interface em português, sem cadastro e sem gravação no servidor.

## Começar no computador

Requer Node.js 22.12+ (validado com Node 24). Na pasta Rheo:

```powershell
npm install
npm run dev
```

Abra **http://localhost:3000** no Chrome ou Edge.

1. Clique em **Criar transmissão**.
2. Selecione câmera/microfone; **Sem áudio** permite testar só vídeo.
3. Clique em **Preparar câmera** e permita acesso.
4. Clique em **Iniciar transmissão**.
5. Copie o **Link de recepção** e abra em outra aba/janela.
6. Use fones ou silencie o receptor se testar os dois lados no mesmo computador.

A prévia local fica sem retorno de áudio. **Preparar câmera já liga a captura**, mas só **Iniciar transmissão** envia ao receptor. Encerrar transmissão libera os dispositivos e invalida a sessão. Fechar a página também libera a captura. Sessões expiram após quatro horas; reiniciar o servidor invalida todos os links.

## Celular e outro computador na mesma rede

Pare o servidor HTTP com Ctrl+C e execute:

```powershell
npm run dev:https
```

O terminal mostra endereços como **https://192.168.1.10:3000**. Abra o endereço de rede do computador **no celular**, crie a transmissão ali e copie o link para o computador receptor. Ambos devem acessar o mesmo endereço de rede; **localhost no celular aponta para o próprio celular**.

- Um certificado local de desenvolvimento é gerado em `.local/`. O navegador mostrará um aviso de certificado; aceite apenas para esse endereço local que você está testando, nos dois aparelhos. Alguns navegadores móveis exigem instalar e confiar no certificado `.local/cert.pem`, ou usar um endereço HTTPS com certificado confiável.
- Se a página não abrir, confira se os dispositivos estão na mesma rede, se o Wi-Fi não isola clientes e se o Firewall do Windows permite o Node.js na rede privada. O app não altera o firewall.
- Mantenha a tela do celular ligada e a página em primeiro plano.
- Se o IP do computador mudar e o certificado gerar erro de nome, pare o app e renomeie a pasta `.local`; o próximo início gera um certificado para os endereços atuais.
- Não há túnel público automático. Rede móvel fora do Wi-Fi exige um endereço público HTTPS para a sinalização, além de conectividade WebRTC.

## OBS

No transmissor, clique em **Copiar link para OBS**. No OBS:

1. Adicione uma fonte **Navegador**.
2. Cole o link completo, incluindo `#token=...`.
3. Use largura **1280**, altura **720**.
4. Confira o áudio no mixer; se desejar, habilite **Controlar áudio através do OBS** nas propriedades da fonte.

O modo OBS ocupa a tela com o vídeo. O botão **Mostrar controles** aparece ao passar o mouse no canto inferior direito ou ao focar com Tab. Se o navegador bloquear áudio, aparece **Ativar áudio**. O comportamento de autoplay depende da versão do navegador/OBS e precisa de teste no seu OBS.

**Feche o receptor do navegador antes de abrir o link no OBS**: o MVP aceita apenas um receptor. Certificados HTTPS locais podem ser rejeitados pelo navegador interno do OBS; teste com uma origem HTTPS confiável para os dois dispositivos. Para teste no mesmo computador, `http://localhost:3000` dispensa certificado.

## TURN e redes diferentes

Sem configuração adicional, o app usa STUN e tenta conexão direta. Isso não garante funcionamento em todas as redes.

Copie `.env.example` para `.env` e configure seu serviço TURN:

```dotenv
TURN_URLS=turn:seu-servidor:3478,turns:seu-servidor:5349
TURN_SECRET=segredo-de-autenticacao-rest-do-coturn
```

O servidor gera credenciais de quatro horas. Alternativamente, configure `TURN_USERNAME` e `TURN_PASSWORD` para um provedor que exija credenciais estáticas. Nunca publique `.env` ou o segredo TURN. As credenciais de acesso à mídia são necessariamente entregues ao navegador autenticado; o segredo REST permanece no servidor.

Reinicie o app depois de alterar o ambiente. Para testar TURN de forma forçada, adicione `?relay=1` antes do fragmento `#token=...` nas URLs de transmissão **e** recepção, antes de conectar. A interface informa quando não há TURN configurado. Nenhum serviço TURN pago foi contratado ou configurado automaticamente.

## Recuperação e métricas

- Sinalização: até cinco tentativas automáticas com espera progressiva.
- Mídia: transmissor tenta renegociar ICE quando a conexão falha.
- **Reconectar** no receptor reinicia a conexão. No transmissor, libera a captura; prepare e inicie novamente. O estado de microfone silenciado é preservado.
- Interface mostra bitrate, resolução, FPS, rota direta/TURN e RTT quando fornecidos pelo navegador. **RTT não mede latência total da câmera à tela.**
- Qualidade solicitada: 720p/30 fps, respeitando dispositivo e controle de congestionamento do WebRTC.

## Build e testes

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Para servir o build:

```powershell
npm run build
npm start
# Ou com o certificado HTTPS local:
npm start -- --https
```

Porta alternativa no PowerShell: `$env:PORT=3001`, depois inicie o comando escolhido. O servidor escuta nas interfaces locais para permitir acesso pela LAN.

## Estrutura

- `src/App.tsx`: fluxo de captura, recepção e controles.
- `src/rtc.ts`: negociação WebRTC, recuperação e estatísticas.
- `server/backend.ts`: HTTP e sinalização WebSocket autenticada.
- `server/sessions.ts`: sessões em memória, tokens, lotação e expiração.
- `server/ice.ts`: configuração STUN/TURN.
- `server/index.ts`: servidor local, Vite e HTTPS.
- `tests/`: testes de sessões, sinalização, links e navegador.

## Limites da versão

MVP de teste local, não um serviço público endurecido. Não inclui multicâmera, SFU, contas, gravação, medição automática de latência ponta a ponta ou suporte garantido a todos os navegadores. Chrome/Edge são os alvos iniciais. WebRTC e câmeras sintéticas são testados em Chromium; câmera física, estabilidade de 20 minutos, rede móvel, retransmissão TURN real e OBS precisam ser validados no seu ambiente.

## Publicação no Render

[Publicar no Render](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Ftiago-mateus%2FRheo)

O projeto inclui `render.yaml` para o plano gratuito. Consulte [o guia de deploy](docs/render.md). A origem HTTPS pública é detectada automaticamente no Render.

## Links ocupados e troca para o OBS

- **Link ocupado:** o segundo receptor vai para uma página de espera e tenta entrar automaticamente a cada três segundos. O receptor atual continua funcionando.
- **Liberar para o OBS:** no navegador receptor, copia o link limpo para OBS e libera a vaga. A página liberada não reconecta automaticamente, inclusive após recarregar.
- **Liberar receptor:** no aparelho transmissor, desconecta o receptor atual para liberar a vaga ao próximo acesso. A conexão liberada é lembrada para não voltar sozinha após uma queda de rede; uma nova tentativa explícita continua permitida.
- **Sessão expirada:** aparece uma página orientando a pedir um novo link ou criar outra transmissão. Reinícios e novos deploys ainda invalidam as sessões em memória; crie uma sessão nova após o deploy.
- Para assistir em outro computador, compartilhe **Link de recepção**, não a URL da câmera que começa com /send/.
