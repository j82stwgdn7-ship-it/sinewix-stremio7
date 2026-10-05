const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const TMDB_API_KEY = process.env.TMDB_API_KEY;

// Optional SineWix diagnostics configuration.
// Values are never printed to logs and are not used to bypass authentication.
const SINEWIX_API_BASE = process.env.SINEWIX_API_BASE || "";
const SINEWIX_API_KEY = process.env.SINEWIX_API_KEY || "";

const builder = new addonBuilder({
  id: "community.sinewix.stremio",
  version: "1.1.1",
  name: "SineWix Türkçe",
  description: "TMDB ve yasal izleme sağlayıcılarını Stremio'ya getirir.",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: []
});

async function tmdbGet(path) {
  if (!TMDB_API_KEY) return null;

  const url =
    "https://api.themoviedb.org/3" +
    path +
    (path.includes("?") ? "&" : "?") +
    "api_key=" +
    encodeURIComponent(TMDB_API_KEY);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("TMDB HTTP " + response.status);
  }

  return response.json();
}

async function tmdbFindByImdb(imdbId) {
  return tmdbGet(
    "/find/" +
      encodeURIComponent(imdbId) +
      "?external_source=imdb_id"
  );
}

async function getWatchProviders(type, tmdbId) {
  const endpoint =
    type === "series"
      ? "/tv/" + encodeURIComponent(tmdbId) + "/watch/providers"
      : "/movie/" + encodeURIComponent(tmdbId) + "/watch/providers";

  return tmdbGet(endpoint);
}

builder.defineStreamHandler(async args => {
  const id = String(args.id || "");
  const type = args.type === "series" ? "series" : "movie";

  // Güvenli tanılama: gizli değerleri yazdırmadan Stremio isteğini göster.
  console.log("[STREAM]", {
    type,
    id,
    tmdbConfigured: Boolean(TMDB_API_KEY),
    sinewixBaseConfigured: Boolean(SINEWIX_API_BASE),
    sinewixKeyConfigured: Boolean(SINEWIX_API_KEY)
  });

  // Cinemeta series video ID formatı: tt...:season:episode
  if (type === "series" && id.includes(":")) {
    const parts = id.split(":");
    console.log("[SERIES REQUEST]", {
      imdbId: parts[0],
      season: parts[1] || null,
      episode: parts[2] || null
    });
  }

  // Big Buck Bunny test streamini koruyoruz.
  if (type === "movie" && id === "tt1254207") {
    let tmdbTitle = "TMDB bağlantısı bekleniyor";

    try {
      const data = await tmdbFindByImdb(id);

      if (data && Array.isArray(data.movie_results) && data.movie_results.length > 0) {
        tmdbTitle = data.movie_results[0].title || tmdbTitle;
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

  if (!TMDB_API_KEY || !id.startsWith("tt")) {
    console.log("[STREAM] No TMDB lookup:", {
      reason: !TMDB_API_KEY ? "TMDB_API_KEY missing" : "non-IMDb id"
    });
    return { streams: [] };
  }

  try {
    const found = await tmdbFindByImdb(id);

    const result =
      type === "series"
        ? found && Array.isArray(found.tv_results) && found.tv_results[0]
        : found && Array.isArray(found.movie_results) && found.movie_results[0];

    if (!result) {
      console.log("[STREAM] TMDB match not found:", id);
      return { streams: [] };
    }

    const tmdbId = result.id;
    const title = result.title || result.name || "İçerik";

    console.log("[TMDB MATCH]", {
      imdbId: id,
      tmdbId,
      title
    });

    const providers = await getWatchProviders(type, tmdbId);
    const country = providers && providers.results && providers.results.TR;

    if (!country || !country.link) {
      console.log("[PROVIDERS] No TR provider link:", {
        imdbId: id,
        tmdbId
      });
      return { streams: [] };
    }

    const streams = [];

    const groups = [
      ["flatrate", "Abonelik"],
      ["free", "Ücretsiz"],
      ["ads", "Reklamlı"],
      ["rent", "Kiralama"],
      ["buy", "Satın alma"]
    ];

    for (const [key, label] of groups) {
      const list = Array.isArray(country[key]) ? country[key] : [];

      for (const provider of list) {
        streams.push({
          name: "Yasal İzleme",
          title:
            title +
            " | " +
            label +
            " | " +
            (provider.provider_name || "Sağlayıcı"),
          externalUrl: country.link
        });
      }
    }

    console.log("[PROVIDERS] TR streams:", streams.length);

    return { streams };
  } catch (error) {
    console.error("Provider error:", error.message);
    return { streams: [] };
  }
});

serveHTTP(builder.getInterface(), {
  port: process.env.PORT || 7000
});
