# Videoke Tizen Web App (`videoke-app`)

## Overview
Aplicativo nativo Tizen Web (`.wgt`, ID `lilvideoke.Videoke`) para Smart TV Samsung (Tizen 6.5, 1920x1080). Gerencia a tela de espera com QR Code dinâmico, transição com contagem regressiva de 15 segundos dividida em 2 colunas (cantor atual à esquerda e fila seguinte numerada à direita) sobre 13 wallpapers otimizados sorteados aleatoriamente, reprodução em tela cheia via ponte HTTPS do YouTube IFrame API, timeout automático de 60s em pausa (com aviso visual e bip sonoro nos últimos 10s) e sincronização em tempo real com o Firebase Realtime Database via Server-Sent Events (SSE).

## Interface
- `[js/config.js:window.VIDEOKE_CONFIG]`: Objeto de configuração central (`databaseUrl`, `roomId`, `mobileWebUrl`, `countdownSeconds`, `pauseTimeoutSeconds`, `pauseWarningSeconds`, `wallpapersCount`, `footerHideDelaySeconds`).
- `[js/app.js:window.App]`: Máquina de estados principal (`init`, `skipCurrent`, `restartCurrent`, `togglePlayPause`, `stop`, `resetQueue`, `exit`, `showFooter`, `hideFooter`, `showNotification`).
- `[js/firebase-sync.js:window.FirebaseSync]`: Cliente SSE e REST do Firebase (`init`, `connect`, `disconnect`, `updateSongStatus`, `updateCurrentSong`, `removeSong`, `clearQueue`).
- `[js/yt-player.js:window.YTPlayer]`: Wrapper do player YouTube via bridge HTTPS `postMessage` (`init`, `loadVideo`, `play`, `pause`, `stop`, `getPlayerState`, `destroy`).
- `[js/remote.js:window.Remote]`: Mapeamento de teclas do controle remoto Samsung Tizen (`init`, `keys`).
- `[js/qrcode.min.js:window.QRCode]`: Gerador local de QR Code em SVG/HTML.

## Invariants
- `[js/app.js:App.state]`: Permanece estritamente em um dos quatro estados finitos: `"IDLE"`, `"COUNTDOWN"`, `"PLAYING"` ou `"PAUSED"`.
- `[js/app.js:App._startCountdown]`: Ao iniciar os 15s de contagem regressiva, a música recebe imediatamente `status = "playing"` no Firebase, o botão `#btn-play-pause` assume o rótulo `Play` com foco automático (`focusedButtonIndex = 0`) e um dos 13 wallpapers (`img/wallpapers/wp_01..13.jpg`) é sorteado sem repetição imediata.
- `[js/app.js:App._onCurrentSongCompleted]`: Ao concluir, pular ou parar uma música, seu registro é excluído (`DELETE`) de `/rooms/<roomId>/queue/<key>.json`.
- `[js/app.js:App._startPauseTimer]`: Em `PAUSED`, um timer de 60 segundos emite aviso visual (`#pause-timeout-banner`) e bip sonoro via singleton `AudioContext` nos últimos 10 segundos e avança automaticamente na fila ao zerar.
- `[js/yt-player.js:YTPlayer.init]`: Erros de bloqueio de incorporação do YouTube (`101`, `150`, `153`) nunca travam a sessão; disparam `onError`, removem a faixa e avançam automaticamente.

## Side Effects
- Abre conexão persistente HTTP SSE (`EventSource`) em `/rooms/<roomId>/queue.json` no Firebase Realtime Database.
- Executa requisições `PATCH`, `PUT` e `DELETE` em `/rooms/<roomId>/queue/<key>.json` e `/rooms/<roomId>/current.json`.
- Instancia um único `AudioContext` (Web Audio API) para síntese de bips de alerta durante o timeout de pausa.
- Registra teclas de mídia no hardware da TV via `tizen.tvinputdevice.registerKey`.

## Verification
- Run: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\06-instalar-videoke.ps1`
