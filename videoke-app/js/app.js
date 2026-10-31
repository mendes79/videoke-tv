(function(window) {
  "use strict";

  var MAX_VISIBLE_COUNTDOWN_QUEUE = 7;

  var App = {
    state: "IDLE", // IDLE, COUNTDOWN, PLAYING, PAUSED
    currentSong: null,
    pendingQueue: [],
    countdownTimer: null,
    countdownSeconds: 15,
    pauseTimer: null,
    pauseSecondsRemaining: 60,
    footerHideTimer: null,
    focusedButtonIndex: 0,
    buttons: [],
    lastWallpaperIndex: -1,
    audioCtx: null,

    init: function() {
      var self = this;
      var cfg = window.VIDEOKE_CONFIG || {};

      this.roomId = cfg.roomId || "tv_sala_mendes";
      this.databaseUrl = cfg.databaseUrl || "";
      this.mobileWebUrl = cfg.mobileWebUrl || "https://videoke-tv.web.app";
      this.countdownInitial = cfg.countdownSeconds || 15;
      this.pauseTimeoutInitial = cfg.pauseTimeoutSeconds || 60;
      this.pauseWarningThreshold = cfg.pauseWarningSeconds || 10;
      this.wallpapersCount = cfg.wallpapersCount || 13;
      this.footerHideDelay = (cfg.footerHideDelaySeconds || 5) * 1000;

      this.dom = {
        idleScreen: document.getElementById("idle-screen"),
        countdownScreen: document.getElementById("countdown-screen"),
        countdownQueueList: document.getElementById("countdown-queue-list"),
        countdownQueueCount: document.getElementById("countdown-queue-count"),
        countdownQueueMore: document.getElementById("countdown-queue-more"),
        miniQrOverlay: document.getElementById("mini-qr-overlay"),
        miniQrBox: document.getElementById("mini-qr-box"),
        pauseTimeoutBanner: document.getElementById("pause-timeout-banner"),
        pauseTimeoutSec: document.getElementById("pause-timeout-sec"),
        footerBar: document.getElementById("footer-bar"),
        btnPlayPause: document.getElementById("btn-play-pause"),
        timerDisplay: document.getElementById("timer-display"),
        nextSinger: document.getElementById("next-singer"),
        nextSongTitle: document.getElementById("next-song-title"),
        nowPlayingTitle: document.getElementById("now-playing-title"),
        upNextTitle: document.getElementById("up-next-title"),
        notificationBanner: document.getElementById("notification-banner"),
        qrBox: document.getElementById("qr-box"),
        roomTag: document.getElementById("room-tag")
      };

      this.buttons = Array.prototype.slice.call(document.querySelectorAll(".btn-ctrl"));
      this._updateButtonFocus();

      // Renderiza QR Code principal (IDLE) e Mini QR Code (canto inferior esquerdo nos videos)
      this._renderQRCode();

      // Garante barra de menu visivel na tela inicial (IDLE)
      this.showFooter(true);

      // Inicializa o Player do YouTube (via bridge HTTPS)
      window.YTPlayer.init({
        onReady: function() {
          console.log("[App] YouTube Player Bridge carregado e pronto.");
        },
        onEnded: function() {
          console.log("[App] Musica finalizada pelo player.");
          self._onCurrentSongCompleted();
        },
        onError: function(code, reason) {
          console.warn("[App] Erro capturado no player:", code, reason);
          self.showNotification("Aviso: " + reason, 4000);
          self._onCurrentSongSkipped("error_" + code);
        }
      });

      // Inicializa mapeamento do controle remoto
      window.Remote.init({
        onEnter: function() { return self._handleEnter(); },
        onBack: function() { return self._handleBack(); },
        onLeft: function() { return self._moveFocus(-1); },
        onRight: function() { return self._moveFocus(1); },
        onUp: function() { self.showFooter(); return true; },
        onDown: function() { self.showFooter(); return true; },
        onPlayPause: function() { self.togglePlayPause(); return true; },
        onStop: function() { self.stop(); return true; },
        onNext: function() { self.skipCurrent(); return true; },
        onPrev: function() { self.restartCurrent(); return true; }
      });

      // Binds de clique nos botoes do rodape
      this.dom.btnPlayPause.addEventListener("click", function() { self.togglePlayPause(); });
      document.getElementById("btn-stop").addEventListener("click", function() { self.stop(); });
      document.getElementById("btn-prev").addEventListener("click", function() { self.restartCurrent(); });
      document.getElementById("btn-next").addEventListener("click", function() { self.skipCurrent(); });
      document.getElementById("btn-reset").addEventListener("click", function() { self.resetQueue(); });
      document.getElementById("btn-exit").addEventListener("click", function() { self.exit(); });

      // Clicar na tela de contagem pula o timer para tocar na hora
      this.dom.countdownScreen.addEventListener("click", function() {
        self._skipCountdown();
      });

      // Inicializa sincronizacao em tempo real com o Firebase
      window.FirebaseSync.init({
        databaseUrl: this.databaseUrl,
        roomId: this.roomId
      }, {
        onQueueChanged: function(fullQueue) {
          self._handleRemoteQueueChanged(fullQueue);
        },
        onConnectionStatus: function(status) {
          if (status === "connected") {
            console.log("[App] Firebase conectado com sucesso.");
          } else if (status === "reconnecting") {
            console.log("[App] Reconectando ao Firebase...");
          }
        },
        onError: function(msg) {
          self.showNotification(msg, 5000);
        }
      });
    },

    _renderQRCode: function() {
      var mobileUrl = this.mobileWebUrl + "?room=" + encodeURIComponent(this.roomId);
      if (this.dom.roomTag) {
        this.dom.roomTag.textContent = "SALA: " + this.roomId;
      }
      if (this.dom.qrBox && window.QRCode) {
        this.dom.qrBox.innerHTML = "";
        try {
          new window.QRCode(this.dom.qrBox, {
            text: mobileUrl,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.M
          });
        } catch (e) {
          console.error("[App] Erro ao desenhar QR Code:", e);
        }
      }
      if (this.dom.miniQrBox && window.QRCode) {
        this.dom.miniQrBox.innerHTML = "";
        try {
          new window.QRCode(this.dom.miniQrBox, {
            text: mobileUrl,
            width: 100,
            height: 100,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: window.QRCode.CorrectLevel.M
          });
        } catch (e) {
          console.error("[App] Erro ao desenhar Mini QR Code:", e);
        }
      }
    },

    // Sorteia um dos 13 wallpapers sem repetir o imediatamente anterior
    _applyRandomCountdownWallpaper: function() {
      var count = this.wallpapersCount || 13;
      var idx = Math.floor(Math.random() * count) + 1;
      if (count > 1 && idx === this.lastWallpaperIndex) {
        idx = (idx % count) + 1;
      }
      this.lastWallpaperIndex = idx;
      var num = (idx < 10 ? "0" : "") + idx;
      var url = "img/wallpapers/wp_" + num + ".jpg";
      this.dom.countdownScreen.style.backgroundImage =
        "linear-gradient(135deg, rgba(8, 10, 18, 0.72), rgba(8, 10, 18, 0.84)), url('" + url + "')";
    },

    // Renderiza a coluna direita da tela de contagem regressiva (1, 2, 3...)
    _renderCountdownQueueList: function() {
      if (!this.dom.countdownQueueList) return;
      var currentKey = this.currentSong && this.currentSong.key;
      var upcoming = this.pendingQueue.filter(function(item) {
        return item.status === "pending" && (!currentKey || item.key !== currentKey);
      });

      var total = upcoming.length;
      if (this.dom.countdownQueueCount) {
        this.dom.countdownQueueCount.textContent = total === 1 ? "1 na espera" : (total + " na espera");
      }

      this.dom.countdownQueueList.innerHTML = "";

      if (total === 0) {
        var emptyEl = document.createElement("div");
        emptyEl.className = "queue-empty-state";
        emptyEl.innerHTML = "Nenhuma música na sequência.<br>Aponte a câmera para o QR Code durante o vídeo para pedir a próxima!";
        this.dom.countdownQueueList.appendChild(emptyEl);
        if (this.dom.countdownQueueMore) {
          this.dom.countdownQueueMore.classList.add("hidden");
        }
        return;
      }

      var visibleItems = upcoming.slice(0, MAX_VISIBLE_COUNTDOWN_QUEUE);
      for (var i = 0; i < visibleItems.length; i++) {
        var item = visibleItems[i];
        var row = document.createElement("div");
        row.className = "queue-table-row" + (i === 0 ? " first-up" : "");

        var singerName = (item.singer_name || "Cantor").slice(0, 25);
        var songTitle = item.title || "Música";

        row.innerHTML =
          '<div class="queue-row-idx">' + (i + 1) + '</div>' +
          '<div class="queue-row-singer"></div>' +
          '<div class="queue-row-song"></div>';

        row.querySelector(".queue-row-singer").textContent = singerName;
        row.querySelector(".queue-row-song").textContent = songTitle;
        this.dom.countdownQueueList.appendChild(row);
      }

      if (this.dom.countdownQueueMore) {
        var extra = total - visibleItems.length;
        if (extra > 0) {
          this.dom.countdownQueueMore.textContent = "+ " + extra + (extra === 1 ? " música aguardando na fila" : " músicas aguardando na fila");
          this.dom.countdownQueueMore.classList.remove("hidden");
        } else {
          this.dom.countdownQueueMore.classList.add("hidden");
        }
      }
    },

    // Tratamento de novas atualizacoes vindas da fila do Firebase
    _handleRemoteQueueChanged: function(fullQueue) {
      this.pendingQueue = (fullQueue || []).filter(function(item) {
        return item.status === "pending";
      });

      this._updateFooterTitles();

      if (this.state === "COUNTDOWN") {
        this._renderCountdownQueueList();
      }

      // Se a TV estiver em IDLE e uma musica nova entrar na fila, inicia contagem regressiva
      if (this.state === "IDLE" && this.pendingQueue.length > 0) {
        var nextSong = this.pendingQueue[0];
        this._startCountdown(nextSong);
      }
    },

    _startCountdown: function(song) {
      var self = this;
      this._clearPauseTimer();
      this.currentSong = song;
      this.state = "COUNTDOWN";
      this.countdownSeconds = this.countdownInitial;

      // Ao entrar na contagem regressiva, a musica ja recebe status "playing" no Firebase
      song.status = "playing";
      if (song.key) {
        window.FirebaseSync.updateSongStatus(song.key, "playing");
      }

      // Sorteia wallpaper aleatorio entre as 13 imagens otimizadas
      this._applyRandomCountdownWallpaper();

      this.dom.nextSinger.textContent = (song.singer_name || "Proximo Cantor").slice(0, 25);
      this.dom.nextSongTitle.textContent = song.title || "Musica Selecionada";
      this.dom.timerDisplay.textContent = this.countdownSeconds;

      // Atualiza rotulo do botao para Play e coloca o foco automatico nele (para OK iniciar na hora)
      this._setPlayPauseButtonLabel("play");
      this.focusedButtonIndex = 0;
      this._updateButtonFocus();

      this._renderCountdownQueueList();

      this.dom.idleScreen.style.display = "none";
      this.dom.countdownScreen.style.display = "flex";
      this._setMiniQrVisible(false);

      // Mantem a barra de menu sempre visivel na tela de contagem regressiva
      this._updateFooterTitles();
      this.showFooter(true);

      // Atualiza no /current do Firebase
      window.FirebaseSync.updateCurrentSong({
        queue_id: song.key || song.id || "",
        video_id: song.video_id,
        title: song.title,
        singer_name: (song.singer_name || "").slice(0, 25),
        status: "playing",
        started_at: Date.now()
      });

      this._clearCountdown();
      this.countdownTimer = setInterval(function() {
        self.countdownSeconds--;
        if (self.countdownSeconds <= 0) {
          self._skipCountdown();
        } else {
          self.dom.timerDisplay.textContent = self.countdownSeconds;
        }
      }, 1000);
    },

    _skipCountdown: function() {
      this._clearCountdown();
      this.dom.countdownScreen.style.display = "none";
      if (this.currentSong) {
        this._playCurrent();
      }
    },

    _clearCountdown: function() {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    },

    _playCurrent: function() {
      if (!this.currentSong) return;
      var song = this.currentSong;

      this._clearPauseTimer();
      this.state = "PLAYING";
      this.dom.idleScreen.style.display = "none";
      this.dom.countdownScreen.style.display = "none";
      this._setMiniQrVisible(true);

      // Assim que o video inicia, o botao vira "Pausa"
      this._setPlayPauseButtonLabel("pause");

      window.YTPlayer.loadVideo(song.video_id);
      this._updateFooterTitles();
      this.showFooter(false);

      if (song.key) {
        window.FirebaseSync.updateSongStatus(song.key, "playing");
      }
      window.FirebaseSync.updateCurrentSong({
        queue_id: song.key || song.id || "",
        video_id: song.video_id,
        title: song.title,
        singer_name: (song.singer_name || "").slice(0, 25),
        status: "playing",
        started_at: Date.now()
      });
    },

    // Ao terminar a musica, exclui (DELETE) do Firebase e avanca para a proxima
    _onCurrentSongCompleted: function() {
      this._clearPauseTimer();
      var finishedKey = this.currentSong && this.currentSong.key;
      if (finishedKey) {
        window.FirebaseSync.removeSong(finishedKey);
      }
      this._advanceToNext(finishedKey);
    },

    // Ao pular a musica (manual, erro de embed ou timeout de pausa), exclui (DELETE) do Firebase e avanca
    _onCurrentSongSkipped: function(reason) {
      this._clearPauseTimer();
      var skippedKey = this.currentSong && this.currentSong.key;
      if (skippedKey) {
        window.FirebaseSync.removeSong(skippedKey);
      }
      this._advanceToNext(skippedKey);
    },

    _advanceToNext: function(excludeKey) {
      this._clearCountdown();
      this._clearPauseTimer();
      this.currentSong = null;

      var remaining = this.pendingQueue.filter(function(item) {
        return item.status === "pending" && (!excludeKey || item.key !== excludeKey);
      });

      if (remaining.length > 0) {
        this._startCountdown(remaining[0]);
      } else {
        this.stop();
      }
    },

    skipCurrent: function() {
      if (this.state === "PLAYING" || this.state === "PAUSED" || this.state === "COUNTDOWN") {
        this._onCurrentSongSkipped("remote_skip");
      }
    },

    restartCurrent: function() {
      if (this.currentSong && (this.state === "PLAYING" || this.state === "PAUSED")) {
        this._clearPauseTimer();
        this.state = "PLAYING";
        this._setPlayPauseButtonLabel("pause");
        window.YTPlayer.loadVideo(this.currentSong.video_id);
        this.showFooter(false);
      }
    },

    togglePlayPause: function() {
      if (this.state === "COUNTDOWN") {
        // Durante a contagem regressiva, o botao funciona como Play para iniciar imediatamente
        this._skipCountdown();
      } else if (this.state === "PLAYING") {
        window.YTPlayer.pause();
        this.state = "PAUSED";
        this._setPlayPauseButtonLabel("play");
        this.showFooter(true);
        this._startPauseTimer();
      } else if (this.state === "PAUSED") {
        this._clearPauseTimer();
        window.YTPlayer.play();
        this.state = "PLAYING";
        this._setPlayPauseButtonLabel("pause");
        this.showFooter(false);
      }
    },

    _setPlayPauseButtonLabel: function(mode) {
      if (!this.dom.btnPlayPause) return;
      if (mode === "pause") {
        this.dom.btnPlayPause.innerHTML = "<span>&#10074;&#10074;</span> Pausa";
      } else {
        this.dom.btnPlayPause.innerHTML = "<span>&#9658;</span> Play";
      }
    },

    // Timer de 60 segundos em PAUSED com contagem + bip nos ultimos 10 segundos
    _startPauseTimer: function() {
      var self = this;
      this._clearPauseTimer();
      this.pauseSecondsRemaining = this.pauseTimeoutInitial;

      this.pauseTimer = setInterval(function() {
        if (self.state !== "PAUSED") {
          self._clearPauseTimer();
          return;
        }
        self.pauseSecondsRemaining--;

        if (self.pauseSecondsRemaining <= 0) {
          self._clearPauseTimer();
          self.showNotification("Tempo de pausa esgotado (60s). Avançando na fila...", 3500);
          self._onCurrentSongSkipped("pause_timeout_60s");
          return;
        }

        if (self.pauseSecondsRemaining <= self.pauseWarningThreshold) {
          if (self.dom.pauseTimeoutBanner && self.dom.pauseTimeoutSec) {
            self.dom.pauseTimeoutSec.textContent = self.pauseSecondsRemaining;
            self.dom.pauseTimeoutBanner.classList.remove("hidden");
          }
          self._playBeep(self.pauseSecondsRemaining === 1 ? 1046.5 : 880);
        }
      }, 1000);
    },

    _clearPauseTimer: function() {
      if (this.pauseTimer) {
        clearInterval(this.pauseTimer);
        this.pauseTimer = null;
      }
      if (this.dom && this.dom.pauseTimeoutBanner) {
        this.dom.pauseTimeoutBanner.classList.add("hidden");
      }
    },

    // Emite um bip sonoro curto e discreto via Web Audio API (singleton AudioContext)
    _playBeep: function(freq) {
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!this.audioCtx) {
          this.audioCtx = new AudioCtx();
        }
        if (this.audioCtx.state === "suspended") {
          this.audioCtx.resume();
        }
        var now = this.audioCtx.currentTime;
        var osc = this.audioCtx.createOscillator();
        var gain = this.audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq || 880, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } catch (e) {}
    },

    stop: function() {
      this._clearCountdown();
      this._clearPauseTimer();
      window.YTPlayer.stop();

      // Se havia uma musica ativa (status "playing"), remove do Firebase para nao ficar orfa
      if (this.currentSong && this.currentSong.key) {
        window.FirebaseSync.removeSong(this.currentSong.key);
      }

      this.state = "IDLE";
      this.currentSong = null;

      this._setPlayPauseButtonLabel("play");
      this.dom.countdownScreen.style.display = "none";
      this.dom.idleScreen.style.display = "flex";
      this._setMiniQrVisible(false);
      this._updateFooterTitles();
      this.showFooter(true);

      window.FirebaseSync.updateCurrentSong(null);
    },

    resetQueue: function() {
      var self = this;
      this.pendingQueue = [];
      this.currentSong = null;
      this.stop();
      window.FirebaseSync.clearQueue(function() {
        self.showNotification("Fila reiniciada! Todas as músicas foram removidas.", 3500);
      });
    },

    exit: function() {
      this._clearCountdown();
      this._clearPauseTimer();
      window.FirebaseSync.disconnect();
      if (window.tizen && window.tizen.application) {
        try {
          window.tizen.application.getCurrentApplication().exit();
        } catch (e) {
          window.close();
        }
      } else {
        window.location.reload();
      }
    },

    _setMiniQrVisible: function(visible) {
      if (!this.dom.miniQrOverlay) return;
      this.dom.miniQrOverlay.classList.toggle("hidden", !visible);
      this._syncMiniQrPosition();
    },

    _syncMiniQrPosition: function() {
      if (!this.dom.miniQrOverlay) return;
      var footerVisible = this.dom.footerBar.classList.contains("visible");
      this.dom.miniQrOverlay.classList.toggle("footer-open", footerVisible);
    },

    showFooter: function(keepVisible) {
      var self = this;
      this.dom.footerBar.classList.add("visible");
      this._syncMiniQrPosition();
      if (this.footerHideTimer) clearTimeout(this.footerHideTimer);

      // Em IDLE, COUNTDOWN e PAUSED, a barra fica sempre visivel
      var shouldStayVisible = keepVisible || this.state === "IDLE" || this.state === "COUNTDOWN" || this.state === "PAUSED";
      if (!shouldStayVisible) {
        this.footerHideTimer = setTimeout(function() {
          if (self.state === "PLAYING") {
            self.dom.footerBar.classList.remove("visible");
            self._syncMiniQrPosition();
          }
        }, this.footerHideDelay);
      }
    },

    hideFooter: function() {
      if (this.state === "IDLE" || this.state === "COUNTDOWN" || this.state === "PAUSED") {
        this.showFooter(true);
        return;
      }
      if (this.footerHideTimer) clearTimeout(this.footerHideTimer);
      this.dom.footerBar.classList.remove("visible");
      this._syncMiniQrPosition();
    },

    showNotification: function(msg, duration) {
      var banner = this.dom.notificationBanner;
      banner.textContent = msg;
      banner.classList.add("show");
      setTimeout(function() {
        banner.classList.remove("show");
      }, duration || 3500);
    },

    _updateFooterTitles: function() {
      if (this.currentSong) {
        this.dom.nowPlayingTitle.textContent =
          "Tocando: " + (this.currentSong.singer_name || "").slice(0, 25) + " - " + (this.currentSong.title || "");
      } else {
        this.dom.nowPlayingTitle.textContent = "Videoke Pronto (Fila Vazia)";
      }

      if (this.pendingQueue.length > 0) {
        var currentKey = this.currentSong && this.currentSong.key;
        var upcoming = this.pendingQueue.filter(function(item) {
          return item.status === "pending" && (!currentKey || item.key !== currentKey);
        });
        var nextItem = upcoming[0];
        if (nextItem) {
          this.dom.upNextTitle.textContent = "A seguir: " + (nextItem.singer_name || "").slice(0, 25) + " - " + nextItem.title;
        } else {
          this.dom.upNextTitle.textContent = "A seguir: Fim da fila (Aguardando musicas)";
        }
      } else {
        this.dom.upNextTitle.textContent = "A seguir: Fim da fila (Aponte o celular e peca)";
      }
    },

    _moveFocus: function(delta) {
      if (!this.dom.footerBar.classList.contains("visible")) {
        this.showFooter();
        return true;
      }
      this.focusedButtonIndex = (this.focusedButtonIndex + delta + this.buttons.length) % this.buttons.length;
      this._updateButtonFocus();
      this.showFooter();
      return true;
    },

    _updateButtonFocus: function() {
      for (var i = 0; i < this.buttons.length; i++) {
        if (i === this.focusedButtonIndex) {
          this.buttons[i].classList.add("focused");
          this.buttons[i].focus();
        } else {
          this.buttons[i].classList.remove("focused");
        }
      }
    },

    _handleEnter: function() {
      if (this.dom.footerBar.classList.contains("visible")) {
        var btn = this.buttons[this.focusedButtonIndex];
        if (btn) {
          btn.click();
          return true;
        }
      } else {
        this.showFooter();
        return true;
      }
      return false;
    },

    _handleBack: function() {
      if (this.state === "PLAYING" && this.dom.footerBar.classList.contains("visible")) {
        this.hideFooter();
        return true;
      }
      if (this.state === "PLAYING" || this.state === "PAUSED" || this.state === "COUNTDOWN") {
        this.stop();
        return true;
      }
      this.exit();
      return true;
    }
  };

  window.App = App;
  window.addEventListener("DOMContentLoaded", function() {
    App.init();
  });
})(window);
