# Rheo

Ferramenta web para enviar câmera e microfone a um receptor ou OBS. MVP local de baixo custo solicitado pelo usuário. Uma câmera e um receptor por sessão. Idioma português. Sucesso: abrir câmera, copiar link, receber imagem e áudio e encerrar captura. Sem cadastro ou servidor de transcodificação. Assumimos Chrome/Edge desktop e Chrome Android para validação inicial.

Fluxo principal aprovado: operador cria sala no computador, escolhe formato/resolução/enquadramento, envia convite da câmera por QR code ou link e recebe no OBS. Painel de controle não ocupa a recepção; prévia é opt-in e precisa ser liberada para OBS. Convite permite iniciar/parar câmera, não encerrar sala. Operador conserva controle da sala. Fluxo alternativo: iniciar diretamente pelo celular em `/?camera=1`.

Saída com dimensões pares entre 240 e 1920 e área até Full HD; horizontal, vertical, quadrado e personalizado. Imagem inteira com barras ou corte central sem deformação. Enquadramento acontece no celular via canvas, sem transcodificação no servidor. O celular deve ficar com a página em primeiro plano. Formato definido ao criar a sala; alterar exige nova sala. Sessões seguem temporárias, até 4 horas ou reinício do servidor.
