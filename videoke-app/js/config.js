(function(window) {
  "use strict";

  // Configuracoes centrais do Videoke
  // Substitua a URL do Firebase pelo endereco do seu projeto no Firebase Realtime Database
  window.VIDEOKE_CONFIG = {
    // URL base do Firebase Realtime Database (sem a barra no final)
    databaseUrl: "https://videoke-tv-default-rtdb.firebaseio.com",

    // Identificador fixo da sala desta TV
    roomId: "tv_sala_mendes",

    // URL publica do Web app mobile (onde o participante escolhe as musicas)
    // O parametro ?room=<roomId> sera adicionado automaticamente ao QR Code
    mobileWebUrl: "https://videoke-tv.web.app",

    // Tempo de contagem regressiva entre musicas em segundos
    countdownSeconds: 15,

    // Tempo maximo em pausa (segundos) antes de avancar automaticamente para a proxima musica
    pauseTimeoutSeconds: 60,

    // Segundos finais da pausa em que o aviso visual e o bip sonoro sao emitidos
    pauseWarningSeconds: 10,

    // Quantidade de wallpapers disponiveis em img/wallpapers/wp_01.jpg .. wp_13.jpg
    wallpapersCount: 13,

    // Tempo em segundos para a barra do rodape sumir automaticamente durante o video
    footerHideDelaySeconds: 5
  };
})(window);
