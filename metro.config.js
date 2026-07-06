const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web backend bundles a wa-sqlite .wasm binary — Metro needs
// to know to treat it as an asset (like an image) rather than try to parse
// it as JS source.
config.resolver.assetExts.push("wasm");

// expo-sqlite's web backend runs SQLite in a WASM worker via SharedArrayBuffer,
// which browsers only expose on a "cross-origin isolated" page — i.e. these
// two headers present on every response. Without them `new SharedArrayBuffer()`
// throws and local-first storage is unusable on the web target (native iOS/
// Android use a real SQLite binding and don't need this at all).
config.server.enhanceMiddleware = (middleware) => {
  return (req, res, next) => {
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    middleware(req, res, next);
  };
};

module.exports = config;
