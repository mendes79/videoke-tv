(function(window) {
  "use strict";

  var DEFAULT_DB_URL = "https://videoke-tv-default-rtdb.firebaseio.com";
  var DEFAULT_ROOM_ID = "tv_sala_mendes";
  var DEFAULT_YT_KEY = "AIzaSyDWUtJU25qhslnqi0DE4Dw83o95RK3CBac";
  var MAX_ACTIVE_SONGS_PER_USER = 2;
  var MAX_SINGER_NAME_LEN = 25;

  var MobileApp = {
    roomId: DEFAULT_ROOM_ID,
    databaseUrl: DEFAULT_DB_URL,
    youtubeApiKey: DEFAULT_YT_KEY,
    userId: "",
    singerName: "",
    activeUserSongs: [],
    pendingSongsList: [],
    playingSong: null,
    currentResults: [],
    eventSource: null,
    queueItemsMap: {},
    toastTimer: null,

    init: function() {
      this._loadParamsAndStorage();
      this._cacheDom();
      this._bindEvents();
      this._initSpeech();
      this._connectFirebaseSSE();
    },

    _loadParamsAndStorage: function() {
      var params = new URLSearchParams(window.location.search || "");
      this.roomId = params.get("room") || localStorage.getItem("karaoke_room_id") || DEFAULT_ROOM_ID;
      localStorage.setItem("karaoke_room_id", this.roomId);

      var storedUuid = localStorage.getItem("karaoke_user_id");
      if (!storedUuid) {
        storedUuid = "usr_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
        localStorage.setItem("karaoke_user_id", storedUuid);
      }
      this.userId = storedUuid;

      this.singerName = (localStorage.getItem("karaoke_singer_name") || "").slice(0, MAX_SINGER_NAME_LEN);
      this.databaseUrl = (localStorage.getItem("karaoke_db_url") || params.get("db") || DEFAULT_DB_URL).replace(/\/+$/, "");
      this.youtubeApiKey = localStorage.getItem("karaoke_yt_key") || params.get("key") || DEFAULT_YT_KEY;
    },

    _cacheDom: function() {
      this.dom = {
        mainView: document.getElementById("main-view"),
        queueView: document.getElementById("queue-view"),
        btnOpenQueue: document.getElementById("btn-open-queue"),
        btnOpenQueueInline: document.getElementById("btn-open-queue-inline"),
        btnCloseQueue: document.getElementById("btn-close-queue"),
        queueBadgeCount: document.getElementById("queue-badge-count"),
        queueViewSubtitle: document.getElementById("queue-view-subtitle"),
        queueViewPlaying: document.getElementById("queue-view-playing"),
        queueViewList: document.getElementById("queue-view-list"),
        roomBadge: document.getElementById("room-badge"),
        quotaCount: document.getElementById("quota-count"),
        quotaDot1: document.getElementById("quota-dot-1"),
        quotaDot2: document.getElementById("quota-dot-2"),
        quotaWarning: document.getElementById("quota-warning"),
        singerNameInput: document.getElementById("singer-name"),
        charCounter: document.getElementById("char-counter"),
        searchInput: document.getElementById("search-input"),
        btnVoice: document.getElementById("btn-voice"),
        btnSearch: document.getElementById("btn-search"),
        speechStatus: document.getElementById("speech-status"),
        connDot: document.getElementById("conn-dot"),
        nowPlayingBox: document.getElementById("now-playing-box"),
        mySongsList: document.getElementById("my-songs-list"),
        resultsSection: document.getElementById("results-section"),
        resultsTitle: document.getElementById("results-title"),
        resultsMeta: document.getElementById("results-meta"),
        resultsList: document.getElementById("results-list"),
        btnSettings: document.getElementById("btn-settings"),
        settingsModal: document.getElementById("settings-modal"),
        cfgYtKey: document.getElementById("cfg-yt-key"),
        cfgDbUrl: document.getElementById("cfg-db-url"),
        btnCloseSettings: document.getElementById("btn-close-settings"),
        btnSaveSettings: document.getElementById("btn-save-settings"),
        toast: document.getElementById("toast")
      };

      this.dom.roomBadge.textContent = "Sala: " + this.roomId;
      this.dom.singerNameInput.value = this.singerName;
      this._updateCharCounter();
    },

    _updateCharCounter: function() {
      if (this.dom.charCounter) {
        var len = (this.dom.singerNameInput.value || "").length;
        this.dom.charCounter.textContent = len + "/" + MAX_SINGER_NAME_LEN;
      }
    },

    _bindEvents: function() {
      var self = this;

      this.dom.singerNameInput.addEventListener("input", function() {
        if (this.value.length > MAX_SINGER_NAME_LEN) {
          this.value = this.value.slice(0, MAX_SINGER_NAME_LEN);
        }
        self.singerName = this.value.trim();
        localStorage.setItem("karaoke_singer_name", self.singerName);
        self._updateCharCounter();
      });

      this.dom.btnSearch.addEventListener("click", function() {
        self.performSearch();
      });

      this.dom.searchInput.addEventListener("keydown", function(e) {
        if (e.key === "Enter") {
          e.preventDefault();
          self.performSearch();
        }
      });

      this.dom.btnOpenQueue.addEventListener("click", function() {
        self.openQueueView();
      });

      this.dom.btnOpenQueueInline.addEventListener("click", function() {
        self.openQueueView();
      });

      this.dom.btnCloseQueue.addEventListener("click", function() {
        self.closeQueueView();
      });

      this.dom.btnSettings.addEventListener("click", function() {
        self.dom.cfgYtKey.value = self.youtubeApiKey;
        self.dom.cfgDbUrl.value = self.databaseUrl;
        self.dom.settingsModal.classList.remove("hidden");
      });

      this.dom.btnCloseSettings.addEventListener("click", function() {
        self.dom.settingsModal.classList.add("hidden");
      });

      this.dom.btnSaveSettings.addEventListener("click", function() {
        self.youtubeApiKey = self.dom.cfgYtKey.value.trim() || DEFAULT_YT_KEY;
        self.databaseUrl = (self.dom.cfgDbUrl.value.trim() || DEFAULT_DB_URL).replace(/\/+$/, "");
        localStorage.setItem("karaoke_yt_key", self.youtubeApiKey);
        localStorage.setItem("karaoke_db_url", self.databaseUrl);
        self.dom.settingsModal.classList.add("hidden");
        self.showToast("Configurações salvas!");
        self._connectFirebaseSSE();
      });
    },

    openQueueView: function() {
      this.dom.mainView.classList.add("hidden");
      this.dom.queueView.classList.remove("hidden");
      this._renderFullQueueView();
      window.scrollTo(0, 0);
    },

    closeQueueView: function() {
      this.dom.queueView.classList.add("hidden");
      this.dom.mainView.classList.remove("hidden");
    },

    _initSpeech: function() {
      var self = this;
      if (!window.SpeechSearch.isSupported()) {
        this.dom.btnVoice.style.display = "none";
        return;
      }

      window.SpeechSearch.init({
        onStart: function() {
          self.dom.btnVoice.classList.add("listening");
          self.dom.speechStatus.classList.remove("hidden");
        },
        onTranscript: function(text, isFinal) {
          self.dom.searchInput.value = text;
          if (isFinal && text) {
            self.performSearch();
          }
        },
        onError: function() {
          self.dom.btnVoice.classList.remove("listening");
          self.dom.speechStatus.classList.add("hidden");
          self.showToast("Não foi possível ouvir. Tente novamente.");
        },
        onEnd: function() {
          self.dom.btnVoice.classList.remove("listening");
          self.dom.speechStatus.classList.add("hidden");
        }
      });

      this.dom.btnVoice.addEventListener("click", function() {
        window.SpeechSearch.toggle();
      });
    },

    performSearch: function() {
      var self = this;
      var q = this.dom.searchInput.value.trim();
      if (!q) {
        this.showToast("Digite ou fale o nome de uma música para buscar.");
        this.dom.searchInput.focus();
        return;
      }

      this.dom.resultsSection.classList.remove("hidden");
      this.dom.resultsTitle.textContent = 'Resultados para "' + q + '"';
      this.dom.resultsMeta.textContent = "Buscando...";

      window.YouTubeSearch.search(q, this.youtubeApiKey, function(err, results, source) {
        if (err) {
          self.showToast(err.message);
        }
        self.dom.resultsMeta.textContent = source === "cache" ? "Cache" : (results.length + " vídeos");
        self._renderResults(results, true);
      });
    },

    _renderResults: function(list, showEmptyMessage) {
      var self = this;
      this.currentResults = list || [];
      this.dom.resultsList.innerHTML = "";

      if (!this.currentResults.length) {
        if (showEmptyMessage) {
          this.dom.resultsSection.classList.remove("hidden");
          var empty = document.createElement("div");
          empty.className = "queue-empty-msg";
          empty.textContent = "Nenhum vídeo encontrado para esta busca.";
          this.dom.resultsList.appendChild(empty);
        }
        return;
      }

      this.dom.resultsSection.classList.remove("hidden");
      var quotaReached = this.activeUserSongs.length >= MAX_ACTIVE_SONGS_PER_USER;

      this.currentResults.forEach(function(song) {
        var item = document.createElement("div");
        item.className = "song-item";

        var alreadyQueued = self.activeUserSongs.some(function(activeSong) {
          return activeSong.video_id === song.video_id;
        });

        var isDisabled = quotaReached || alreadyQueued;
        var disabledAttr = isDisabled ? "disabled" : "";
        var btnClass = "primary-btn send-btn" + (alreadyQueued ? " sent" : "");
        var btnSymbol = alreadyQueued ? "&#10003;" : "&#8593;";
        var btnTitle = alreadyQueued
          ? "Música já enviada para a fila"
          : (quotaReached ? "Limite de 2 músicas atingido" : "Enviar para a fila");

        item.innerHTML =
          '<img class="song-thumb" src="' + song.thumbnail + '" alt="">' +
          '<div class="song-details">' +
            '<div class="song-title"></div>' +
            '<div class="song-channel"></div>' +
          '</div>' +
          '<button type="button" class="' + btnClass + '" title="' + btnTitle + '" aria-label="' + btnTitle + '" ' + disabledAttr + '>' + btnSymbol + '</button>';

        item.querySelector(".song-title").textContent = song.title;
        item.querySelector(".song-channel").textContent = song.channel || "YouTube";

        var btn = item.querySelector(".send-btn");
        btn.addEventListener("click", function() {
          self.enqueueSong(song, btn);
        });

        self.dom.resultsList.appendChild(item);
      });
    },

    // Monitora a fila da sala via SSE no Firebase para atualizar a cota de 2 musicas em tempo real
    _connectFirebaseSSE: function() {
      var self = this;
      if (this.eventSource) {
        try { this.eventSource.close(); } catch (e) {}
        this.eventSource = null;
      }

      var queueUrl = this.databaseUrl + "/rooms/" + encodeURIComponent(this.roomId) + "/queue.json";

      try {
        this.eventSource = new window.EventSource(queueUrl);

        this.eventSource.addEventListener("open", function() {
          self.dom.connDot.classList.add("online");
        });

        this.eventSource.addEventListener("put", function(e) {
          try {
            var payload = JSON.parse(e.data);
            self._handlePut(payload);
          } catch (err) {}
        });

        this.eventSource.addEventListener("patch", function(e) {
          try {
            var payload = JSON.parse(e.data);
            self._handlePatch(payload);
          } catch (err) {}
        });

        this.eventSource.onerror = function() {
          self.dom.connDot.classList.remove("online");
        };
      } catch (e) {
        this._pollQueueFallback();
      }
    },

    _pollQueueFallback: function() {
      var self = this;
      var queueUrl = this.databaseUrl + "/rooms/" + encodeURIComponent(this.roomId) + "/queue.json";
      fetch(queueUrl)
        .then(function(r) { return r.json(); })
        .then(function(data) {
          self._handlePut({ path: "/", data: data });
        })
        .catch(function() {});
    },

    _handlePut: function(payload) {
      if (!payload) return;
      var path = payload.path || "/";
      var data = payload.data;

      if (path === "/") {
        this.queueItemsMap = {};
        if (data && typeof data === "object") {
          for (var k in data) {
            if (Object.prototype.hasOwnProperty.call(data, k) && data[k]) {
              data[k].key = k;
              this.queueItemsMap[k] = data[k];
            }
          }
        }
      } else {
        var cleanKey = path.replace(/^\//, "");
        if (data === null) {
          delete this.queueItemsMap[cleanKey];
        } else if (typeof data === "object") {
          data.key = cleanKey;
          this.queueItemsMap[cleanKey] = data;
        }
      }

      this._recalculateQuotaAndStatus();
    },

    _handlePatch: function(payload) {
      if (!payload) return;
      var cleanKey = (payload.path || "/").replace(/^\//, "");
      if (cleanKey && this.queueItemsMap[cleanKey] && payload.data) {
        for (var prop in payload.data) {
          if (Object.prototype.hasOwnProperty.call(payload.data, prop)) {
            this.queueItemsMap[cleanKey][prop] = payload.data[prop];
          }
        }
      }
      this._recalculateQuotaAndStatus();
    },

    _recalculateQuotaAndStatus: function() {
      var self = this;
      var allItems = [];
      for (var k in this.queueItemsMap) {
        if (Object.prototype.hasOwnProperty.call(this.queueItemsMap, k)) {
          allItems.push(this.queueItemsMap[k]);
        }
      }

      allItems.sort(function(a, b) {
        return (a.added_at || 0) - (b.added_at || 0);
      });

      this.playingSong = null;
      this.pendingSongsList = [];
      this.activeUserSongs = [];

      allItems.forEach(function(item) {
        if (item.status === "playing") {
          self.playingSong = item;
        } else if (item.status === "pending") {
          self.pendingSongsList.push(item);
        }

        if (item.user_id === self.userId && (item.status === "pending" || item.status === "playing")) {
          self.activeUserSongs.push(item);
        }
      });

      var pendingCount = this.pendingSongsList.length;
      if (this.dom.queueBadgeCount) {
        this.dom.queueBadgeCount.textContent = pendingCount;
      }

      // Atualiza exibicao do que esta tocando na TV
      if (this.playingSong) {
        this.dom.nowPlayingBox.textContent =
          "No palco: " + (this.playingSong.singer_name || "Cantor") + " — " + this.playingSong.title +
          (pendingCount > 0 ? " (+" + pendingCount + " na fila)" : "");
      } else if (pendingCount > 0) {
        this.dom.nowPlayingBox.textContent =
          "Preparando palco na TV... (" + pendingCount + " na fila)";
      } else {
        this.dom.nowPlayingBox.textContent = "Fila livre na TV! Busque uma música acima.";
      }

      // Atualiza cota (0, 1 ou 2 de 2 ativas)
      var count = this.activeUserSongs.length;
      this.dom.quotaCount.textContent = count + " de " + MAX_ACTIVE_SONGS_PER_USER + " ativas";
      this.dom.quotaDot1.classList.toggle("active", count >= 1);
      this.dom.quotaDot2.classList.toggle("active", count >= 2);
      this.dom.quotaWarning.classList.toggle("hidden", count < MAX_ACTIVE_SONGS_PER_USER);

      // Renderiza pilulas das musicas ativas do proprio participante (com botao Excluir se status === "pending")
      this.dom.mySongsList.innerHTML = "";
      this.activeUserSongs.forEach(function(s) {
        var pill = document.createElement("div");
        pill.className = "my-song-pill";
        var isPending = s.status === "pending";
        var statusTxt = isPending ? "Na fila" : "No palco!";

        pill.innerHTML =
          '<span class="t"></span>' +
          '<div class="my-song-actions">' +
            '<span class="badge">' + statusTxt + '</span>' +
            (isPending ? '<button type="button" class="cancel-song-btn" title="Cancelar música">&#10005;</button>' : '') +
          '</div>';

        pill.querySelector(".t").textContent = s.title;

        if (isPending) {
          var cancelBtn = pill.querySelector(".cancel-song-btn");
          cancelBtn.addEventListener("click", function() {
            self.cancelOwnPendingSong(s.key);
          });
        }

        self.dom.mySongsList.appendChild(pill);
      });

      // Atualiza tela de fila completa e estado dos botoes de envio
      this._renderFullQueueView();
      if (this.currentResults.length > 0) {
        this._renderResults(this.currentResults);
      }
    },

    _renderFullQueueView: function() {
      var self = this;
      if (!this.dom.queueViewList) return;

      if (this.playingSong) {
        var isMinePlaying = this.playingSong.user_id === this.userId;
        this.dom.queueViewPlaying.textContent =
          (this.playingSong.singer_name || "Cantor") +
          (isMinePlaying ? " (Você)" : "") +
          " — " + this.playingSong.title;
      } else {
        this.dom.queueViewPlaying.textContent = "Nenhuma música tocando no momento.";
      }

      var total = this.pendingSongsList.length;
      if (this.dom.queueViewSubtitle) {
        this.dom.queueViewSubtitle.textContent =
          total === 0 ? "Nenhuma música aguardando" :
          (total === 1 ? "1 música aguardando na sequência" : (total + " músicas aguardando na sequência"));
      }

      this.dom.queueViewList.innerHTML = "";

      if (total === 0) {
        var empty = document.createElement("div");
        empty.className = "queue-empty-msg";
        empty.textContent = "A fila de espera está vazia. Volte e escolha uma música para cantar!";
        this.dom.queueViewList.appendChild(empty);
        return;
      }

      this.pendingSongsList.forEach(function(item, idx) {
        var isMine = item.user_id === self.userId;
        var row = document.createElement("div");
        row.className = "queue-view-item" + (isMine ? " mine" : "");

        row.innerHTML =
          '<div class="queue-pos">' + (idx + 1) + '</div>' +
          '<div class="queue-item-body">' +
            '<div class="queue-item-singer">' +
              '<span class="singer-txt"></span>' +
              (isMine ? '<span class="mine-tag">Sua música</span>' : '') +
            '</div>' +
            '<div class="queue-item-title"></div>' +
          '</div>' +
          (isMine ? '<button type="button" class="cancel-song-btn" title="Excluir música">&#10005;</button>' : '');

        row.querySelector(".singer-txt").textContent = (item.singer_name || "Cantor").slice(0, MAX_SINGER_NAME_LEN);
        row.querySelector(".queue-item-title").textContent = item.title || "Música";

        if (isMine) {
          var delBtn = row.querySelector(".cancel-song-btn");
          delBtn.addEventListener("click", function() {
            self.cancelOwnPendingSong(item.key);
          });
        }

        self.dom.queueViewList.appendChild(row);
      });
    },

    // Permite ao participante excluir apenas suas proprias musicas com status === "pending"
    cancelOwnPendingSong: function(songKey) {
      var self = this;
      if (!songKey) return;
      var item = this.queueItemsMap[songKey];
      if (!item || item.user_id !== this.userId) return;
      if (item.status !== "pending") {
        this.showToast("Esta música já entrou no palco e não pode ser removida.");
        return;
      }

      delete this.queueItemsMap[songKey];
      this._recalculateQuotaAndStatus();

      var url = this.databaseUrl + "/rooms/" + encodeURIComponent(this.roomId) + "/queue/" + encodeURIComponent(songKey) + ".json";
      fetch(url, {
        method: "DELETE"
      })
        .then(function() {
          self.showToast("Música removida da fila.");
        })
        .catch(function() {
          self.showToast("Erro ao remover música.");
          self._pollQueueFallback();
        });
    },

    enqueueSong: function(song, buttonEl) {
      var self = this;

      if (this.activeUserSongs.length >= MAX_ACTIVE_SONGS_PER_USER) {
        this.showToast("Limite de 2 músicas atingido! Aguarde uma terminar.");
        return;
      }

      var singer = this.dom.singerNameInput.value.trim().slice(0, MAX_SINGER_NAME_LEN);
      if (!singer) {
        this.showToast("Digite seu nome antes de enviar a música!");
        this.dom.singerNameInput.focus();
        return;
      }

      if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.innerHTML = "&#8987;";
      }

      var payload = {
        video_id: song.video_id,
        title: song.title,
        thumbnail: song.thumbnail || ("https://i.ytimg.com/vi/" + song.video_id + "/default.jpg"),
        singer_name: singer,
        user_id: this.userId,
        status: "pending",
        added_at: Date.now()
      };

      var url = this.databaseUrl + "/rooms/" + encodeURIComponent(this.roomId) + "/queue.json";

      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function(res) { return res.json(); })
        .then(function(data) {
          if (data && data.name) {
            self.showToast("Música enviada para a TV!");
            if (buttonEl) {
              buttonEl.classList.add("sent");
              buttonEl.innerHTML = "&#10003;";
            }
            self._pollQueueFallback();
          } else {
            self.showToast("Erro ao enviar para o Firebase.");
            if (buttonEl) {
              buttonEl.disabled = false;
              buttonEl.innerHTML = "&#8593;";
            }
          }
        })
        .catch(function() {
          self.showToast("Falha de rede ao enviar música.");
          if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.innerHTML = "&#8593;";
          }
        });
    },

    showToast: function(msg) {
      var self = this;
      this.dom.toast.textContent = msg;
      this.dom.toast.classList.add("show");
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(function() {
        self.dom.toast.classList.remove("show");
      }, 3200);
    }
  };

  window.MobileApp = MobileApp;
  window.addEventListener("DOMContentLoaded", function() {
    MobileApp.init();
  });
})(window);
