const path = require("path");
const { merge } = require("webpack-merge");
const commonConfiguration = require("./webpack.common.js");
const portFinderSync = require("portfinder-sync");
const HtmlWebpackPlugin = require("html-webpack-plugin");

const infoColor = (_message) => {
  return `\u001b[1m\u001b[34m${_message}\u001b[39m\u001b[22m`;
};

module.exports = merge(commonConfiguration, {
  // The /draw page is local-only: it opens a WebSocket to the pixels Worker, which is
  // too easy to run up a Cloudflare bill with, so the prod build leaves it out.
  entry: {
    draw: path.resolve(__dirname, "../src/draw.js"),
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "../src/draw.html"),
      filename: "draw.html",
      chunks: ["draw"],
      minify: true,
    }),
  ],
  stats: "errors-warnings",
  mode: "development",
  infrastructureLogging: {
    level: "warn",
  },
  devServer: {
    host: "localhost",
    port: portFinderSync.getPort(8080),
    open: true,
    https: false,
    allowedHosts: "all",
    hot: false,
    watchFiles: ["src/**", "static/**"],
    static: {
      watch: true,
      directory: path.join(__dirname, "../static"),
    },
    client: {
      logging: "none",
      overlay: true,
      progress: false,
    },
    historyApiFallback: {
      // Mirror Cloudflare Pages' clean-URL behavior so /trains → /trains.html
      // locally without refreshing prod. Keep the default SPA fallback too.
      rewrites: [
        { from: /^\/text$/, to: "/text.html" },
        { from: /^\/trains$/, to: "/trains.html" },
        { from: /^\/draw$/, to: "/draw.html" },
        { from: /^\/tasks$/, to: "/tasks.html" },
      ],
    },
    setupMiddlewares: function (middlewares, devServer) {
      console.log(
        "------------------------------------------------------------"
      );
      console.log(devServer.options.host);
      const port = devServer.options.port;
      const https = devServer.options.https ? "s" : "";
      const domain1 = `http${https}://${devServer.options.host}:${port}`;
      const domain2 = `http${https}://localhost:${port}`;

      console.log(
        `Project running at:\n  - ${infoColor(domain1)}\n  - ${infoColor(
          domain2
        )}`
      );

      return middlewares;
    },
  },
});
