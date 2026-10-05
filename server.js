const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const TMDB_API_KEY = process.env.TMDB_API_KEY;

const builder = new addonBuilder({
  id: "community.sinewix.stremio",
  version: "1.0.2",
  name: "SineWix Türkçe",
  description: "TMDB bağlantı testi ve Stremio addon.",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: []
});

async function tmdbFindByImdb(imdbId) {
  if (!TMDB_API_KEY) return null;

  const url =
    "https://api.themoviedb.org/3/find/" +
    encodeURIComponent(imdbId) +
    "?api_key=" +
    encodeURIComponent(TMDB_API_KEY) +
    "&external_source=imdb_id";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("TMDB HTTP " + response.status);
  }

  return response.json();
}

builder.defineStreamHandler(async args => {
  const id = String(args.id || "");
  const type = args.type === "series" ? "series" : "movie";

  // Test filmi: Big Buck Bunny'nin IMDb ID'si.
  if (type === "movie" && id === "tt1254207") {
    let tmdbTitle = "TMDB bağlantısı bekleniyor";

    try {
      const data = await tmdbFindByImdb(id);

      if (data && Array.isArray(data.movie_results) && data.movie_results.length > 0) {
        tmdbTitle = data.movie_results[0].title || tmdbTitle;
      } else if (data && Array.isArray(data.tv_results) && data.tv_results.length > 0) {
        tmdbTitle = data.tv_results[0].name || tmdbTitle;
      } else if (TMDB_API_KEY) {
        tmdbTitle = "TMDB'de eşleşme bulunamadı";
      }
    } catch (error) {
      console.error("TMDB error:", error.message);
      tmdbTitle = "TMDB bağlantı hatası: " + error.message;
    }

    return {
      streams: [
        {
          name: "Addon Test",
          title: "TMDB TEST | " + tmdbTitle,
          url:
            "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4"
        }
      ]
    };
  }

  return { streams: [] };
});

serveHTTP(builder.getInterface(), {
  port: process.env.PORT || 7000
});
