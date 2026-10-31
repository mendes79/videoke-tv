# Videoke Mobile Web SPA (`videoke-mobile`)

## Overview
Aplicação Web Mobile (SPA) com interface de alta visibilidade (fontes ampliadas para leitura confortável sem óculos para o público 40+) acessada via leitura do QR Code exibido na TV. Permite aos participantes identificar seu nome (até 25 caracteres), pesquisar vídeos de karaokê/videokê por texto ou comando de voz (Web Speech API) usando a YouTube Data API v3, enfileirar músicas em tempo real no Firebase Realtime Database com botão compacto de seta (`↑`), visualizar a fila completa da TV com destaque para suas músicas e cancelar suas próprias músicas pendentes.

## Interface
- `[js/app.js:window.MobileApp]`: Controlador mobile (`init`, `performSearch`, `enqueueSong`, `cancelOwnPendingSong`, `openQueueView`, `closeQueueView`, `showToast`).
- `[js/youtube.js:window.YouTubeSearch]`: Cliente de busca da YouTube Data API v3 com cache em memória (`search`).
- `[js/speech.js:window.SpeechSearch]`: Wrapper de reconhecimento de voz via Web Speech API (`isSupported`, `init`, `toggle`).
- `[yt-bridge.html:window.onYouTubeIframeAPIReady]`: Ponte HTTPS hospedada no Firebase Hosting para embutir o player IFrame do YouTube na TV Tizen com `Origin` e `Referer` válidos via `postMessage`.

## Invariants
- `[js/app.js:MAX_ACTIVE_SONGS_PER_USER]`: Cada participante (identificado por `karaoke_user_id` no `localStorage`) pode ter no máximo `2` músicas ativas simultâneas (`status === "pending"` ou `status === "playing"`) na fila da sala.
- `[js/app.js:MAX_SINGER_NAME_LEN]`: O nome do cantor (`singer_name`) é estritamente limitado a `25` caracteres.
- `[js/app.js:MobileApp.cancelOwnPendingSong]`: Um participante só pode excluir (`DELETE`) músicas cujo `user_id === this.userId` e cujo `status === "pending"` (músicas em `playing` no palco ou na contagem regressiva não podem ser removidas pelo celular).
- `[js/youtube.js:YouTubeSearch.search]`: Consultas à YouTube Data API v3 sempre anexam os termos `"karaoke videoke"`, filtram `type=video` e `videoEmbeddable=true`, limitam `maxResults=8` e armazenam resultados em `memoryCache`.

## Side Effects
- Lê e grava `karaoke_user_id`, `karaoke_singer_name`, `karaoke_room_id`, `karaoke_yt_key` e `karaoke_db_url` em `window.localStorage`.
- Abre conexão `EventSource` (SSE) em `/rooms/<roomId>/queue.json` e envia `POST` e `DELETE` HTTP no Firebase Realtime Database.
- Realiza chamadas HTTP `GET` para `https://www.googleapis.com/youtube/v3/search`.
- Solicita permissão de uso do microfone do navegador quando o botão de voz (`#btn-voice`) é acionado.

## Verification
- Run: `npx firebase-tools deploy --only hosting`
