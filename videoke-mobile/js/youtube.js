(function(window) {
  "use strict";

  var memoryCache = {};

  function extractYouTubeId(text) {
    if (!text) return null;
    var trimmed = text.trim();
    if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
    var m = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function decodeHtmlEntities(str) {
    if (!str) return "";
    var txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
  }

  var YouTubeSearch = {
    search: function(query, apiKey, callback) {
      var cleanQuery = (query || "").trim();
      if (!cleanQuery) {
        callback(null, [], "vazio");
        return;
      }

      // 1. Se o usuario colou um link ou ID direto do YouTube (11 caracteres)
      var directId = extractYouTubeId(cleanQuery);
      if (directId) {
        callback(null, [
          {
            video_id: directId,
            title: "Vídeo do YouTube (" + directId + ")",
            channel: "Link Direto do YouTube",
            thumbnail: "https://i.ytimg.com/vi/" + directId + "/mqdefault.jpg"
          }
        ], "link_direto");
        return;
      }

      var normalizedKey = cleanQuery.toLowerCase();
      if (memoryCache[normalizedKey]) {
        callback(null, memoryCache[normalizedKey], "cache");
        return;
      }

      if (!apiKey) {
        callback(
          new Error("Configure a chave da YouTube Data API v3 (ícone ⚙ no topo) para pesquisar músicas."),
          [],
          "sem_chave"
        );
        return;
      }

      // 2. Consulta oficial na YouTube Data API v3 anexando "karaoke videoke"
      var searchTerms = cleanQuery + " karaoke videoke";
      var url = "https://www.googleapis.com/youtube/v3/search" +
        "?part=snippet" +
        "&maxResults=8" +
        "&type=video" +
        "&videoEmbeddable=true" +
        "&q=" + encodeURIComponent(searchTerms) +
        "&key=" + encodeURIComponent(apiKey);

      fetch(url)
        .then(function(res) {
          return res.json().then(function(data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function(resp) {
          if (!resp.ok || (resp.data && resp.data.error)) {
            var errMsg = (resp.data && resp.data.error && resp.data.error.message) || "Erro na YouTube Data API v3";
            callback(new Error(errMsg), [], "erro_api");
            return;
          }

          var items = (resp.data && resp.data.items) || [];
          var results = items.map(function(item) {
            var vid = item.id && item.id.videoId;
            var snip = item.snippet || {};
            var thumbs = snip.thumbnails || {};
            var thumbUrl = (thumbs.medium && thumbs.medium.url) ||
                           (thumbs.default && thumbs.default.url) ||
                           ("https://i.ytimg.com/vi/" + vid + "/mqdefault.jpg");
            return {
              video_id: vid,
              title: decodeHtmlEntities(snip.title || "Vídeo sem título"),
              channel: decodeHtmlEntities(snip.channelTitle || "YouTube"),
              thumbnail: thumbUrl
            };
          }).filter(function(r) {
            return !!r.video_id;
          });

          memoryCache[normalizedKey] = results;
          callback(null, results, "youtube_api");
        })
        .catch(function(err) {
          callback(err, [], "erro_rede");
        });
    }
  };

  window.YouTubeSearch = YouTubeSearch;
})(window);
