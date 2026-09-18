// craco.config.js
//
// CRA (react-scripts 5) usa Webpack 5, que ya no incluye por defecto los
// polyfills de módulos "core" de Node.js en el bundle de navegador. ExcelJS
// (y sus dependencias internas como fast-csv, archiver, unzipper) importan
// algunos de estos módulos, así que hay que decirle a Webpack cómo
// resolverlos para el navegador.
//
// 'fs' se deja en `false` porque ExcelJS no lo necesita realmente en el
// flujo de lectura/escritura en el navegador (solo se usaría si trabajaras
// con archivos del sistema, lo cual no aplica aquí).

const webpack = require('webpack');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        fs: false,
        stream: require.resolve('stream-browserify'),
        buffer: require.resolve('buffer'),
        util: require.resolve('util'),
        assert: require.resolve('assert'),
        crypto: require.resolve('crypto-browserify'),
        path: require.resolve('path-browserify'),
        zlib: require.resolve('browserify-zlib'),
      };

      webpackConfig.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser.js',
        })
      );

      // Webpack 5 exige extensión explícita para imports de módulos ESM
      // (.mjs), y varias dependencias (axios, react-router) importan
      // 'process/browser' sin extensión. Esto desactiva esa exigencia
      // solo para archivos .js/.mjs, sin afectar el resto de la resolución.
      webpackConfig.module.rules.push({
        test: /\.m?js$/,
        resolve: { fullySpecified: false },
      });

      return webpackConfig;
    },
  },
};