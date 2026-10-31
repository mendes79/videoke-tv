(function(window) {
  "use strict";

  var recognition = null;
  var isListening = false;

  var SpeechSearch = {
    isSupported: function() {
      return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    },

    init: function(options) {
      var self = this;
      var opts = options || {};
      var SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (!SpeechRecognitionCtor) {
        if (opts.onUnsupported) opts.onUnsupported();
        return;
      }

      recognition = new SpeechRecognitionCtor();
      recognition.lang = "pt-BR";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;

      recognition.onstart = function() {
        isListening = true;
        if (opts.onStart) opts.onStart();
      };

      recognition.onresult = function(event) {
        var transcript = "";
        var isFinal = false;

        for (var i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            isFinal = true;
          }
        }

        if (opts.onTranscript) {
          opts.onTranscript(transcript.trim(), isFinal);
        }
      };

      recognition.onerror = function(event) {
        isListening = false;
        if (opts.onError) opts.onError(event.error || "speech_error");
      };

      recognition.onend = function() {
        isListening = false;
        if (opts.onEnd) opts.onEnd();
      };
    },

    toggle: function() {
      if (!recognition) return false;
      if (isListening) {
        try {
          recognition.stop();
        } catch (e) {}
        return false;
      } else {
        try {
          recognition.start();
          return true;
        } catch (e) {
          return false;
        }
      }
    }
  };

  window.SpeechSearch = SpeechSearch;
})(window);

