(function(window) {
  "use strict";

  var eventSource = null;
  var reconnectTimer = null;
  var itemsMap = {};
  var config = {
    databaseUrl: "",
    roomId: ""
  };
  var callbacks = {
    onQueueChanged: null,
    onConnectionStatus: null,
    onError: null
  };

  var FirebaseSync = {
    init: function(cfg, cbs) {
      if (cfg) {
        config.databaseUrl = (cfg.databaseUrl || "").replace(/\/+$/, "");
        config.roomId = cfg.roomId || "tv_sala_01";
      }
      if (cbs) {
        callbacks.onQueueChanged = cbs.onQueueChanged || null;
        callbacks.onConnectionStatus = cbs.onConnectionStatus || null;
        callbacks.onError = cbs.onError || null;
      }

      this.connect();
    },

    getQueueEndpoint: function() {
      return config.databaseUrl + "/rooms/" + encodeURIComponent(config.roomId) + "/queue.json";
    },

    getCurrentEndpoint: function() {
      return config.databaseUrl + "/rooms/" + encodeURIComponent(config.roomId) + "/current.json";
    },

    connect: function() {
      var self = this;
      this.disconnect();

      if (!config.databaseUrl) {
        console.warn("[FirebaseSync] databaseUrl nao configurada. Operando offline.");
        if (callbacks.onConnectionStatus) callbacks.onConnectionStatus("offline");
        return;
      }

      var sseUrl = this.getQueueEndpoint();
      console.log("[FirebaseSync] Conectando SSE em:", sseUrl);

      try {
        eventSource = new window.EventSource(sseUrl);

        eventSource.addEventListener("open", function() {
          console.log("[FirebaseSync] Conexao SSE aberta.");
          if (callbacks.onConnectionStatus) callbacks.onConnectionStatus("connected");
        });

        // Evento PUT do Firebase: snapshot completo ou criacao/substituicao de no
        eventSource.addEventListener("put", function(e) {
          try {
            var payload = JSON.parse(e.data);
            self._handlePut(payload);
          } catch (err) {
            console.error("[FirebaseSync] Erro ao processar evento PUT:", err);
          }
        });

        // Evento PATCH do Firebase: atualizacao parcial de atributos
        eventSource.addEventListener("patch", function(e) {
          try {
            var payload = JSON.parse(e.data);
            self._handlePatch(payload);
          } catch (err) {
            console.error("[FirebaseSync] Erro ao processar evento PATCH:", err);
          }
        });

        // Evento CANCEL: erro de permissoes no Firebase
        eventSource.addEventListener("cancel", function(e) {
          console.warn("[FirebaseSync] Conexao cancelada pelo servidor (verifique as regras de seguranca do Firebase):", e);
          if (callbacks.onError) callbacks.onError("Permissao negada no Firebase Realtime Database.");
        });

        eventSource.onerror = function(err) {
          console.warn("[FirebaseSync] Erro na conexao SSE. Tentando reconectar em 4 segundos...");
          if (callbacks.onConnectionStatus) callbacks.onConnectionStatus("reconnecting");
          self.disconnect();
          reconnectTimer = setTimeout(function() {
            self.connect();
          }, 4000);
        };

      } catch (err) {
        console.error("[FirebaseSync] Falha ao iniciar EventSource:", err);
        if (callbacks.onError) callbacks.onError(err.message);
      }
    },

    _handlePut: function(payload) {
      if (!payload) return;
      var path = payload.path || "/";
      var data = payload.data;

      if (path === "/") {
        // Substituicao completa da arvore de fila
        itemsMap = {};
        if (data && typeof data === "object") {
          for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key) && data[key]) {
              var item = data[key];
              item.key = key;
              itemsMap[key] = item;
            }
          }
        }
      } else {
        // Atualizacao de no especifico: "/-OABC123"
        var cleanKey = path.replace(/^\//, "");
        if (data === null) {
          delete itemsMap[cleanKey];
        } else if (typeof data === "object") {
          data.key = cleanKey;
          itemsMap[cleanKey] = data;
        }
      }

      this._notifyQueueUpdate();
    },

    _handlePatch: function(payload) {
      if (!payload) return;
      var path = payload.path || "/";
      var data = payload.data;
      var cleanKey = path.replace(/^\//, "");

      if (cleanKey && itemsMap[cleanKey] && data) {
        for (var prop in data) {
          if (Object.prototype.hasOwnProperty.call(data, prop)) {
            itemsMap[cleanKey][prop] = data[prop];
          }
        }
      }

      this._notifyQueueUpdate();
    },

    _notifyQueueUpdate: function() {
      var queueList = [];
      for (var key in itemsMap) {
        if (Object.prototype.hasOwnProperty.call(itemsMap, key)) {
          queueList.push(itemsMap[key]);
        }
      }

      // Ordena a fila cronologicamente por added_at
      queueList.sort(function(a, b) {
        var tA = a.added_at || 0;
        var tB = b.added_at || 0;
        return tA - tB;
      });

      if (callbacks.onQueueChanged) {
        callbacks.onQueueChanged(queueList);
      }
    },

    // Atualiza status de uma musica (ex: pending -> playing)
    updateSongStatus: function(songKey, status, extraData) {
      if (!songKey) return;
      if (itemsMap[songKey]) {
        itemsMap[songKey].status = status;
        if (extraData) {
          for (var p in extraData) {
            if (Object.prototype.hasOwnProperty.call(extraData, p)) {
              itemsMap[songKey][p] = extraData[p];
            }
          }
        }
        this._notifyQueueUpdate();
      }
      if (!config.databaseUrl) return;
      var url = config.databaseUrl + "/rooms/" + encodeURIComponent(config.roomId) + "/queue/" + encodeURIComponent(songKey) + ".json";
      var body = Object.assign({ status: status }, extraData || {});

      fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).catch(function(err) {
        console.warn("[FirebaseSync] Falha ao atualizar status da musica:", err);
      });
    },

    // Atualiza o estado da musica tocando atualmente no no /current
    updateCurrentSong: function(currentData) {
      if (!config.databaseUrl) return;
      var url = this.getCurrentEndpoint();

      fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentData || null)
      }).catch(function(err) {
        console.warn("[FirebaseSync] Falha ao atualizar musica atual:", err);
      });
    },

    // Remove uma musica da fila no Firebase (apos tocar, ser pulada ou parada)
    removeSong: function(songKey, callback) {
      if (!songKey) {
        if (callback) callback();
        return;
      }
      if (itemsMap[songKey]) {
        delete itemsMap[songKey];
        this._notifyQueueUpdate();
      }
      if (!config.databaseUrl) {
        if (callback) callback();
        return;
      }
      var url = config.databaseUrl + "/rooms/" + encodeURIComponent(config.roomId) + "/queue/" + encodeURIComponent(songKey) + ".json";

      fetch(url, {
        method: "DELETE"
      }).then(function() {
        if (callback) callback();
      }).catch(function(err) {
        console.warn("[FirebaseSync] Falha ao remover musica:", err);
        if (callback) callback(err);
      });
    },

    // Limpa toda a fila de musicas da sala (Reset Fila)
    clearQueue: function(callback) {
      if (!config.databaseUrl) {
        if (callback) callback();
        return;
      }
      var self = this;
      var queueUrl = this.getQueueEndpoint();
      var currentUrl = this.getCurrentEndpoint();

      itemsMap = {};
      this._notifyQueueUpdate();

      Promise.all([
        fetch(queueUrl, { method: "DELETE" }),
        fetch(currentUrl, { method: "DELETE" })
      ]).then(function() {
        if (callback) callback();
      }).catch(function(err) {
        console.warn("[FirebaseSync] Falha ao limpar fila:", err);
        if (callback) callback(err);
      });
    },

    disconnect: function() {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (eventSource) {
        try {
          eventSource.close();
        } catch (e) {}
        eventSource = null;
      }
    }
  };

  window.FirebaseSync = FirebaseSync;
})(window);
