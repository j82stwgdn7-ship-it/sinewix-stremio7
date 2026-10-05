const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

const builder = new addonBuilder({
  id: "community.sinewix.stremio",
  version: "1.0.1",
  name: "SineWix Türkçe",
  description: "Stremio bağlantı ve sunucu test eklentisi.",
  resources: ["stream"],
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: []
});

builder.defineStreamHandler(async args => {
  const id = String(args.id || "");
  const type = args.type === "series" ? "series" : "movie";

  // Anahtar gerektirmeyen güvenli test:
  // Big Buck Bunny'nin herkese açık örnek videosu.
  if (type === "movie" && id === "tt1254207") {
    return {
      streams: [
        {
          name: "Addon Test",
          title: "ADDON TEST | Public sample video",
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
