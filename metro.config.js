const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
};

const assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
if (!assetExts.includes('wasm')) {
  assetExts.push('wasm');
}

config.resolver = {
  ...config.resolver,
  assetExts,
  sourceExts: [...config.resolver.sourceExts, 'svg'],
};

// expo-sqlite on web needs SharedArrayBuffer, which the browser only enables
// when the page is cross-origin isolated. Production hosting uses public/_headers
// with the same policy (COEP require-corp, COOP same-origin).
const enhanceMiddleware = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const enhancedMiddleware = enhanceMiddleware
    ? enhanceMiddleware(middleware, metroServer)
    : middleware;
  return (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    return enhancedMiddleware(req, res, next);
  };
};

module.exports = config;
