const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const packageVersion = require('./package.json').version;

const appName = 'importKmlZones';

module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';

  return {
    mode: argv.mode || 'production',
    entry: { bundle: path.resolve(__dirname, 'src/app/index.js') },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: `[name]-${packageVersion}.js`,
      assetModuleFilename: 'assets/[name][ext]',
      clean: true
    },
    optimization: {
      splitChunks: false,
      runtimeChunk: false
    },
    resolve: {
      extensions: ['.js', '.jsx', '.json']
    },
    devtool: isDevelopment ? 'eval-source-map' : 'source-map',
    devServer: {
      static: { directory: path.resolve(__dirname, 'dist') },
      port: 3000,
      hot: false,
      devMiddleware: { writeToDisk: true }
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', { targets: { esmodules: true } }],
                ['@babel/preset-react', { runtime: 'automatic' }]
              ]
            }
          }
        },
        {
          test: /\.css$/i,
          use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader']
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif|woff|woff2|otf)$/i,
          type: 'asset/resource'
        }
      ]
    },
    plugins: [
      new MiniCssExtractPlugin({ filename: `styles-${packageVersion}.css` }),
      new HtmlWebpackPlugin({
        title: 'Import KML Zones',
        filename: `${appName}.html`,
        template: path.resolve(__dirname, 'src/app/importKmlZones.html'),
        inject: 'body',
        scriptLoading: 'blocking'
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: path.resolve(__dirname, 'src/app/images'), to: 'images' },
          { from: path.resolve(__dirname, 'app/example.kml'), to: 'example.kml' },
          { from: path.resolve(__dirname, 'src/config.json'), to: 'config.json' }
        ]
      })
    ]
  };
};
