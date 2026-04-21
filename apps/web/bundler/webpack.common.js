const CopyWebpackPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCSSExtractPlugin = require("mini-css-extract-plugin");
const path = require("path");

module.exports = {
  entry: {
    main: path.resolve(__dirname, "../src/script.js"),
    tasks: path.resolve(__dirname, "../src/tasks.js"),
    draw: path.resolve(__dirname, "../src/draw.js"),
    text: path.resolve(__dirname, "../src/text.js"),
    trains: path.resolve(__dirname, "../src/trains.js"),
  },
  output: {
    hashFunction: "xxhash64",
    filename: "[name].bundle.[contenthash].js",
    path: path.resolve(__dirname, "../public"),
    publicPath: "/",
  },
  devtool: "source-map",
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, "../static") },
        { from: path.resolve(__dirname, "../content"), to: "content" }
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "../src/index.html"),
      filename: 'index.html',
      chunks: ['main'],
      minify: true,
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "../src/tasks.html"),
      filename: 'tasks.html',
      chunks: ['tasks'],
      minify: true,
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "../src/draw.html"),
      filename: 'draw.html',
      chunks: ['draw'],
      minify: true,
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "../src/text.html"),
      filename: 'text.html',
      chunks: ['text'],
      minify: true,
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "../src/trains.html"),
      filename: 'trains.html',
      chunks: ['trains'],
      minify: true,
    }),
    new MiniCSSExtractPlugin(),
  ],
  module: {
    rules: [
      // JS
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: ["babel-loader"],
      },
      // HTML
      {
        test: /\.(html)$/,
        use: ["html-loader"],
      },

      // GLSL
      {
        test: /\.(glsl|frag|vert)$/,
        use: [require.resolve("raw-loader"), require.resolve("glslify-loader")],
      },

      // CSS
      {
        test: /\.css$/,
        use: [MiniCSSExtractPlugin.loader, "css-loader"],
      },

      // Images
      {
        test: /\.(jpg|png|gif|svg|webp|avif)$/,
        type: "asset/resource",
        generator: {
          filename: "assets/images/[hash][ext]",
        },
      },

      // Files (pdf)
      {
        test: /\.(pdf)$/,
        type: "asset/resource",
        generator: {
          filename: "assets/[hash][ext]",
        },
      },

      // Fonts
      {
        test: /\.(ttf|eot|woff|woff2)$/,
        type: "asset/resource",
        generator: {
          filename: "assets/fonts/[hash][ext]",
        },
      },
    ],
  },
};
