(function(window) {
  "use strict";

  var Remote = {
    keys: {
      ENTER: 13,
      RETURN: 10009,
      ESC: 27,
      LEFT: 37,
      UP: 38,
      RIGHT: 39,
      DOWN: 40,
      MEDIA_PLAY: 415,
      MEDIA_PAUSE: 19,
      MEDIA_PLAY_PAUSE: 10252,
      MEDIA_STOP: 413,
      MEDIA_FAST_FORWARD: 417,
      MEDIA_REWIND: 412
    },

    init: function(handlers) {
      this.handlers = handlers || {};
      this._registerTizenKeys();
      this._bindEvents();
    },

    _registerTizenKeys: function() {
      if (window.tizen && window.tizen.tvinputdevice) {
        var keysToRegister = [
          "MediaPlay",
          "MediaPause",
          "MediaPlayPause",
          "MediaStop",
          "MediaFastForward",
          "MediaRewind"
        ];
        keysToRegister.forEach(function(keyName) {
          try {
            window.tizen.tvinputdevice.registerKey(keyName);
          } catch (e) {
            console.warn("[Remote] Erro ao registrar tecla " + keyName + ":", e.message);
          }
        });
      }
    },

    _bindEvents: function() {
      var self = this;
      document.addEventListener("keydown", function(ev) {
        var code = ev.keyCode;
        var handled = false;

        switch (code) {
          case self.keys.ENTER:
            if (self.handlers.onEnter) handled = self.handlers.onEnter();
            break;

          case self.keys.RETURN:
          case self.keys.ESC:
            if (self.handlers.onBack) handled = self.handlers.onBack();
            break;

          case self.keys.LEFT:
            if (self.handlers.onLeft) handled = self.handlers.onLeft();
            break;

          case self.keys.RIGHT:
            if (self.handlers.onRight) handled = self.handlers.onRight();
            break;

          case self.keys.UP:
            if (self.handlers.onUp) handled = self.handlers.onUp();
            break;

          case self.keys.DOWN:
            if (self.handlers.onDown) handled = self.handlers.onDown();
            break;

          case self.keys.MEDIA_PLAY:
          case self.keys.MEDIA_PAUSE:
          case self.keys.MEDIA_PLAY_PAUSE:
            if (self.handlers.onPlayPause) handled = self.handlers.onPlayPause();
            break;

          case self.keys.MEDIA_STOP:
            if (self.handlers.onStop) handled = self.handlers.onStop();
            break;

          case self.keys.MEDIA_FAST_FORWARD:
            if (self.handlers.onNext) handled = self.handlers.onNext();
            break;

          case self.keys.MEDIA_REWIND:
            if (self.handlers.onPrev) handled = self.handlers.onPrev();
            break;
        }

        if (handled) {
          ev.preventDefault();
        }
      });
    }
  };

  window.Remote = Remote;
})(window);
