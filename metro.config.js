const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Pesos del modelo facial (.bin) empaquetados como assets.
config.resolver.assetExts.push('bin');

module.exports = config;
