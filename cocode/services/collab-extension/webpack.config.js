const path = require('path');
const webpack = require('webpack');

module.exports = {
	mode: 'production',
	target: 'webworker',
	entry: './src/extension.ts',
	output: {
		filename: 'extension.js',
		path: path.resolve(__dirname, 'dist'),
		libraryTarget: 'commonjs2'
	},
	resolve: {
		extensions: ['.ts', '.js'],
		fallback: {
			fs: false,
			path: false,
			os: false,
			net: false,
			tls: false,
			buffer: false,
			util: false
		}
	},
	externals: {
		vscode: 'commonjs vscode'
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: 'ts-loader',
				exclude: /node_modules/
			}
		]
	},
	plugins: [
		new webpack.DefinePlugin({
			'process.env': JSON.stringify({ NODE_ENV: 'production' })
		})
	],
	devtool: 'source-map'
};
