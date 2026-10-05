const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const API_BASE =
  process.env.SINEWIX_API_BASE ||
  "https://ydfvfdizipanel.ru/public/api";

const API_KEY = process.env.SINEWIX_API_KEY;

const TMDB_KEY = process.env.TMDB_API_KEY;

const PANEL_BASE =
  process.env.SINEWIX_PANEL_BASE ||
  "https://ydfvfdizipanel.ru";

if (!API_KEY) {
  console.warn("SINEWIX_API_KEY tanımlanmamış.");
}

if (!TMDB_KEY) {
  console.warn("TMDB_API_KEY tanımlanmamış.");
}

const API_HEADERS = {
  "User-Agent":
    "EasyPlex (Android 14; SM-A546B; Samsung Galaxy A54 5G; tr)",
  Accept: "application/json"
};

const STREAM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Referer: PANEL_BASE + "/",
  Origin: PANEL_BASE
};

async function api(path) {
  const response = await fetch(API_BASE + path, {
    headers: API_HEADERS
  });

  if (!response.ok) {
    throw new Error(`SineWix API ${response.status}`);
  }

  return response.json();
}

async function tmdbFind(imdbId) {
  if (!TMDB_KEY) return null;

  const url =
    "https://api.themoviedb.org/3/find/" +
    encodeURIComponent(imdbId) +
    "?api_key=" +
    encodeURIComponent(TMDB_KEY) +
    "&external_source=imdb_id";

  const response = await fetch(url);

  if (!response.ok) return null;

  const data = await response.json();

  return {
    movie: data.movie_results?.[0] || null,
    series: data.tv_results?.[0] || null
  };
}

async function searchSineWix(
  title,
  originalTitle,
  imdbId,
  type,
  season,
  episode,
  year,
  tmdbId
) {
  const query = originalTitle || title;

  if (!query) return [];

  let data = await api(
    "/search/" +
      encodeURIComponent(query) +
      "/" +
      encodeURIComponent(API_KEY)
  );

  let results = data.search || [];

  if (
    results.length === 0 &&
    title &&
    title.toLowerCase() !== query.toLowerCase()
  ) {
    data = await api(
      "/search/" +
        encodeURIComponent(title) +
        "/" +
        encodeURIComponent(API_KEY)
    );

    results = data.search || [];
  }

  if (!results.length) return [];

  const endpoint =
    type === "movie" ? "media/detail" : "series/show";

  const details = await Promise.all(
    results.map(async item => {
      try {
        return await api(
          "/" +
            endpoint +
            "/" +
            encodeURIComponent(item.id) +
            "/" +
            encodeURIComponent(API_KEY)
        );
      } catch {
        return null;
      }
    })
  );

  const targetTmdb = tmdbId ? String(tmdbId) : null;

  let match = details.find(item => {
    if (!item) return false;

    if (
      targetTmdb &&
      item.tmdb_id &&
      String(item.tmdb_id) === targetTmdb
    ) {
      return true;
    }

    if (
      imdbId &&
      item.imdb_external_id &&
      item.imdb_external_id === imdbId
    ) {
      return true;
    }

    const itemYear =
      (item.release_date || item.first_air_date || "").split("-")[0];

    const itemTitle =
      (item.title || item.name || "").toLowerCase().trim();

    const exactTitle =
      title &&
      itemTitle === title.toLowerCase().trim();

    const exactOriginal =
      originalTitle &&
      itemTitle === originalTitle.toLowerCase().trim();

    return (
      (exactTitle || exactOriginal) &&
      (!year || !itemYear || itemYear === year)
    );
  });

  if (!match) {
    match = details.find(item => {
      if (!item) return false;

      const itemTitle =
        (item.title || item.name || "").toLowerCase();

      return (
        (originalTitle &&
          itemTitle.includes(originalTitle.toLowerCase())) ||
        (title &&
          itemTitle.includes(title.toLowerCase()))
      );
    });
  }

  if (!match) return [];

  let videos = [];

  if (type === "movie") {
    videos = match.videos || [];
  } else {
    const selectedSeason = (match.seasons || []).find(
      s => Number(s.season_number) === Number(season)
    );

    const selectedEpisode =
      selectedSeason?.episodes?.find(
        e => Number(e.episode_number) === Number(episode)
      );

    videos = selectedEpisode?.videos || [];
  }

  return videos;
}

async function resolveStreams(videos, title) {
  if (!Array.isArray(videos)) return [];

  return videos
    .filter(v => v && v.link)
    .map(v => {
      const isDual =
        (v.lang && /dual/i.test(v.lang)) ||
        /dual/i.test(v.link);

      const language = isDual
        ? "DUAL (TR/EN)"
        : v.lang || "Türkçe";

      const server = v.server || "Sunucu";

      return {
        name: "SineWix",
        title:
          `SINEWIX | ${server.toUpperCase()} ` +
          `(${language} - 1080p MKV)`,
        url: v.link,
        quality: "1080p",
        format: "mkv",
        isHls: false,
        headers: STREAM_HEADERS,
        behaviorHints: {
          notWebReady: true,
          proxyHeaders: {
            request: STREAM_HEADERS
          }
        }
      };
    });
}

const builder = new addonBuilder({
  id: "community.sinewix.stremio",
  version: "1.0.0",
  name: "SineWix Türkçe",
  description:
    "SineWix Türkçe dublaj kaynaklarını Stremio'ya getirir.",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: []
});

builder.defineStreamHandler(async args => {
  try {
    const id = String(args.id || "");

    if (!id.startsWith("tt")) {
      return { streams: [] };
    }

    let type = args.type === "series" ? "series" : "movie";

    let season = null;
    let episode = null;

    if (type === "series") {
      const parts = id.split(":");

      if (parts.length >= 3) {
        season = Number(parts[1]);
        episode = Number(parts[2]);
      }

      if (!season) {
        return { streams: [] };
      }
    }

    const tmdb = await tmdbFind(id);

    const media =
      type === "movie"
        ? tmdb?.movie
        : tmdb?.series;

    if (!media) {
      return { streams: [] };
    }

    const title =
      media.title ||
      media.name ||
      "";

    const originalTitle =
      media.original_title ||
      media.original_name ||
      title;

    const releaseDate =
      media.release_date ||
      media.first_air_date ||
      "";

    const year =
      releaseDate.split("-")[0];

    const videos = await searchSineWix(
      title,
      originalTitle,
      id,
      type === "movie" ? "movie" : "series",
      season,
      episode,
      year,
      media.id
    );

    const streams =
      await resolveStreams(videos, title);

    return {
      streams
    };
  } catch (error) {
    console.error("SineWix error:", error);
    return {
      streams: []
    };
  }
});

serveHTTP(
  builder.getInterface(),
  {
    port: process.env.PORT || 7000
  }
);
