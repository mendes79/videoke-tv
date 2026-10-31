(function(window) {
  "use strict";

  var bridgeFrame = null;
  var isBridgeReady = false;
  var pendingVideoId = null;
  var lastPlayerState = -1;
  var callbacks = {
    onReady: null,
    onEnded: null,
    onStateChange: null,
    onError: null
  };

  var YTPlayer = {
    init: function(cbs) {
      if (cbs) {
        callbacks.onReady = cbs.onReady || null;
        callbacks.onEnded = cbs.onEnded || null;
        callbacks.onStateChange = cbs.onStateChange || null;
        callbacks.onError = cbs.onError || null;
      }

      window.addEventListener("message", function(ev) {
        var msg = ev.data;
        if (!msg || msg.source !== "videoke-yt-bridge") return;

        if (msg.type === "ready") {
          isBridgeReady = true;
          if (pendingVideoId) {
            YTPlayer.loadVideo(pendingVideoId);
            pendingVideoId = null;
          }
          if (callbacks.onReady) callbacks.onReady();
        } else if (msg.type === "stateChange") {
          lastPlayerState = msg.data ? msg.data.state : -1;
          if (callbacks.onStateChange) callbacks.onStateChange(lastPlayerState);
        } else if (msg.type === "ended") {
          if (callbacks.onEnded) callbacks.onEnded();
        } else if (msg.type === "error") {
          var code = msg.data ? msg.data.code : 0;
          var reason = "Erro ao carregar video (" + code + ")";
          if (code === 101 || code === 150 || code === 153) {
            reason = "Incorporacao desativada pelo autor do video.";
          } else if (code === 100) {
            reason = "Video nao encontrado ou privado.";
          } else if (code === 2) {
            reason = "Parametro de video invalido.";
          }
          console.warn("[YTPlayer] Error:", code, reason);
          if (callbacks.onError) callbacks.onError(code, reason);
        }
      });

      this._createBridgeFrame();
    },

    _createBridgeFrame: function() {
      if (bridgeFrame) return;
      var container = document.getElementById("player-container");
      if (!container) return;

      var cfg = window.VIDEOKE_CONFIG || {};
      var baseUrl = (cfg.mobileWebUrl || "https://videoke-tv.web.app").replace(/\/+$/, "");
      var bridgeUrl = baseUrl + "/yt-bridge.html";

      container.innerHTML = "";
      bridgeFrame = document.createElement("iframe");
      bridgeFrame.id = "yt-bridge-iframe";
      bridgeFrame.src = bridgeUrl;
      bridgeFrame.setAttribute("allow", "autoplay; encrypted-media; fullscreen");
      bridgeFrame.setAttribute("allowfullscreen", "true");
      container.appendChild(bridgeFrame);
    },

    _sendCommand: function(command, extra) {
      if (!bridgeFrame || !bridgeFrame.contentWindow) return;
      var payload = Object.assign({
        target: "videoke-yt-bridge",
        command: command
      }, extra || {});
      try {
        bridgeFrame.contentWindow.postMessage(payload, "*");
      } catch (e) {
        console.error("[YTPlayer] Falha ao enviar comando postMessage:", e);
      }
    },

    loadVideo: function(videoId) {
      if (!isBridgeReady) {
        pendingVideoId = videoId;
        return;
      }
      this._sendCommand("loadVideo", { videoId: videoId });
    },

    play: function() {
      this._sendCommand("play");
    },

    pause: function() {
      this._sendCommand("pause");
    },

    stop: function() {
      pendingVideoId = null;
      this._sendCommand("stop");
    },

    getPlayerState: function() {
      return lastPlayerState;
    },

    destroy: function() {
      if (bridgeFrame && bridgeFrame.parentNode) {
        bridgeFrame.parentNode.removeChild(bridgeFrame);
      }
      bridgeFrame = null;
      isBridgeReady = false;
    }
  };

  window.YTPlayer = YTPlayer;
})(window);
