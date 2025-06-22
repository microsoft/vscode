const path = require('path');

module.exports = {
  mode: 'production', // Change to 'development' for debugging
  entry: './src/webview/vaporview.ts', // Entry point
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.webview.json' // Specify the webview TypeScript config
          }
        },
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js'] // Resolve these extensions
  },
  output: {
    filename: 'vaporview.bundle.js', // Output file name
    path: path.resolve(__dirname, 'out/webview'), // Output directory
    clean: true
  },
  devtool: 'source-map' // Generate source maps
};